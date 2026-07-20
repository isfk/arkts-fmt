# arkts-fmt

ArkTS 代码格式化工具 — 基于 [tree-sitter-arkts](https://github.com/harmony-contrib/tree-sitter-arkts) AST 解析。

## 安装

### 下载二进制

从 Releases 下载对应平台的 `arkts-fmt` 放到 PATH 即可。

### 自行构建

需要 [bun](https://bun.sh) 1.x：

```bash
git clone https://github.com/your-org/arkts-fmt.git
cd arkts-fmt
bash build.sh
```

产物为单文件二进制 `arkts-fmt`，无外部依赖。

## 用法

```bash
arkts-fmt check <file/dir>    # 检查格式（退出码 1 表示需格式化）
arkts-fmt write <file/dir>    # 格式化并写入
arkts-fmt diff  <file.ets>    # 显示格式化前后的 diff
arkts-fmt --help              # 帮助
```

### 示例

```bash
# 检查整个项目
arkts-fmt check src/

# 格式化单个文件
arkts-fmt write src/main/ets/pages/Home.ets

# CI 中检查（退出码会反映结果）
arkts-fmt check src/ || echo "需要格式化"
```

## 原理

1. 用 tree-sitter-arkts（WASM）解析 `.ets` 文件为 AST
2. 遍历 AST，为每行计算缩进级别（level-based stack）
3. 特殊处理 ArkUI DSL：`arkui_component_expression`、`arkui_children`、chain 调用
4. 输出格式化后的代码，仅修改缩进，不改变代码内容和顺序

## 已知局限

- import 内部成员不缩进（风格选择）
- array literal 跨行内容暂不缩进
- 仅支持 macOS ARM64（可自行构建其他平台）

## License

MIT
