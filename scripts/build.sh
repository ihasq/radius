#!/usr/bin/env bash
set -euo pipefail

# Radius バイナリビルドスクリプト
# bun compile を使用してスタンドアロンバイナリを生成

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$PROJECT_ROOT/dist"

cd "$PROJECT_ROOT"

echo "=== Radius Binary Build ==="
echo "Project root: $PROJECT_ROOT"
echo "Output directory: $OUTPUT_DIR"
echo ""

# 出力ディレクトリを作成
mkdir -p "$OUTPUT_DIR"

# CLIバイナリをビルド
echo "Building radius CLI binary..."
bun build src/cli/main.ts \
  --compile \
  --outfile "$OUTPUT_DIR/radius" \
  --target bun

# デーモンバイナリをビルド
echo "Building radiusd daemon binary..."
bun build src/daemon/main.ts \
  --compile \
  --outfile "$OUTPUT_DIR/radiusd" \
  --target bun

echo ""
echo "=== Build Complete ==="
ls -lh "$OUTPUT_DIR"
echo ""
echo "Install:"
echo "  sudo cp dist/radius dist/radiusd /usr/local/bin/"
echo ""
echo "Uninstall:"
echo "  sudo rm /usr/local/bin/radius /usr/local/bin/radiusd"
