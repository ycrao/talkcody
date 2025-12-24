//! Tree-sitter Summarize Test Tool
//!
//! Usage:
//!   cargo run --example summarize_test                    # Use built-in example
//!   cargo run --example summarize_test -- path/to/file.ts # Test specific file

use std::env;
use std::fs;
use streaming_iterator::StreamingIterator;
use tree_sitter::{Language, Parser, Query, QueryCursor};

fn main() {
    let args: Vec<String> = env::args().collect();

    let (content, lang_id, file_name) = if args.len() > 1 {
        let path = &args[1];
        let content = fs::read_to_string(path).expect("Failed to read file");
        let lang_id = get_lang_from_path(path);
        let file_name = path.split('/').last().unwrap_or(path).to_string();
        (content, lang_id, file_name)
    } else {
        (get_example_code(), "typescript".to_string(), "example.ts".to_string())
    };

    println!("=== Tree-sitter Summarize Test ===");
    println!("Language: {}", lang_id);
    println!("File: {}", file_name);
    println!();

    let original_chars = content.len();
    let original_lines = content.lines().count();

    println!("--- Original Code ({} chars, {} lines) ---", original_chars, original_lines);
    // Show first 30 lines preview
    let preview_lines: Vec<&str> = content.lines().take(30).collect();
    for line in &preview_lines {
        println!("{}", line);
    }
    if original_lines > 30 {
        println!("... ({} more lines)", original_lines - 30);
    }
    println!();

    match summarize_code(&content, &lang_id) {
        Ok(summary) => {
            let summary_chars = summary.len();
            let summary_lines = summary.lines().count();

            println!("--- Summarized Code ({} chars, {} lines) ---", summary_chars, summary_lines);
            println!("{}", summary);
            println!();

            println!("--- Statistics ---");
            println!("Original: {} chars, {} lines", original_chars, original_lines);
            println!("Summary:  {} chars, {} lines", summary_chars, summary_lines);

            let char_reduction = 100.0 * (1.0 - summary_chars as f64 / original_chars as f64);
            let line_reduction = 100.0 * (1.0 - summary_lines as f64 / original_lines as f64);
            println!("Reduction: {:.1}% chars, {:.1}% lines", char_reduction, line_reduction);
        }
        Err(e) => {
            eprintln!("Error: {}", e);
        }
    }
}

fn get_lang_from_path(path: &str) -> String {
    let ext = path.rsplit('.').next().unwrap_or("");
    match ext {
        "ts" | "tsx" => "typescript".to_string(),
        "js" | "jsx" => "javascript".to_string(),
        "py" => "python".to_string(),
        "rs" => "rust".to_string(),
        "go" => "go".to_string(),
        "java" => "java".to_string(),
        "c" | "h" => "c".to_string(),
        "cpp" | "cc" | "cxx" | "hpp" => "cpp".to_string(),
        _ => ext.to_string(),
    }
}

fn get_example_code() -> String {
    r#"import { logger } from '@/utils/logger';
import { summarizeCodeContent, CodeSummary } from '@/services/code-navigation-service';
import { getLangIdFromPath } from '@/utils/file-utils';
import { timedMethod } from '@/lib/timing-decorator';
import { ModelMessage, ToolCallPart, ToolResultPart } from '@/types/ai-sdk';

/**
 * MessageRewriter handles code summarization for message compression.
 * It uses tree-sitter to extract function signatures and key definitions,
 * reducing token usage while preserving semantic information.
 */
export class MessageRewriter {
  private readonly LINE_THRESHOLD = 100;

  /**
   * Rewrite messages by summarizing large code blocks using tree-sitter.
   * This is used during message compaction to reduce token usage.
   */
  @timedMethod('MessageRewriter.rewriteMessages')
  async rewriteMessages(messages: ModelMessage[]): Promise<ModelMessage[]> {
    const result: ModelMessage[] = [];

    for (const message of messages) {
      if (message.role === 'tool') {
        const processedContent = await this.processToolResults(message.content);
        result.push({ ...message, content: processedContent });
      } else if (message.role === 'assistant') {
        const processedContent = await this.processToolCalls(message.content);
        result.push({ ...message, content: processedContent });
      } else {
        result.push(message);
      }
    }

    return result;
  }

  private async processToolResults(
    content: ToolResultPart[]
  ): Promise<ToolResultPart[]> {
    const result: ToolResultPart[] = [];

    for (const part of content) {
      if (part.toolName === 'readFile') {
        result.push(await this.processReadFileResult(part));
      } else {
        result.push(part);
      }
    }

    return result;
  }

  private async processToolCalls(
    content: Array<{ type: string } | ToolCallPart>
  ): Promise<Array<{ type: string } | ToolCallPart>> {
    const result: Array<{ type: string } | ToolCallPart> = [];

    for (const part of content) {
      if (part.type === 'tool-call') {
        const toolCall = part as ToolCallPart;
        if (toolCall.toolName === 'writeFile') {
          result.push(await this.processWriteFileCall(toolCall));
        } else {
          result.push(part);
        }
      } else {
        result.push(part);
      }
    }

    return result;
  }

  private async processReadFileResult(part: ToolResultPart): Promise<ToolResultPart> {
    try {
      const resultContent = part.result as { content?: string; path?: string };
      const content = resultContent?.content;
      const filePath = resultContent?.path;

      if (!content || !filePath) {
        return part;
      }

      const lineCount = content.split('\n').length;
      if (lineCount <= this.LINE_THRESHOLD) {
        return part;
      }

      const langId = getLangIdFromPath(filePath);
      if (!langId) {
        return part;
      }

      const summary = await this.summarizeContent(content, langId, filePath);

      if (!summary.success) {
        return part;
      }

      logger.info(`MessageRewriter: Compressed readFile result for ${filePath}`, {
        originalLines: summary.original_lines,
        summaryLength: summary.summary.length,
      });

      return {
        ...part,
        result: {
          ...resultContent,
          content: summary.summary,
        },
      };
    } catch (error) {
      logger.error('MessageRewriter: Failed to process readFile result:', error);
      return part;
    }
  }

  private async processWriteFileCall(part: ToolCallPart): Promise<ToolCallPart> {
    try {
      let input: Record<string, unknown>;
      if (typeof part.input === 'string') {
        input = JSON.parse(part.input) as Record<string, unknown>;
      } else {
        input = part.input as Record<string, unknown>;
      }

      const filePath = input?.file_path as string;
      const content = input?.content as string;

      if (!filePath || !content) {
        return part;
      }

      const lineCount = content.split('\n').length;
      if (lineCount <= this.LINE_THRESHOLD) {
        return part;
      }

      const langId = getLangIdFromPath(filePath);
      if (!langId) {
        return part;
      }

      const summary = await this.summarizeContent(content, langId, filePath);

      if (!summary.success) {
        return part;
      }

      logger.info(`MessageRewriter: Compressed writeFile call for ${filePath}`, {
        originalLines: summary.original_lines,
        summaryLength: summary.summary.length,
      });

      return {
        ...part,
        input: {
          file_path: filePath,
          content: summary.summary,
        },
      };
    } catch (error) {
      logger.error('MessageRewriter: Failed to process writeFile call:', error);
      return part;
    }
  }

  @timedMethod('MessageRewriter.summarizeContent')
  private async summarizeContent(
    content: string,
    langId: string,
    filePath: string
  ): Promise<CodeSummary> {
    try {
      return await summarizeCodeContent(content, langId, filePath);
    } catch (error) {
      logger.error('MessageRewriter: Failed to summarize content:', error);
      return {
        success: false,
        summary: content,
        original_lines: content.split('\n').length,
        lang_id: langId,
      };
    }
  }
}
"#.to_string()
}

// ============================================================================
// Tree-sitter Summarization Logic (copied from code_navigation.rs)
// ============================================================================

#[derive(Debug)]
struct CapturedSymbol {
    kind: String,
    text: String,
    start_line: usize,
    start_byte: usize,
}

fn summarize_code(content: &str, lang_id: &str) -> Result<String, String> {
    let original_lines = content.lines().count();

    let language: Language = match lang_id {
        "python" => tree_sitter_python::LANGUAGE.into(),
        "rust" => tree_sitter_rust::LANGUAGE.into(),
        "go" => tree_sitter_go::LANGUAGE.into(),
        "c" => tree_sitter_c::LANGUAGE.into(),
        "cpp" => tree_sitter_cpp::LANGUAGE.into(),
        "java" => tree_sitter_java::LANGUAGE.into(),
        "typescript" | "javascript" | "tsx" | "jsx" => tree_sitter_typescript::LANGUAGE_TSX.into(),
        _ => {
            return Err(format!("Unsupported language: {}", lang_id));
        }
    };

    let mut parser = Parser::new();
    if parser.set_language(&language).is_err() {
        return Err(format!("Failed to set language for {}", lang_id));
    }

    let tree = match parser.parse(content, None) {
        Some(t) => t,
        None => return Err("Failed to parse content".to_string()),
    };

    let source_bytes = content.as_bytes();

    let query_str = get_summarization_query(lang_id);
    if query_str.is_empty() {
        return Err(format!("No query available for language: {}", lang_id));
    }

    let query = match Query::new(&language, query_str) {
        Ok(q) => q,
        Err(e) => return Err(format!("Failed to create query: {:?}", e)),
    };

    let mut captures: Vec<CapturedSymbol> = Vec::new();
    let mut cursor = QueryCursor::new();
    let mut matches = cursor.matches(&query, tree.root_node(), source_bytes);

    while let Some(m) = matches.next() {
        for capture in m.captures {
            let node = capture.node;
            let capture_name = query.capture_names()[capture.index as usize];

            let text = match node.utf8_text(source_bytes) {
                Ok(t) => t.to_string(),
                Err(_) => continue,
            };

            captures.push(CapturedSymbol {
                kind: capture_name.to_string(),
                text,
                start_line: node.start_position().row,
                start_byte: node.start_byte(),
            });
        }
    }

    captures.sort_by_key(|c| c.start_byte);

    Ok(build_summary(content, &captures, lang_id, original_lines))
}

fn get_summarization_query(lang_id: &str) -> &'static str {
    match lang_id {
        "typescript" | "javascript" | "tsx" | "jsx" => {
            r#"
            (function_declaration) @function
            (program (lexical_declaration
              (variable_declarator
                name: (identifier)
                value: (arrow_function)))) @arrow_function
            (program (export_statement
              (lexical_declaration
                (variable_declarator
                  name: (identifier)
                  value: (arrow_function))))) @arrow_function
            (class_declaration) @class
            (interface_declaration) @interface
            (type_alias_declaration) @type_alias
            (enum_declaration) @enum
            (program (lexical_declaration) @const_decl)
            (program (export_statement (lexical_declaration)) @const_decl)
            "#
        }
        "python" => {
            r#"
            (function_definition) @function
            (class_definition) @class
            (module (expression_statement (assignment))) @assignment
            "#
        }
        "rust" => {
            r#"
            (function_item) @function
            (struct_item) @struct
            (enum_item) @enum
            (trait_item) @trait
            (impl_item) @impl
            (type_item) @type_alias
            (const_item) @const
            (static_item) @static
            "#
        }
        "go" => {
            r#"
            (function_declaration) @function
            (method_declaration) @method
            (type_declaration) @type_decl
            (const_declaration) @const
            (var_declaration) @var
            "#
        }
        "java" => {
            r#"
            (class_declaration) @class
            (interface_declaration) @interface
            (enum_declaration) @enum
            (method_declaration) @method
            (field_declaration) @field
            "#
        }
        "c" | "cpp" => {
            r#"
            (function_definition) @function
            (struct_specifier) @struct
            (class_specifier) @class
            (enum_specifier) @enum
            (type_definition) @typedef
            "#
        }
        _ => "",
    }
}

fn build_summary(content: &str, captures: &[CapturedSymbol], lang_id: &str, original_lines: usize) -> String {
    let mut result = format!(
        "[COMPRESSED: Original {} lines -> Summarized using tree-sitter]\n\n",
        original_lines
    );

    let lines: Vec<&str> = content.lines().collect();

    for capture in captures {
        let text = &capture.text;

        let summarized = match capture.kind.as_str() {
            "function" | "method" | "arrow_function" => {
                extract_function_signature(text, lang_id)
            }
            "class" => {
                extract_class_summary(text, lang_id)
            }
            "impl" => {
                extract_impl_summary(text)
            }
            "interface" | "type_alias" | "enum" | "struct" | "trait" | "type_decl" => {
                limit_text(text, 30)
            }
            "const" | "static" | "const_decl" | "var" | "field" | "assignment" | "typedef" => {
                text.lines().next().unwrap_or(text).to_string()
            }
            _ => text.clone(),
        };

        let doc_comment = extract_doc_comment(&lines, capture.start_line, lang_id);
        if !doc_comment.is_empty() {
            result.push_str(&doc_comment);
            result.push('\n');
        }

        result.push_str(&summarized);
        result.push_str("\n\n");
    }

    result.trim_end().to_string()
}

fn extract_function_signature(text: &str, lang_id: &str) -> String {
    match lang_id {
        "typescript" | "javascript" | "tsx" | "jsx" => {
            if let Some(pos) = text.find('{') {
                let sig = text[..pos].trim();
                format!("{} {{ ... }}", sig)
            } else if let Some(pos) = text.find("=>") {
                let sig = text[..pos + 2].trim();
                format!("{} {{ ... }}", sig)
            } else {
                text.lines().next().unwrap_or(text).to_string()
            }
        }
        "python" => {
            if let Some(pos) = text.find(':') {
                let sig = text[..pos + 1].trim();
                format!("{}\n    ...", sig)
            } else {
                text.lines().next().unwrap_or(text).to_string()
            }
        }
        "rust" => {
            if let Some(pos) = text.find('{') {
                let sig = text[..pos].trim();
                format!("{} {{ ... }}", sig)
            } else {
                text.lines().next().unwrap_or(text).to_string()
            }
        }
        "go" => {
            if let Some(pos) = text.find('{') {
                let sig = text[..pos].trim();
                format!("{} {{ ... }}", sig)
            } else {
                text.lines().next().unwrap_or(text).to_string()
            }
        }
        "java" | "c" | "cpp" => {
            if let Some(pos) = text.find('{') {
                let sig = text[..pos].trim();
                format!("{} {{ ... }}", sig)
            } else {
                text.lines().next().unwrap_or(text).to_string()
            }
        }
        _ => text.lines().next().unwrap_or(text).to_string(),
    }
}

fn extract_class_summary(text: &str, lang_id: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    if lines.is_empty() {
        return text.to_string();
    }

    let mut result = Vec::new();

    match lang_id {
        "typescript" | "javascript" | "tsx" | "jsx" => {
            result.push(lines[0].to_string());

            // Detect the indentation level of class members (first non-empty line after class declaration)
            let member_indent = lines.iter().skip(1)
                .find(|l| !l.trim().is_empty() && !l.trim().starts_with("//") && !l.trim().starts_with("*"))
                .map(|l| l.len() - l.trim_start().len())
                .unwrap_or(2);

            for line in lines.iter().skip(1) {
                let trimmed = line.trim();
                let current_indent = line.len() - line.trim_start().len();

                // Only consider lines at the class member indentation level
                if current_indent != member_indent || trimmed.is_empty() {
                    continue;
                }

                // Check if it's a class member (field, method, constructor, decorator)
                let is_member = trimmed.starts_with("private ")
                    || trimmed.starts_with("public ")
                    || trimmed.starts_with("protected ")
                    || trimmed.starts_with("readonly ")
                    || trimmed.starts_with("static ")
                    || trimmed.starts_with("constructor")
                    || trimmed.starts_with("async ")
                    || trimmed.starts_with("@")  // decorators
                    || trimmed.starts_with("get ")
                    || trimmed.starts_with("set ")
                    // Method without access modifier (must have parentheses and be followed by { or :)
                    || (trimmed.contains('(') && (trimmed.contains(") {") || trimmed.contains("): ")));

                if is_member {
                    if let Some(brace_pos) = line.find('{') {
                        result.push(format!("{}{{ ... }}", &line[..brace_pos]));
                    } else {
                        result.push(line.to_string());
                    }
                }
            }
            result.push("}".to_string());
        }
        "python" => {
            result.push(lines[0].to_string());

            for line in lines.iter().skip(1) {
                let trimmed = line.trim();
                if trimmed.starts_with("def ") || trimmed.starts_with("async def ") {
                    if let Some(colon_pos) = line.find(':') {
                        result.push(format!("{}:\n        ...", &line[..colon_pos]));
                    } else {
                        result.push(line.to_string());
                    }
                } else if trimmed.starts_with("self.") && trimmed.contains('=') {
                    result.push(format!("    {}", trimmed));
                }
            }
        }
        "java" => {
            result.push(lines[0].to_string());

            for line in lines.iter().skip(1) {
                let trimmed = line.trim();
                if trimmed.starts_with("private ")
                    || trimmed.starts_with("public ")
                    || trimmed.starts_with("protected ")
                    || trimmed.starts_with("static ")
                    || trimmed.starts_with("final ")
                {
                    if let Some(brace_pos) = line.find('{') {
                        result.push(format!("{}{{ ... }}", &line[..brace_pos]));
                    } else {
                        result.push(line.to_string());
                    }
                }
            }
            result.push("}".to_string());
        }
        _ => {
            return limit_text(text, 20);
        }
    }

    result.join("\n")
}

fn extract_impl_summary(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    if lines.is_empty() {
        return text.to_string();
    }

    let mut result = Vec::new();
    result.push(lines[0].to_string());

    for line in lines.iter().skip(1) {
        let trimmed = line.trim();
        if trimmed.starts_with("pub fn ")
            || trimmed.starts_with("fn ")
            || trimmed.starts_with("pub async fn ")
            || trimmed.starts_with("async fn ")
        {
            if let Some(brace_pos) = line.find('{') {
                result.push(format!("{}{{ ... }}", &line[..brace_pos]));
            } else {
                result.push(line.to_string());
            }
        }
    }
    result.push("}".to_string());

    result.join("\n")
}

fn extract_doc_comment(lines: &[&str], start_line: usize, lang_id: &str) -> String {
    if start_line == 0 {
        return String::new();
    }

    let mut doc_lines = Vec::new();
    let mut line_idx = start_line - 1;

    loop {
        let line = lines.get(line_idx).unwrap_or(&"").trim();

        let is_doc_comment = match lang_id {
            "typescript" | "javascript" | "tsx" | "jsx" | "java" | "c" | "cpp" => {
                line.starts_with("/**")
                    || line.starts_with("*")
                    || line.starts_with("//")
                    || line.ends_with("*/")
            }
            "python" => {
                line.starts_with("\"\"\"")
                    || line.starts_with("'''")
                    || line.starts_with("#")
            }
            "rust" => {
                line.starts_with("///") || line.starts_with("//!")
            }
            "go" => {
                line.starts_with("//")
            }
            _ => false,
        };

        if is_doc_comment {
            doc_lines.push(line.to_string());
            if line.starts_with("/**") || line.starts_with("\"\"\"") || line.starts_with("'''") {
                break;
            }
        } else if line.is_empty() {
            if !doc_lines.is_empty() {
                break;
            }
        } else {
            break;
        }

        if line_idx == 0 {
            break;
        }
        line_idx -= 1;
    }

    doc_lines.reverse();
    doc_lines.join("\n")
}

fn limit_text(text: &str, max_lines: usize) -> String {
    let lines: Vec<&str> = text.lines().collect();
    if lines.len() <= max_lines {
        text.to_string()
    } else {
        let mut result: Vec<&str> = lines[..max_lines].to_vec();
        result.push("    // ... (truncated)");
        result.push("}");
        result.join("\n")
    }
}
