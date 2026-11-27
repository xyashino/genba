#!/bin/sh
# Install the prebuilt genba binary from a GitHub release. POSIX sh so `curl | sh` works.
# SHA256SUMS covers the release assets, not this script.
set -eu

RELEASES="https://github.com/xyashino/genba/releases"
if [ -n "${GENBA_VERSION:-}" ]; then
  DEFAULT_BASE="$RELEASES/download/$GENBA_VERSION"
else
  DEFAULT_BASE="$RELEASES/latest/download"
fi
BASE_URL="${GENBA_RELEASE_BASE_URL:-$DEFAULT_BASE}"
PREFIX="${PREFIX:-$HOME/.local}"

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64 | Linux-amd64) target=linux-x64 ;;
  Linux-aarch64 | Linux-arm64) target=linux-arm64 ;;
  Darwin-arm64) target=darwin-arm64 ;;
  *)
    echo "unsupported platform: $(uname -s) $(uname -m)" >&2
    exit 1
    ;;
esac

tmp="$(mktemp -d)"
trap 'rm -rf -- "${tmp:?}"' EXIT

for asset in "genba-$target" SHA256SUMS; do
  curl -fsSL -o "$tmp/$asset" "$BASE_URL/$asset"
done

cd "$tmp"
awk -v bin="genba-$target" '$2 == bin' SHA256SUMS > check.txt
if [ "$(wc -l < check.txt)" -ne 1 ]; then
  echo "SHA256SUMS has no entry for $target" >&2
  exit 1
fi
if command -v sha256sum >/dev/null 2>&1; then
  verify="sha256sum -c check.txt"
else
  verify="shasum -a 256 -c check.txt"
fi
$verify >/dev/null 2>&1 || {
  echo "checksum mismatch, nothing installed" >&2
  exit 1
}

bin_dir="$PREFIX/bin"
mkdir -p "$bin_dir"
cp "$tmp/genba-$target" "$bin_dir/genba.new"
chmod 0755 "$bin_dir/genba.new"
mv "$bin_dir/genba.new" "$bin_dir/genba"

echo "installed $bin_dir/genba"
case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) echo "add to PATH: export PATH=\"$bin_dir:\$PATH\"" ;;
esac
