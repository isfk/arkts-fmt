use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process;

use tree_sitter::{Node, Parser};

const INDENT_SIZE: usize = 2;
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "oh_modules",
    "build",
    ".preview",
    ".git",
    ".hvigor",
    "target",
];

fn main() {
    if let Err(err) = run() {
        eprintln!("❌ fatal: {err}");
        process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().skip(1).collect();

    if args.is_empty() || matches!(args[0].as_str(), "-h" | "--help") {
        print_help();
        return Ok(());
    }

    let command = args[0].as_str();
    if !matches!(command, "write" | "check" | "diff") {
        eprintln!("❌ 未知命令: {command}。可用: write, check, diff");
        process::exit(1);
    }

    let cwd = env::current_dir()?;
    let targets = if args.len() > 1 {
        let paths = args[1..]
            .iter()
            .map(|arg| absolutize(&cwd, arg))
            .collect::<Vec<_>>();
        resolve_targets(&paths)?
    } else {
        find_ets_files(&cwd)?
    };

    if targets.is_empty() {
        println!("📭 没有找到 .ets 文件");
        return Ok(());
    }

    println!("🔍 扫描到 {} 个 .ets 文件", targets.len());

    let mut parser = create_parser()?;
    let mut changed_count = 0usize;
    let mut error_count = 0usize;

    for file in targets {
        match format_file(&file, &mut parser) {
            Ok(result) => {
                if result.changed {
                    changed_count += 1;
                    let rel_path = display_path(&cwd, &result.path);

                    match command {
                        "write" => {
                            fs::write(&result.path, result.formatted)?;
                            println!("  ✅ {rel_path} — 已格式化");
                        }
                        "check" => {
                            println!("  ⚠️  {rel_path} — 需要格式化");
                        }
                        "diff" => {
                            println!("\n📋 {rel_path}:");
                            show_diff(&result.original, &result.formatted);
                        }
                        _ => unreachable!(),
                    }
                }
            }
            Err(err) => {
                error_count += 1;
                eprintln!("  ❌ {} — {err}", display_path(&cwd, &file));
            }
        }
    }

    println!();
    match command {
        "write" => {
            if changed_count > 0 {
                println!("✨ {changed_count} 个文件已格式化");
            } else {
                println!("✅ 所有文件格式正确");
            }
        }
        "check" => {
            if changed_count == 0 {
                println!("✅ 所有文件格式正确");
            } else {
                println!("⚠️  {changed_count} 个文件需要格式化（运行 arkts-fmt write 修复）");
            }
        }
        "diff" => {}
        _ => unreachable!(),
    }

    if error_count > 0 {
        eprintln!("❌ {error_count} 个文件处理失败");
    }

    if error_count > 0 || (command == "check" && changed_count > 0) {
        process::exit(1);
    }

    Ok(())
}

fn print_help() {
    println!(
        r#"
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
"#
    );
}

fn create_parser() -> Result<Parser, Box<dyn std::error::Error>> {
    let mut parser = Parser::new();
    let language = tree_sitter_arkts::LANGUAGE;
    parser.set_language(&language.into())?;
    Ok(parser)
}

struct FormatResult {
    path: PathBuf,
    original: String,
    formatted: String,
    changed: bool,
}

fn format_file(
    path: &Path,
    parser: &mut Parser,
) -> Result<FormatResult, Box<dyn std::error::Error>> {
    let original = fs::read_to_string(path)?;
    let formatted = format_code(&original, INDENT_SIZE, parser)?;
    let changed = original != formatted;

    Ok(FormatResult {
        path: path.to_path_buf(),
        original,
        formatted,
        changed,
    })
}

fn format_code(
    code: &str,
    indent_size: usize,
    parser: &mut Parser,
) -> Result<String, Box<dyn std::error::Error>> {
    let tree = parser
        .parse(code, None)
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "解析 ArkTS 失败"))?;

    let lines = code.split('\n').collect::<Vec<_>>();
    let mut line_levels = vec![None; lines.len()];

    walk(tree.root_node(), 0, &mut line_levels);

    let formatted = lines
        .iter()
        .enumerate()
        .map(|(index, line)| {
            let trimmed_end = line.trim_end();
            if trimmed_end.trim().is_empty() {
                String::new()
            } else if let Some(level) = line_levels[index] {
                format!(
                    "{}{}",
                    " ".repeat(level * indent_size),
                    trimmed_end.trim_start()
                )
            } else {
                trimmed_end.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    Ok(formatted)
}

fn walk(node: Node, current_level: usize, line_levels: &mut [Option<usize>]) {
    let start_line = node.start_position().row;
    let end_line = node.end_position().row;
    let node_type = node.kind();

    if let Some(slot) = line_levels.get_mut(start_line) {
        if slot.is_none_or(|level| current_level > level) {
            *slot = Some(current_level);
        }
    }

    if start_line == end_line {
        walk_children(node, current_level, line_levels);
        return;
    }

    if is_block_type(node_type) {
        fill_unset_levels(line_levels, start_line + 1, end_line, current_level + 1);

        for child in children(node) {
            let child_type = child.kind();
            // 括号/花括号保持当前层级
            if matches!(child_type, "{" | "}" | "(" | ")") {
                walk(child, current_level, line_levels);
            // 与父节点同行的子节点（如 arrow_function 的参数）保持当前层级
            } else if child.start_position().row == start_line {
                walk(child, current_level, line_levels);
            // arrow_function 的 body（statement_block 或 object）保持当前层级
            } else if matches!(child_type, "statement_block" | "object")
                && node_type == "arrow_function"
            {
                walk(child, current_level, line_levels);
            } else {
                walk(child, current_level + 1, line_levels);
            }
        }
        return;
    }

    if node_type == "arkui_children" {
        fill_unset_levels(line_levels, start_line + 1, end_line, current_level + 1);

        for child in children(node) {
            if matches!(child.kind(), "{" | "}") {
                walk(child, current_level, line_levels);
            } else {
                walk(child, current_level + 1, line_levels);
            }
        }
        return;
    }

    if node_type == "arkui_component_expression" {
        let children_node = children(node)
            .into_iter()
            .find(|child| child.kind() == "arkui_children");

        if let Some(children_node) = children_node {
            for line in (children_node.end_position().row + 1)..=end_line {
                if let Some(slot) = line_levels.get_mut(line) {
                    if slot.is_none() {
                        *slot = Some(current_level);
                    }
                }
            }
        }

        for child in children(node) {
            walk(child, current_level, line_levels);
        }
        return;
    }

    if matches!(
        node_type,
        "arguments" | "formal_parameters" | "type_arguments"
    ) {
        fill_unset_levels(line_levels, start_line + 1, end_line, current_level + 1);
    }

    walk_children(node, current_level, line_levels);
}

fn walk_children(node: Node, current_level: usize, line_levels: &mut [Option<usize>]) {
    for child in children(node) {
        walk(child, current_level, line_levels);
    }
}

fn children(node: Node) -> Vec<Node> {
    let mut cursor = node.walk();
    node.children(&mut cursor).collect()
}

fn fill_unset_levels(
    line_levels: &mut [Option<usize>],
    start_inclusive: usize,
    end_exclusive: usize,
    level: usize,
) {
    let end = end_exclusive.min(line_levels.len());
    for slot in line_levels.iter_mut().take(end).skip(start_inclusive) {
        if slot.is_none() {
            *slot = Some(level);
        }
    }
}

fn is_block_type(node_type: &str) -> bool {
    matches!(
        node_type,
        "statement_block"
            | "struct_body"
            | "class_body"
            | "object"
            | "object_type"
            | "array"
            | "enum_body"
            | "interface_body"
            | "template_substitution"
            | "template_type"
            | "arrow_function"
            | "named_imports"
    )
}

fn find_ets_files(dir: &Path) -> io::Result<Vec<PathBuf>> {
    let mut results = Vec::new();
    collect_ets_files(dir, &mut results)?;
    Ok(results)
}

fn collect_ets_files(dir: &Path, results: &mut Vec<PathBuf>) -> io::Result<()> {
    let mut entries = fs::read_dir(dir)?.collect::<Result<Vec<_>, _>>()?;
    entries.sort_by_key(|entry| entry.path());

    for entry in entries {
        let path = entry.path();
        let file_type = entry.file_type()?;

        if file_type.is_dir() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if SKIP_DIRS.contains(&name.as_ref()) {
                continue;
            }
            collect_ets_files(&path, results)?;
        } else if path.extension().is_some_and(|extension| extension == "ets") {
            results.push(path);
        }
    }

    Ok(())
}

fn resolve_targets(args: &[PathBuf]) -> io::Result<Vec<PathBuf>> {
    let mut files = Vec::new();

    for arg in args {
        let stat = fs::metadata(arg)?;
        if stat.is_dir() {
            files.extend(find_ets_files(arg)?);
        } else if arg.extension().is_some_and(|extension| extension == "ets") {
            files.push(arg.clone());
        }
    }

    Ok(files)
}

fn show_diff(original: &str, formatted: &str) {
    let original_lines = original.split('\n').collect::<Vec<_>>();
    let formatted_lines = formatted.split('\n').collect::<Vec<_>>();
    let max_len = original_lines.len().max(formatted_lines.len());
    let mut diff_count = 0usize;

    for index in 0..max_len {
        let original_line = original_lines.get(index).copied();
        let formatted_line = formatted_lines.get(index).copied();

        if original_line != formatted_line {
            diff_count += 1;
            if diff_count <= 20 {
                let line_num = format!("{:>4}", index + 1);
                if let Some(line) = original_line {
                    println!("  {line_num} - {line}");
                }
                if let Some(line) = formatted_line {
                    println!("  {line_num} + {line}");
                }
            }
        }
    }

    if diff_count > 20 {
        println!("  ... 以及 {} 处更多差异", diff_count - 20);
    }
    println!("  共 {diff_count} 处差异");
}

fn absolutize(cwd: &Path, arg: &str) -> PathBuf {
    let path = PathBuf::from(arg);
    if path.is_absolute() {
        path
    } else {
        cwd.join(path)
    }
}

fn display_path(cwd: &Path, path: &Path) -> String {
    path.strip_prefix(cwd).unwrap_or(path).display().to_string()
}
