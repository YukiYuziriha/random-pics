# Apt repository automation

This project can publish a signed apt repository to GitHub Pages whenever `src-tauri/Cargo.toml` version changes on `main` (and also on tagged releases).

Workflow job: `publish-apt` in `.github/workflows/release.yml`.

For manual re-publish of an existing version, use `workflow_dispatch` with:

- `version`: the target version
- `force_publish`: `true`

## One-time setup

1. Create a signing key pair used only for apt metadata.
2. Add private key to repository secret:
   - `APT_GPG_PRIVATE_KEY`
3. If the key has a passphrase, add:
   - `APT_GPG_PASSPHRASE`
4. Enable GitHub Pages for this repo:
   - Settings -> Pages
   - Source: `gh-pages` branch, root folder

The workflow writes repository files under:

- `gh-pages` branch
- `apt/` directory

## What gets published

- `apt/pool/main/random-pics_<version>_amd64.deb`
- `apt/dists/stable/main/binary-amd64/Packages`
- `apt/dists/stable/main/binary-amd64/Packages.gz`
- `apt/dists/stable/Release`
- `apt/dists/stable/Release.gpg`
- `apt/dists/stable/InRelease`
- `apt/keyrings/random-pics-archive-keyring.gpg`

## User install commands

```bash
curl -fsSL https://yukiyuziriha.github.io/random-pics/apt/keyrings/random-pics-archive-keyring.gpg \
  | sudo tee /usr/share/keyrings/random-pics-archive-keyring.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/random-pics-archive-keyring.gpg] https://yukiyuziriha.github.io/random-pics/apt stable main" \
  | sudo tee /etc/apt/sources.list.d/random-pics.list >/dev/null
sudo apt update
sudo apt install -y random-pics
```
