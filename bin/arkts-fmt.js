#!/usr/bin/env node
/**
 * arkts-fmt — ArkTS 代码格式化工具 CLI 入口
 */
const { main } = require("../src/cli");
main().catch((err) => {
	console.error("❌ fatal:", err.message);
	process.exit(1);
});
