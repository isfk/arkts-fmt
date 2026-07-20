#!/bin/bash
# build.sh — 构建 arkts-fmt 自包含二进制
# 用法: bash build.sh [output_path]
#
# 输出: arkts-fmt (单文件二进制，约 7MB)
# 依赖: bun

set -euo pipefail
cd "$(dirname "$0")"

OUTPUT="${1:-./arkts-fmt}"

echo "📦 构建 arkts-fmt..."

# 1. 生成 WASM 内联模块
echo "  🔧 编码 WASM..."
node -e "
const fs = require('fs');
const a = fs.readFileSync('tree-sitter-arkts.wasm').toString('base64');
const w = fs.readFileSync(require.resolve('web-tree-sitter/web-tree-sitter.wasm')).toString('base64');
fs.writeFileSync('src/wasm_inline.js', \`/**
 * 内嵌 WASM 模块 — 用于自包含二进制构建
 * 自动生成，勿手动修改
 */
const A = \"\${a}\";
const W = \"\${w}\";
module.exports = {
  arktsWasmBuffer: () => Buffer.from(A, 'base64'),
  webtsWasmBuffer: () => Buffer.from(W, 'base64'),
};
\`);
"

# 2. 编译
echo "  🔨 bun build --compile ..."
bun build --compile \
	--target=bun-darwin-arm64 \
	--outfile="$OUTPUT" \
	bin/arkts-fmt.js

# 3. 验证
if [ -f "$OUTPUT" ]; then
	SIZE=$(du -h "$OUTPUT" | cut -f1)
	echo "  ✅ 构建成功: $OUTPUT ($SIZE)"
	# 快速冒烟测试
	"$OUTPUT" --help >/dev/null 2>&1 && echo "  ✅ 冒烟测试通过" || echo "  ⚠️  冒烟测试失败"
else
	echo "  ❌ 构建失败"
	exit 1
fi
