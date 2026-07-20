/**
 * arkts-fmt — ArkTS 代码格式化引擎
 *
 * 基于 tree-sitter-arkts WASM 解析 AST，按缩进级别逐行格式化。
 * 支持 @ComponentV2 struct、ArkUI DSL builder 链等 ArkTS 特有语法。
 */

const path = require("path");
const fs = require("fs");

// 内嵌 WASM（自包含二进制构建使用）
let arktsWasmBuffer = null;
try {
	arktsWasmBuffer = require("./wasm_inline").arktsWasmBuffer;
} catch (_) {
	// 开发模式：从文件读取
}

// ── 块结构类型：内部内容需要 +1 级缩进 ──
const BLOCK_TYPES = new Set([
	"statement_block",
	"struct_body",
	"class_body",
	"object",
	"object_type",
	"array",
	"enum_body",
	"interface_body",
	"template_substitution",
	"template_type",
	"arrow_function",
]);

/**
 * 格式化 ArkTS 代码
 * @param {string} code - 原始 ArkTS 源码
 * @param {number} indentSize - 缩进空格数（默认 2）
 * @param {object} [parser] - 外部传入已初始化的 parser（复用）
 * @returns {Promise<string>} 格式化后的代码
 */
async function format(code, indentSize = 2, parser) {
	const Parser = parser || (await createParser());
	const tree = Parser.parse(code);
	const lines = code.split("\n");
	const lineLevel = new Array(lines.length).fill(null);

	walk(tree.rootNode, [0]);

	// 根据 level 生成缩进后的行
	return lines
		.map((line, i) => {
			const trimmed = line.trimEnd();
			if (!trimmed.trim()) return "";
			const level = lineLevel[i];
			if (level !== null && level >= 0) {
				return " ".repeat(level * indentSize) + trimmed.trimStart();
			}
			return trimmed;
		})
		.join("\n");

	// ── AST 遍历与缩进计算 ──
	function walk(node, stack) {
		if (!node) return;

		const SL = node.startPosition.row;
		const EL = node.endPosition.row;
		const type = node.type;
		const currentLevel = stack[stack.length - 1];

		// 设置当前节点首行的缩进级别（不覆盖更大的值）
		if (lineLevel[SL] === null || currentLevel > lineLevel[SL]) {
			lineLevel[SL] = currentLevel;
		}

		// ── 单行节点：不修改其他行，直接递归 ──
		if (SL === EL) {
			for (let c = node.firstChild; c; c = c.nextSibling) {
				walk(c, [...stack]);
			}
			return;
		}

		// ── 跨行块结构（{ 内容 }） ──
		if (BLOCK_TYPES.has(type)) {
			for (let l = SL + 1; l < EL; l++) {
				if (lineLevel[l] === null) lineLevel[l] = currentLevel + 1;
			}
			for (let c = node.firstChild; c; c = c.nextSibling) {
				if (["{", "}", "(", ")"].includes(c.type)) {
					walk(c, stack);
				} else if (c.type === "statement_block" && type === "arrow_function") {
					walk(c, stack);
				} else {
					walk(c, [...stack, currentLevel + 1]);
				}
			}
			return;
		}

		// ── 跨行 arkui_children（Column() { 内容 }） ──
		if (type === "arkui_children") {
			for (let l = SL + 1; l < EL; l++) {
				if (lineLevel[l] === null) lineLevel[l] = currentLevel + 1;
			}
			for (let c = node.firstChild; c; c = c.nextSibling) {
				if (["{", "}"].includes(c.type)) {
					walk(c, stack);
				} else {
					walk(c, [...stack, currentLevel + 1]);
				}
			}
			return;
		}

		// ── 跨行 ArkUI 组件表达式（Component() { ... }.chain1().chain2()） ──
		if (type === "arkui_component_expression") {
			let childrenNode = null;
			for (let c = node.firstChild; c; c = c.nextSibling) {
				if (c.type === "arkui_children") {
					childrenNode = c;
					break;
				}
			}
			if (childrenNode) {
				// chain 调用（.xxx()）与组件同级
				for (let l = childrenNode.endPosition.row + 1; l <= EL; l++) {
					if (lineLevel[l] === null) lineLevel[l] = currentLevel;
				}
			}
			for (let c = node.firstChild; c; c = c.nextSibling) {
				if (c.type === "arkui_children") {
					walk(c, stack);
				} else {
					walk(c, [...stack]);
				}
			}
			return;
		}

		// ── 跨行 arguments/parameters（多行函数参数缩进） ──
		if (
			["arguments", "formal_parameters", "type_arguments"].includes(type) &&
			EL > SL
		) {
			for (let l = SL + 1; l < EL; l++) {
				if (lineLevel[l] === null) lineLevel[l] = currentLevel + 1;
			}
		}

		// 默认递归：子节点继承当前缩进
		for (let c = node.firstChild; c; c = c.nextSibling) {
			walk(c, [...stack]);
		}
	}
}

/**
 * 创建并初始化 tree-sitter-arkts parser（WASM）
 * 优先使用内嵌 WASM（编译后二进制），其次从文件读取（开发模式）
 * @returns {Promise<object>} 初始化后的 Parser 实例
 */
async function createParser() {
	const wt = require("web-tree-sitter");
	await wt.Parser.init();
	const parser = new wt.Parser();

	let wasmBytes;
	if (arktsWasmBuffer) {
		// 内嵌模式（生产二进制）
		wasmBytes = arktsWasmBuffer();
	} else {
		// 开发模式：从文件读取
		const wasmPath = path.join(__dirname, "..", "tree-sitter-arkts.wasm");
		wasmBytes = fs.readFileSync(wasmPath);
	}

	const lang = await wt.Language.load(wasmBytes);
	parser.setLanguage(lang);

	return parser;
}

module.exports = { format, createParser };
