# AUR publish steps (`random-pics-bin`)

`yay -S random-pics-bin` only works after package is published to AUR.

## 1) Keep package files updated

Files in this repo:

- `packaging/aur/random-pics-bin/PKGBUILD`
- `packaging/aur/random-pics-bin/.SRCINFO`

For each new app release:

- bump `pkgver`
- update `.deb` URL
- update `.deb` sha256

## 2) Publish to AUR

```bash
git clone ssh://aur@aur.archlinux.org/random-pics-bin.git
cp packaging/aur/random-pics-bin/PKGBUILD random-pics-bin/
cp packaging/aur/random-pics-bin/.SRCINFO random-pics-bin/
cd random-pics-bin
makepkg --printsrcinfo > .SRCINFO
git add PKGBUILD .SRCINFO
git commit -m "update to 1.0.0"
git push
```
