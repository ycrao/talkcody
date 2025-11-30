/**
 * SKILL.md Parser
 *
 * Parses Claude Code compatible SKILL.md files with YAML frontmatter
 */

import type { ParsedSkillMd, SkillMdFrontmatter } from '@/types/file-based-skill';
import type { SkillContent } from '@/types/skill';

/**
 * Parse SKILL.md content
 *
 * Expected format:
 * ---
 * name: Skill Name
 * description: Description here
 * version: 1.0.0
 * ---
 * # Markdown content here
 */
export class SkillMdParser {
  /**
   * Parse SKILL.md file content
   */
  static parse(content: string): ParsedSkillMd {
    const trimmed = content.trim();

    // Check for frontmatter delimiters
    if (!trimmed.startsWith('---')) {
      throw new Error('Invalid SKILL.md: Missing YAML frontmatter (must start with ---)');
    }

    // Find the closing delimiter
    const lines = trimmed.split('\n');
    let frontmatterEndIndex = -1;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line && line.trim() === '---') {
        frontmatterEndIndex = i;
        break;
      }
    }

    if (frontmatterEndIndex === -1) {
      throw new Error('Invalid SKILL.md: Missing closing --- for YAML frontmatter');
    }

    // Extract frontmatter YAML
    const frontmatterLines = lines.slice(1, frontmatterEndIndex);
    const frontmatterYaml = frontmatterLines.join('\n');

    // Extract markdown content
    const markdownLines = lines.slice(frontmatterEndIndex + 1);
    const markdownContent = markdownLines.join('\n').trim();

    // Parse YAML frontmatter
    const frontmatter = SkillMdParser.parseYamlFrontmatter(frontmatterYaml);

    return {
      frontmatter,
      content: markdownContent,
    };
  }

  /**
   * Parse YAML frontmatter
   * Simple YAML parser for common skill frontmatter fields
   */
  private static parseYamlFrontmatter(yaml: string): SkillMdFrontmatter {
    const result: Record<string, unknown> = {};
    const lines = yaml.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue; // Skip empty lines and comments
      }

      // Match key: value pattern
      const match = trimmedLine.match(/^([^:]+):\s*(.*)$/);
      if (!match) {
        continue;
      }

      const key = match[1]?.trim() || '';
      const value = match[2]?.trim() || '';

      // Parse value types
      if (value === 'true') {
        result[key] = true;
      } else if (value === 'false') {
        result[key] = false;
      } else if (value.match(/^\d+$/)) {
        result[key] = Number.parseInt(value, 10);
      } else if (value.match(/^\d+\.\d+$/)) {
        result[key] = Number.parseFloat(value);
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // Simple array parsing: [item1, item2, item3]
        const arrayContent = value.slice(1, -1);
        result[key] = arrayContent.split(',').map((item) => item.trim());
      } else {
        // String value - remove quotes if present
        result[key] = value.replace(/^["']|["']$/g, '');
      }
    }

    // Validate required fields
    if (!result.name || typeof result.name !== 'string') {
      throw new Error('Invalid SKILL.md: Missing required field "name" in frontmatter');
    }

    if (!result.description || typeof result.description !== 'string') {
      throw new Error('Invalid SKILL.md: Missing required field "description" in frontmatter');
    }

    return result as SkillMdFrontmatter;
  }

  /**
   * Generate SKILL.md content from parsed data
   */
  static generate(parsed: ParsedSkillMd): string {
    const frontmatterYaml = SkillMdParser.generateYamlFrontmatter(parsed.frontmatter);

    return ['---', frontmatterYaml, '---', '', parsed.content].join('\n');
  }

  /**
   * Generate YAML frontmatter from object
   */
  private static generateYamlFrontmatter(frontmatter: SkillMdFrontmatter): string {
    const lines: string[] = [];

    for (const [key, value] of Object.entries(frontmatter)) {
      if (value === undefined || value === null) {
        continue;
      }

      if (Array.isArray(value)) {
        // Array format: key: [item1, item2]
        lines.push(`${key}: [${value.join(', ')}]`);
      } else if (typeof value === 'boolean' || typeof value === 'number') {
        lines.push(`${key}: ${value}`);
      } else {
        // String - no quotes needed for simple strings
        lines.push(`${key}: ${value}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Create a default SKILL.md template
   */
  static createTemplate(name: string, description: string): string {
    const frontmatter: SkillMdFrontmatter = {
      name,
      description,
      version: '1.0.0',
    };

    const content = `# ${name}

${description}

## Usage

This skill provides domain-specific knowledge and best practices.

## Instructions

Add your instructions here for how the AI should use this skill.
`;

    return SkillMdParser.generate({ frontmatter, content });
  }

  /**
   * Create SKILL.md from user-provided content
   */
  static createSkillMdFromContent(
    name: string,
    description: string,
    skillContent?: SkillContent,
    category?: string
  ): string {
    const frontmatter: SkillMdFrontmatter = {
      name,
      description,
      version: '1.0.0',
      category,
    };

    // If no content provided, use default template
    if (!skillContent) {
      const defaultContent = `# ${name}

${description}

## Usage

This skill provides domain-specific knowledge and best practices.

## Instructions

Add your instructions here for how the AI should use this skill.
`;
      return SkillMdParser.generate({ frontmatter, content: defaultContent });
    }

    // Build content from SkillContent fields
    const sections: string[] = [];

    // Header
    sections.push(`# ${name}`);
    sections.push('');
    sections.push(description);
    sections.push('');

    // System Prompt Fragment (Domain Knowledge)
    if (skillContent.systemPromptFragment?.trim()) {
      sections.push('## Domain Knowledge');
      sections.push('');
      sections.push(skillContent.systemPromptFragment.trim());
      sections.push('');
    }

    // Workflow Rules
    if (skillContent.workflowRules?.trim()) {
      sections.push('## Workflow Rules');
      sections.push('');
      sections.push(skillContent.workflowRules.trim());
      sections.push('');
    }

    // Documentation
    if (skillContent.documentation && skillContent.documentation.length > 0) {
      sections.push('## Documentation');
      sections.push('');

      for (const doc of skillContent.documentation) {
        sections.push(`### ${doc.title}`);
        sections.push('');

        if (doc.type === 'inline' && doc.content) {
          sections.push(doc.content);
        } else if (doc.type === 'file' && doc.filePath) {
          sections.push(`**File**: \`${doc.filePath}\``);
        } else if (doc.type === 'url' && doc.url) {
          sections.push(`**URL**: [${doc.url}](${doc.url})`);
        }

        sections.push('');
      }
    }

    // Scripts info (if any)
    if (
      skillContent.hasScripts &&
      skillContent.scriptFiles &&
      skillContent.scriptFiles.length > 0
    ) {
      sections.push('## Available Scripts');
      sections.push('');
      sections.push('This skill includes the following executable scripts:');
      sections.push('');

      for (const scriptFile of skillContent.scriptFiles) {
        sections.push(`- \`${scriptFile}\``);
      }

      sections.push('');
    }

    const content = sections.join('\n');
    return SkillMdParser.generate({ frontmatter, content });
  }
}
