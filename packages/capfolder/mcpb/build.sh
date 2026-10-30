#!/bin/sh
# Builds capfolder.mcpb for Claude Desktop: one self-contained dist/cli.js (everything bundled, no node_modules) + manifest.json, zipped.
set -e
cd "$(dirname "$0")/.."
rm -rf .mcpb-build capfolder.mcpb
mkdir -p .mcpb-build/dist
esbuild src/cli.ts --bundle --platform=node --format=esm --target=node22 --outfile=.mcpb-build/dist/cli.js \
  --banner:js='#!/usr/bin/env node
import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);'
cp mcpb/manifest.json .mcpb-build/manifest.json
(cd .mcpb-build && zip -qr ../capfolder.mcpb manifest.json dist)
rm -rf .mcpb-build
echo "built capfolder.mcpb"
