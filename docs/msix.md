# Windows MSIX (Microsoft Store)

Pdeffy ships a classic Win32 desktop app (Tauri). For the Microsoft Store we package the same `Pdeffy.exe` + runtime resources as an **unsigned** `.msix` using `MakeAppx.exe` on the Windows CI runner.

The existing **MSI / NSIS** installers are unchanged. Store upload is **not** automated yet.

## Pipeline

1. Job `build` on `windows-latest` runs the usual Tauri build (MSI/NSIS via `bundle.targets: all`).
2. Step **Package Windows MSIX (Store)** runs `scripts/package-msix.ps1` against `src-tauri/target/release`.
3. Script writes `src-tauri/target/release/bundle/msix/Pdeffy-<semver>-x64.msix`.
4. Artifact upload already includes `bundle/**/*`, so the MSIX is in `installer-windows-latest`.
5. On tags `v2.*`, the `release` job renames/uploads `Pdeffy-<version>-x64.msix` onto the GitHub Release next to MSI/DMG.

Version mapping: tag `v2.0.0` → MSIX Identity `Version="2.0.0.0"` (MAJOR.MINOR.BUILD.REVISION).

## Partner Center values (required before Store submission)

Do **not** use the Tauri identifier `com.reindal.pdeffy` as the Store package identity.

In [Partner Center](https://partner.microsoft.com/) → your app → **Product identity**, copy:

| Partner Center field | Placeholder in repo | Where to put it |
|----------------------|---------------------|-----------------|
| Package/Identity Name | `MICROSOFT_PACKAGE_IDENTITY_NAME` | `src-tauri/windows/msix/identity.placeholders.json` → `packageIdentityName`, **or** secret `MSIX_PACKAGE_IDENTITY_NAME` |
| Publisher (CN=…) | `CN=MICROSOFT_PUBLISHER` | same file → `publisher`, **or** secret `MSIX_PUBLISHER` |
| Publisher display name | `MICROSOFT_PUBLISHER_DISPLAY_NAME` | same file → `publisherDisplayName`, **or** secret `MSIX_PUBLISHER_DISPLAY_NAME` |

Template: `src-tauri/windows/msix/AppxManifest.xml.template`  
CI substitutes placeholders at pack time. Prefer **GitHub Secrets** on the public repo so real Store IDs are not committed.

Public display name in the manifest is fixed to **Pdeffy**.

## GitHub Secrets

### Identity (recommended for CI / Store packages)

| Secret | Example shape | Required? |
|--------|---------------|-----------|
| `MSIX_PACKAGE_IDENTITY_NAME` | value from Partner Center | Before Store submit |
| `MSIX_PUBLISHER` | `CN=…` from Partner Center | Before Store submit |
| `MSIX_PUBLISHER_DISPLAY_NAME` | e.g. company name | Before Store submit |

Empty secrets fall back to the placeholders file (fine for packing unsigned CI artifacts; **not** valid for Store acceptance).

### Optional signing (sideload / internal QA only)

Microsoft Store packages are typically uploaded **unsigned**; Partner Center signs them. For local install / enterprise sideload you may set:

| Secret | Content |
|--------|---------|
| `MSIX_SIGNING_CERT` | Base64-encoded `.pfx` |
| `MSIX_SIGNING_CERT_PASSWORD` | PFX password |

If `MSIX_SIGNING_CERT` is unset, the **Sign MSIX** step is skipped.

**Never** commit certificates or passwords to the repository.

## Test the Action

1. Push to `dev` / `main`, or run **Build Pdeffy App** via `workflow_dispatch`.
2. Open the Windows job → confirm **Package Windows MSIX (Store)** succeeded.
3. Download artifact `installer-windows-latest` and look under `msix/Pdeffy-*-x64.msix`.
4. For a release: tag `v2.x.y` on `main` and verify the Release asset `Pdeffy-<version>-x64.msix`.

## Local packaging (Windows + SDK)

Prerequisites: Windows 10/11, [Windows SDK](https://developer.microsoft.com/windows/downloads/windows-sdk/) (`MakeAppx.exe`), a completed Tauri build (`npm run build`).

```powershell
# from repo root, after tauri build
.\scripts\package-msix.ps1 `
  -ReleaseDir "src-tauri\target\release" `
  -OutDir "src-tauri\target\release\bundle\msix" `
  -Version "v2.0.0"
```

Optional overrides:

```powershell
$env:MSIX_PACKAGE_IDENTITY_NAME = "<from Partner Center>"
$env:MSIX_PUBLISHER = "CN=<from Partner Center>"
$env:MSIX_PUBLISHER_DISPLAY_NAME = "<from Partner Center>"
```

## Validate the package locally

```powershell
# Structure (ZIP): must contain AppxManifest.xml and Pdeffy.exe
Expand-Archive -Path .\Pdeffy-2.0.0-x64.msix -DestinationPath .\msix-extract -Force
# or rename to .zip and open

# If Windows SDK installed:
Get-AppxPackageManifest -Path .\msix-extract\AppxManifest.xml   # PowerShell helper varies by SKU
# Official checker (install separately if needed):
#   https://learn.microsoft.com/windows/msix/package/package-editor
#   MakeAppx.exe unpack /p Pdeffy-2.0.0-x64.msix /d .\unpacked
```

For Store submission, also run the [Windows App Certification Kit](https://learn.microsoft.com/windows/uwp/debug-test-perf/windows-app-certification-kit) against the built package when you have real Identity values.

## Manual steps before Microsoft Store publish

1. Create / reserve the app name **Pdeffy** in Partner Center.
2. Copy Package/Identity Name, Publisher, Publisher display name into secrets or `identity.placeholders.json`.
3. Rebuild so the MSIX Identity matches Partner Center **exactly**.
4. Confirm WebView2 / desktop bridge requirements for a full-trust Win32 app in your Store listing age.
5. Upload the `.msix` manually in Partner Center (automation not configured).
6. Fill Store listing (screenshots, privacy policy, age rating, categories).
7. Complete certification / submission.

## Architecture

- **x64 only** for now (`ProcessorArchitecture="x64"`), matching current Windows CI.
- Capability: `runFullTrust` only (desktop Win32 packaged as MSIX).
- Entry point: `Windows.FullTrustApplication`.
