/**
 * arkts-fmt CLI — ArkTS 代码格式化命令行工具
 *
 * 用法：
 *   arkts-fmt write [file/dir...]   格式化并写入
 *   arkts-fmt check [file/dir...]   只检查，输出需要格式化的文件
 *   arkts-fmt diff  [file/dir...]   输出 diff
 */

const fs = require("fs");
const path = require("path");
const { format, createParser } = require("./format");

const INDENT_SIZE = 2;

/**
 * 查找目录下所有 .ets 文件
 */
function findEtsFiles(dir) {
	const results = [];
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			// 跳过 node_modules、oh_modules、build
			if (
				[
					"node_modules",
					"oh_modules",
					"build",
					".preview",
					".git",
					".hvigor",
				].includes(entry.name)
			)
				continue;
			results.push(...findEtsFiles(fullPath));
		} else if (entry.name.endsWith(".ets")) {
			results.push(fullPath);
		}
	}
	return results;
}

/**
 * 解析文件参数（文件或目录）
 */
function resolveTargets(args) {
	const files = [];
	for (const arg of args) {
		const stat = fs.statSync(arg);
		if (stat.isDirectory()) {
			files.push(...findEtsFiles(arg));
		} else if (arg.endsWith(".ets")) {
			files.push(arg);
		}
	}
	return files;
}

/**
 * 格式化单个文件，返回 { path, original, formatted, changed }
 */
async function formatFile(filePath, parser) {
	const code = fs.readFileSync(filePath, "utf8");
	const formatted = await format(code, INDENT_SIZE, parser);
	return {
		path: filePath,
		original: code,
		formatted,
		changed: code !== formatted,
	};
}

/**
 * CLI 主入口
 */
async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0 || ["-h", "--help"].includes(args[0])) {
		console.log(`
arkts-fmt — ArkTS 代码格式化工具

用法:
  arkts-fmt write [file/dir...]   格式化并写入文件
  arkts-fmt check [file/dir...]   只检查，列出需要格式化的文件
  arkts-fmt diff  [file/dir...]   输出格式化 diff

选项:
  -h, --help     显示帮助

示例:
  arkts-fmt write src/
  arkts-fmt check src/main/ets/
  arkts-fmt diff  quote/src/main/ets/views/chart_container.ets
`);
		process.exit(0);
	}

	const command = args[0];
	const targetArgs = args.slice(1);

	if (!["write", "check", "diff"].includes(command)) {
		console.error(`❌ 未知命令: ${command}。可用: write, check, diff`);
		process.exit(1);
	}

	// 收集目标文件
	const cwd = process.cwd();
	const targets =
		targetArgs.length > 0
			? resolveTargets(targetArgs.map((a) => path.resolve(cwd, a)))
			: findEtsFiles(cwd);

	if (targets.length === 0) {
		console.log("📭 没有找到 .ets 文件");
		process.exit(0);
	}

	console.log(`🔍 扫描到 ${targets.length} 个 .ets 文件`);

	// 初始化 parser
	const parser = await createParser();

	// 逐个处理文件
	let changedCount = 0;
	let errorCount = 0;

	for (const file of targets) {
		try {
			const result = await formatFile(file, parser);
			if (result.changed) {
				changedCount++;

				if (command === "write") {
					fs.writeFileSync(file, result.formatted, "utf8");
					console.log(`  ✅ ${path.relative(cwd, file)} — 已格式化`);
				} else if (command === "check") {
					console.log(`  ⚠️  ${path.relative(cwd, file)} — 需要格式化`);
				} else if (command === "diff") {
					const relPath = path.relative(cwd, file);
					console.log(`\n📋 ${relPath}:`);
					showDiff(result.original, result.formatted);
				}
			}
		} catch (err) {
			errorCount++;
			console.error(`  ❌ ${path.relative(cwd, file)} — ${err.message}`);
		}
	}

	// 汇总
	console.log("");
	if (command === "write") {
		console.log(
			changedCount > 0
				? `✨ ${changedCount} 个文件已格式化`
				: `✅ 所有文件格式正确`,
		);
	} else if (command === "check") {
		if (changedCount === 0) {
			console.log("✅ 所有文件格式正确");
		} else {
			console.log(
				`⚠️  ${changedCount} 个文件需要格式化（运行 arkts-fmt write 修复）`,
			);
			process.exit(1);
		}
	}

	if (errorCount > 0) {
		console.error(`❌ ${errorCount} 个文件处理失败`);
		process.exit(1);
	}
}

/**
 * 输出彩色 diff（简化版）
 */
function showDiff(original, formatted) {
	const origLines = original.split("\n");
	const fmtLines = formatted.split("\n");
	let diffCount = 0;

	for (let i = 0; i < Math.max(origLines.length, fmtLines.length); i++) {
		if (origLines[i] !== fmtLines[i]) {
			diffCount++;
			if (diffCount <= 20) {
				const lineNum = (i + 1).toString().padStart(4);
				if (origLines[i] !== undefined) {
					console.log(`  ${lineNum} - ${origLines[i]}`);
				}
				if (fmtLines[i] !== undefined) {
					console.log(`  ${lineNum} + ${fmtLines[i]}`);
				}
			}
		}
	}

	if (diffCount > 20) {
		console.log(`  ... 以及 ${diffCount - 20} 处更多差异`);
	}
	console.log(`  共 ${diffCount} 处差异`);
}

module.exports = { main };
