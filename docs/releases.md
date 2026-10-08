# Releases and download URLs

Pdeffy publishes **semver-tagged** GitHub Releases with **stable asset names** so store submissions and docs can use fixed HTTPS links.

## URL pattern

```text
https://github.com/reindal/pdeffy/releases/download/<tag>/<asset-filename>
```

### Electron final (`v1.11.0-final`)

```text
https://github.com/reindal/pdeffy/releases/download/v1.11.0-final/Pdeffy-1.11.0-final-x64-setup.exe
https://github.com/reindal/pdeffy/releases/download/v1.11.0-final/Pdeffy-1.11.0-final-macos.dmg
https://github.com/reindal/pdeffy/releases/download/v1.11.0-final/Pdeffy-1.11.0-final-amd64.deb
```

Source code (auto-attached by GitHub when the release is created from a tag):

```text
https://github.com/reindal/pdeffy/archive/refs/tags/v1.11.0-final.zip
https://github.com/reindal/pdeffy/archive/refs/tags/v1.11.0-final.tar.gz
```

### Tauri 2.x (example `v2.0.0`)

```text
https://github.com/reindal/pdeffy/releases/download/v2.0.0/Pdeffy-2.0.0-x64-setup.exe
https://github.com/reindal/pdeffy/releases/download/v2.0.0/Pdeffy-2.0.0-x64.msi
https://github.com/reindal/pdeffy/releases/download/v2.0.0/Pdeffy-2.0.0-x64.msix
https://github.com/reindal/pdeffy/releases/download/v2.0.0/Pdeffy-2.0.0-macos.dmg
https://github.com/reindal/pdeffy/releases/download/v2.0.0/Pdeffy-2.0.0-amd64.deb
```

## Asset naming convention

`VERSION` is the tag without the leading `v` (e.g. tag `v1.11.0-final` → `1.11.0-final`).

| Platform | Filename |
|----------|----------|
| Windows x64 setup | `Pdeffy-{VERSION}-x64-setup.exe` |
| Windows x64 MSI (if built) | `Pdeffy-{VERSION}-x64.msi` |
| Windows x64 MSIX (Store) | `Pdeffy-{VERSION}-x64.msix` |
| macOS | `Pdeffy-{VERSION}-macos.dmg` |
| Linux deb | `Pdeffy-{VERSION}-amd64.deb` |
| Linux AppImage (if built) | `Pdeffy-{VERSION}-x86_64.AppImage` |

## Line policy

| Line | Tags | Branch | Stack |
|------|------|--------|--------|
| **1.x (frozen)** | `v1.*` (final: `v1.11.0-final`) | `release/1.x` | Electron |
| **2.x (current)** | `v2.*` | `main` / `dev` | Tauri |

- Do **not** use a rolling `latest` release for store URLs — always pin a tag.
- New 1.x fixes (if any): commit on `release/1.x`, tag `v1.11.1-final` (etc.), CI uploads assets to that tag.
- New 2.x: tag `v2.0.0` (etc.) on `main`; CI uploads Tauri installers with the same naming pattern.

## Store notes

- **Microsoft Store (MSIX):** built in the same Windows CI job as MSI; see [docs/msix.md](msix.md). Upload to Partner Center is still manual.
- GitHub MSI/DMG/EXE URLs remain the canonical **versioned direct-download** links for sideload and QA.
- Mac App Store packaging is not automated yet.
