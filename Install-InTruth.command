#!/bin/sh
# One-time user-level setup. No sudo, no credentials and no login secrets here.
set -eu
SOURCE_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
NODE_VERSION=24.22.1
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) TARGET=darwin-arm64; DIGEST=89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7 ;;
  Darwin-x86_64) TARGET=darwin-x64; DIGEST=d132557e7ee2b85af08b0c8c34338e65c6430f2238d01f727728ef42dc83b035 ;;
  Linux-aarch64) TARGET=linux-arm64; DIGEST=33c37be234ba8bee041961047b19160f4d7d0f164e8e246f78bdd10feff148b3 ;;
  Linux-x86_64) TARGET=linux-x64; DIGEST=eb6728e77c576a35162c122c45ccadf224d89ff00abc8dae46cc2897c6002d7c ;;
  *) echo 'Unsupported operating system/CPU.' >&2; exit 1 ;;
esac
case "$TARGET" in darwin-*) INSTALL_DIR="$HOME/Library/Application Support/InTruth" ;; *) INSTALL_DIR="$HOME/.local/share/intruth" ;; esac
RUNTIME_DIR="$INSTALL_DIR/runtime/node-v$NODE_VERSION-$TARGET"
if [ ! -x "$RUNTIME_DIR/bin/node" ]; then
  TEMP_DIR=$(mktemp -d)
  trap 'rm -rf "$TEMP_DIR"' EXIT HUP INT TERM
  ARCHIVE="$TEMP_DIR/node.tar.gz"
  curl --fail --show-error --location --proto '=https' --tlsv1.2 --retry 3 "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-$TARGET.tar.gz" -o "$ARCHIVE"
  if command -v sha256sum >/dev/null 2>&1; then ACTUAL=$(sha256sum "$ARCHIVE" | cut -d ' ' -f 1); else ACTUAL=$(shasum -a 256 "$ARCHIVE" | cut -d ' ' -f 1); fi
  [ "$ACTUAL" = "$DIGEST" ] || { echo 'Node.js checksum mismatch. Installation stopped.' >&2; exit 1; }
  mkdir -p "$INSTALL_DIR/runtime"
  tar -xzf "$ARCHIVE" -C "$INSTALL_DIR/runtime"
fi
export PATH="$RUNTIME_DIR/bin:$PATH"
"$RUNTIME_DIR/bin/node" "$SOURCE_DIR/scripts/install-helper.cjs"
printf '\nSetup complete. Load/reload realtime-factcheck in Chrome and open InTruth.\n'
