#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")
VSIX="dist/${NAME}-${VERSION}.vsix"

mkdir -p dist

echo "==> Compiling TypeScript..."
npm run compile

echo "==> Packaging extension..."
npx vsce package --out dist/ --no-dependencies

echo "==> Installing ${VSIX} into VSCode..."
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --install-extension "$VSIX"

echo ""
echo "Done. Reload VSCode to activate the new version: Cmd+Shift+P → Reload Window"
