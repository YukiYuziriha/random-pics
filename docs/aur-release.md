# AUR publish steps (`random-pics-bin`)

`yay -S random-pics-bin` only shows the newest version after AUR metadata is pushed.

## Automated flow (recommended)

This repo now includes `publish-aur` in `.github/workflows/release.yml`.

When `src-tauri/Cargo.toml` package version changes on `main` (or when a `v*` tag is pushed), the workflow will:

1. Download the matching `.deb` release asset.
2. Compute sha256.
3. Update `PKGBUILD` + `.SRCINFO` in the AUR repo.
4. Commit and push to `random-pics-bin` on AUR.

For manual re-publish of an existing version, use `workflow_dispatch` with:

- `version`: the target version
- `force_publish`: `true`

### Required GitHub secret

Add this repository secret before relying on automation:

- `AUR_SSH_PRIVATE_KEY`: private key for the AUR account with push access to `random-pics-bin`.

## Manual fallback

If automation is not configured yet, update and publish manually:

```bash
git clone ssh://aur@aur.archlinux.org/random-pics-bin.git
cp packaging/aur/random-pics-bin/PKGBUILD random-pics-bin/
cp packaging/aur/random-pics-bin/.SRCINFO random-pics-bin/
cd random-pics-bin
git add PKGBUILD .SRCINFO
git commit -m "update to 1.1.0"
git push
```
