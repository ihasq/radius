#!/usr/bin/env bash
set -euo pipefail

# Radius バイナリビルドスクリプト
# radiusd: 単一バイナリ (daemon + CLI logic via --exec)
# radius: シェルスクリプトラッパー

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

# デーモンバイナリをビルド (CLI機能も内包)
echo "Building radiusd binary (daemon + CLI via --exec)..."
bun build src/daemon/main.ts \
  --compile \
  --outfile "$OUTPUT_DIR/radiusd" \
  --target bun

# radiusシェルスクリプトを生成 (Unix)
echo "Generating radius shell script..."
cat > "$OUTPUT_DIR/radius" << 'EOF'
#!/bin/sh
# Get the directory where this script is located
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/radiusd" --exec "$@"
EOF
chmod +x "$OUTPUT_DIR/radius"

# radius.cmd を生成 (Windows)
echo "Generating radius.cmd..."
cat > "$OUTPUT_DIR/radius.cmd" << 'EOF'
@echo off
"%~dp0radiusd.exe" --exec %*
EOF

echo ""
echo "=== Build Complete ==="
ls -lh "$OUTPUT_DIR"
echo ""
echo "Install:"
echo "  sudo cp dist/radiusd /usr/local/bin/"
echo "  sudo cp dist/radius /usr/local/bin/"
echo ""
echo "Uninstall:"
echo "  sudo rm /usr/local/bin/radiusd /usr/local/bin/radius"
