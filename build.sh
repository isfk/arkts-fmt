#!/bin/bash
# build.sh — 构建 arkts-fmt Rust 原生二进制
# 用法: bash build.sh [output_path]

set -euo pipefail
cd "$(dirname "$0")"

OUTPUT="${1:-./arkts-fmt}"

echo "📦 构建 arkts-fmt Rust 版..."

cargo build --release
cp target/release/arkts-fmt "$OUTPUT"
chmod +x "$OUTPUT"

if [ -f "$OUTPUT" ]; then
	SIZE=$(du -h "$OUTPUT" | cut -f1)
	echo "  ✅ 构建成功: $OUTPUT ($SIZE)"
	"$OUTPUT" --help >/dev/null 2>&1 && echo "  ✅ 冒烟测试通过" || echo "  ⚠️  冒烟测试失败"
else
	echo "  ❌ 构建失败"
	exit 1
fi
