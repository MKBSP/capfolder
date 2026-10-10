#!/usr/bin/env sh
# Rebuilds src/ocf/schemas-1.2.0.json from the Open Cap Table Coalition repo at a pinned tag.
set -eu
TAG=v1.2.0
TMP=$(mktemp -d)
curl -sL "https://github.com/Open-Cap-Table-Coalition/Open-Cap-Format-OCF/archive/refs/tags/$TAG.tar.gz" | tar xz -C "$TMP"
ROOT="$TMP/Open-Cap-Format-OCF-${TAG#v}"
OUT="$(cd "$(dirname "$0")/../src/ocf" && pwd)"
find "$ROOT/schema" -name '*.schema.json' | sort | xargs jq -s '.' > "$OUT/schemas-1.2.0.json"
cp "$ROOT/LICENSE.md" "$OUT/OCF-LICENSE.md"
echo "$(jq length "$OUT/schemas-1.2.0.json") schemas written"
