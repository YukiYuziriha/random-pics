#!/usr/bin/env bash
set -euo pipefail

repo="YukiYuziriha/random-pics"
api_url="https://api.github.com/repos/${repo}/releases/latest"

release_json="$(curl -fsSL "$api_url")"

asset_info="$(python3 -c 'import json,sys
r=json.loads(sys.stdin.read())
assets=r.get("assets", [])
deb=[a for a in assets if a.get("name","" ).endswith("_amd64.deb")]
if not deb:
    raise SystemExit(1)
a=deb[0]
print(a.get("browser_download_url",""))
print(a.get("digest",""))
print(a.get("name",""))
' <<< "$release_json")"

deb_url="$(printf '%s\n' "$asset_info" | sed -n '1p')"
digest="$(printf '%s\n' "$asset_info" | sed -n '2p')"
deb_name="$(printf '%s\n' "$asset_info" | sed -n '3p')"

if [ -z "$deb_url" ] || [ -z "$deb_name" ]; then
  printf "Could not find .deb asset in latest release.\n" >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
deb_path="${tmp_dir}/${deb_name}"

printf "Downloading %s\n" "$deb_url"
curl -fL "$deb_url" -o "$deb_path"

if [ -n "$digest" ]; then
  expected="${digest#sha256:}"
  actual="$(sha256sum "$deb_path" | cut -d ' ' -f1)"
  if [ "$expected" != "$actual" ]; then
    printf "SHA256 mismatch. Expected %s, got %s\n" "$expected" "$actual" >&2
    exit 1
  fi
fi

printf "Installing %s\n" "$deb_name"
if [ "${EUID}" -eq 0 ]; then
  apt install -y "$deb_path"
else
  sudo apt install -y "$deb_path"
fi

printf "Done.\n"
