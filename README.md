# arkts-fmt

ArkTS 代码格式化工具 — 基于 native
[tree-sitter-arkts](https://github.com/harmony-contrib/tree-sitter-arkts) AST 解析。

## 安装

### 下载二进制

从 Releases 下载对应平台的 `arkts-fmt` 放到 PATH 即可。

### 自行构建

需要 Rust 工具链：

```bash
git clone git@github.com:isfk/arkts-fmt.git
cd arkts-fmt
bash build.sh
```

产物为单文件原生二进制 `arkts-fmt`，无 Node/Bun/WASM 运行时依赖。

## 用法

```bash
arkts-fmt check <file/dir>    # 检查格式（退出码 1 表示需格式化）
arkts-fmt write <file/dir>    # 格式化并写入
arkts-fmt diff  <file/dir>    # 显示格式化前后的 diff
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

## 格式规范

- 使用 2 个空格表示一个缩进层级，不使用 tab
- 多行 `import { ... }`、数组和对象的内容相对边界缩进一级
- ArkUI 组件 modifier 链相对组件调用缩进一级，连续 modifier 保持同级
- modifier 回调体、对象属性和普通 block 内容在各自锚点上再缩进一级
- 多行参数和跨行赋值表达式使用续行缩进，独占一行的闭合符回到对应调用或 block 的起始层级
- 多行 JSDoc 的 `*` 和 `*/` 比 `/**` 多一个空格
- 仅规范已有换行的缩进，不按行宽主动拆分单行表达式

## 原理

1. 用 native tree-sitter-arkts 解析 `.ets` 文件为 AST
2. 遍历 AST，为每行计算缩进级别和闭合符锚点
3. 特殊处理 ArkUI DSL、modifier 链、回调、参数、对象和赋值续行
4. 输出格式化后的代码，仅修改空白，不改变代码内容和顺序

## 测试

```bash
cargo test --locked
```

回归 fixture 覆盖 JSDoc、ArkUI modifier、回调闭合、嵌套控制流、跨行赋值、组件对象参数和嵌套手势。每个 fixture 同时验证快照、二次格式化幂等和仅空白变化。

## 已知局限

- 不根据最大行宽自动换行
- 不重排 import、对象属性或其他代码结构

## License

MIT
