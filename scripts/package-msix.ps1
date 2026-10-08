#Requires -Version 5.1
<#
.SYNOPSIS
  Build an unsigned MSIX package for Pdeffy (Win32 / full-trust) from a Tauri release output.

.DESCRIPTION
  - Reads version from -Version, or GITHUB_REF_NAME (v2.0.0 → 2.0.0.0), or package.json / tauri.conf.json
  - Identity placeholders from src-tauri/windows/msix/identity.placeholders.json
  - Overrides via env: MSIX_PACKAGE_IDENTITY_NAME, MSIX_PUBLISHER, MSIX_PUBLISHER_DISPLAY_NAME
  - Packages Pdeffy.exe + runtime resources next to it (ghostscript, icons, etc.)
  - Invokes MakeAppx.exe from the Windows 10/11 SDK on the machine

.PARAMETER ReleaseDir
  Directory containing Pdeffy.exe (default: src-tauri/target/release)

.PARAMETER OutDir
  Where to write the .msix (default: src-tauri/target/release/bundle/msix)
#>
param(
  [string]$ReleaseDir = "",
  [string]$OutDir = "",
  [string]$Version = "",
  [string]$RepoRoot = ""
)

$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
  param([string]$Hint)
  if ($Hint -and (Test-Path (Join-Path $Hint "package.json"))) { return (Resolve-Path $Hint).Path }
  if ($PSScriptRoot) {
    $candidate = Resolve-Path (Join-Path $PSScriptRoot "..")
    if (Test-Path (Join-Path $candidate "package.json")) { return $candidate.Path }
  }
  throw "Cannot locate repository root (package.json missing)."
}

function Get-SemVerFromText([string]$text) {
  if ($text -match '(\d+)\.(\d+)\.(\d+)') {
    return "$($Matches[1]).$($Matches[2]).$($Matches[3])"
  }
  return $null
}

function ConvertTo-MsixVersion([string]$semver) {
  $clean = $semver.Trim().TrimStart('v', 'V')
  if ($clean -match '^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?') {
    $rev = if ($Matches[4]) { $Matches[4] } else { "0" }
    return "$($Matches[1]).$($Matches[2]).$($Matches[3]).$rev"
  }
  throw "Cannot convert '$semver' to MSIX MAJOR.MINOR.BUILD.REVISION"
}

function Find-MakeAppx {
  $kits = @(
    "${env:ProgramFiles(x86)}\Windows Kits\10\bin",
    "${env:ProgramFiles}\Windows Kits\10\bin"
  )
  foreach ($root in $kits) {
    if (-not (Test-Path $root)) { continue }
    $found = Get-ChildItem -Path $root -Recurse -Filter "MakeAppx.exe" -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match '\\x64\\MakeAppx\.exe$' } |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($found) { return $found.FullName }
  }
  throw "MakeAppx.exe not found. Install Windows 10/11 SDK on this machine / runner."
}

function Copy-ScaledPng {
  param(
    [string]$Source,
    [string]$Dest,
    [int]$Width,
    [int]$Height
  )
  Add-Type -AssemblyName System.Drawing
  $img = [System.Drawing.Image]::FromFile((Resolve-Path $Source).Path)
  try {
    $bmp = New-Object System.Drawing.Bitmap $Width, $Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.Clear([System.Drawing.Color]::Transparent)
      # letterbox into target size preserving aspect ratio
      $scale = [Math]::Min($Width / $img.Width, $Height / $img.Height)
      $w = [int]($img.Width * $scale)
      $h = [int]($img.Height * $scale)
      $x = [int](($Width - $w) / 2)
      $y = [int](($Height - $h) / 2)
      $g.DrawImage($img, $x, $y, $w, $h)
      $dir = Split-Path $Dest -Parent
      if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
      $bmp.Save($Dest, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $g.Dispose()
      $bmp.Dispose()
    }
  } finally {
    $img.Dispose()
  }
}

$repoRoot = Resolve-RepoRoot -Hint $RepoRoot
if (-not $ReleaseDir) { $ReleaseDir = Join-Path $repoRoot "src-tauri\target\release" }
if (-not $OutDir) { $OutDir = Join-Path $repoRoot "src-tauri\target\release\bundle\msix" }

$exePath = Join-Path $ReleaseDir "Pdeffy.exe"
if (-not (Test-Path $exePath)) {
  throw "Pdeffy.exe not found in '$ReleaseDir'. Build the Tauri app first (npm run build)."
}

# --- Version ---
if (-not $Version) {
  if ($env:GITHUB_REF_NAME -and $env:GITHUB_REF_NAME -match '^v?\d+\.\d+\.\d+') {
    $Version = $env:GITHUB_REF_NAME
  } elseif ($env:MSIX_VERSION) {
    $Version = $env:MSIX_VERSION
  } else {
    $pkg = Get-Content (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
    $Version = $pkg.version
  }
}
$semver = (Get-SemVerFromText $Version)
if (-not $semver) { throw "Invalid version: $Version" }
$versionQuad = ConvertTo-MsixVersion $semver
Write-Host "MSIX version: $versionQuad (from $Version)"

# --- Identity ---
$identityPath = Join-Path $repoRoot "src-tauri\windows\msix\identity.placeholders.json"
$identity = Get-Content $identityPath -Raw | ConvertFrom-Json
$packageName = if ($env:MSIX_PACKAGE_IDENTITY_NAME) { $env:MSIX_PACKAGE_IDENTITY_NAME } else { $identity.packageIdentityName }
$publisher = if ($env:MSIX_PUBLISHER) { $env:MSIX_PUBLISHER } else { $identity.publisher }
$publisherDisplay = if ($env:MSIX_PUBLISHER_DISPLAY_NAME) { $env:MSIX_PUBLISHER_DISPLAY_NAME } else { $identity.publisherDisplayName }

if ($packageName -eq "MICROSOFT_PACKAGE_IDENTITY_NAME" -or $publisher -eq "CN=MICROSOFT_PUBLISHER") {
  Write-Warning @"
Using Partner Center placeholders for MSIX Identity.
Replace values in src-tauri/windows/msix/identity.placeholders.json
or set GitHub Secrets / env:
  MSIX_PACKAGE_IDENTITY_NAME
  MSIX_PUBLISHER
  MSIX_PUBLISHER_DISPLAY_NAME
before Store submission.
"@
}

# --- Staging ---
$stage = Join-Path $env:TEMP ("pdeffy-msix-" + [guid]::NewGuid().ToString("N"))
$assetsDir = Join-Path $stage "Assets"
New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null

Write-Host "Staging package from $ReleaseDir → $stage"

# Whitelist runtime payload only (avoid Cargo intermediates under target/release).
Copy-Item -Path $exePath -Destination (Join-Path $stage "Pdeffy.exe") -Force

Get-ChildItem -Path $ReleaseDir -File -Filter "*.dll" -ErrorAction SilentlyContinue | ForEach-Object {
  Copy-Item -Path $_.FullName -Destination (Join-Path $stage $_.Name) -Force
}

$ghostscript = Join-Path $ReleaseDir "ghostscript"
if (Test-Path $ghostscript) {
  Copy-Item -Path $ghostscript -Destination (Join-Path $stage "ghostscript") -Recurse -Force
}

foreach ($extra in @("pdf-document.ico", "pdf-document.png")) {
  $src = Join-Path $ReleaseDir $extra
  if (Test-Path $src) {
    Copy-Item -Path $src -Destination (Join-Path $stage $extra) -Force
  }
}

if (-not (Test-Path (Join-Path $stage "Pdeffy.exe"))) {
  throw "Staging failed: Pdeffy.exe missing in package root."
}

# Icons (reuse official Pdeffy Store assets)
$icons = Join-Path $repoRoot "src-tauri\icons"
$map = @{
  "StoreLogo.png"           = "StoreLogo.png"
  "Square44x44Logo.png"     = "Square44x44Logo.png"
  "Square71x71Logo.png"     = "Square71x71Logo.png"
  "Square150x150Logo.png"   = "Square150x150Logo.png"
  "Square310x310Logo.png"   = "Square310x310Logo.png"
}
foreach ($pair in $map.GetEnumerator()) {
  $src = Join-Path $icons $pair.Key
  if (-not (Test-Path $src)) { throw "Missing icon asset: $src" }
  Copy-Item $src (Join-Path $assetsDir $pair.Value) -Force
}

$masterIcon = Join-Path $icons "icon.png"
Copy-ScaledPng -Source $masterIcon -Dest (Join-Path $assetsDir "Wide310x150Logo.png") -Width 310 -Height 150
Copy-ScaledPng -Source $masterIcon -Dest (Join-Path $assetsDir "SplashScreen.png") -Width 620 -Height 300

# Manifest
$templatePath = Join-Path $repoRoot "src-tauri\windows\msix\AppxManifest.xml.template"
$manifest = Get-Content $templatePath -Raw -Encoding UTF8
$manifest = $manifest.
  Replace("{{PACKAGE_IDENTITY_NAME}}", $packageName).
  Replace("{{PUBLISHER}}", $publisher).
  Replace("{{PUBLISHER_DISPLAY_NAME}}", $publisherDisplay).
  Replace("{{VERSION_QUAD}}", $versionQuad)
$manifestPath = Join-Path $stage "AppxManifest.xml"
# MakeAppx expects UTF-8 (with or without BOM); write UTF-8 BOM for Windows tools
$utf8Bom = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllText($manifestPath, $manifest, $utf8Bom)

# Pack
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$msixName = "Pdeffy-$semver-x64.msix"
$msixPath = Join-Path $OutDir $msixName
if (Test-Path $msixPath) { Remove-Item $msixPath -Force }

$makeAppx = Find-MakeAppx
Write-Host "Using MakeAppx: $makeAppx"
& $makeAppx pack /d $stage /p $msixPath /o
if ($LASTEXITCODE -ne 0) { throw "MakeAppx failed with exit code $LASTEXITCODE" }

# Basic validation: package is a zip with AppxManifest.xml
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($msixPath)
try {
  $entryNames = $zip.Entries | ForEach-Object { $_.FullName }
  if (-not ($entryNames -contains "AppxManifest.xml")) {
    throw "MSIX validation failed: AppxManifest.xml missing inside package."
  }
  if (-not ($entryNames | Where-Object { $_ -eq "Pdeffy.exe" -or $_ -like "Pdeffy.exe" })) {
    # paths may use backslash in zip
    $hasExe = $false
    foreach ($n in $entryNames) {
      if ($n -replace '\\','/' -match '(^|/)Pdeffy\.exe$') { $hasExe = $true; break }
    }
    if (-not $hasExe) { throw "MSIX validation failed: Pdeffy.exe missing inside package." }
  }
  Write-Host "MSIX structure OK ($($entryNames.Count) entries)"
} finally {
  $zip.Dispose()
}

Write-Host "Created: $msixPath"
Write-Output $msixPath

# Cleanup staging
Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
