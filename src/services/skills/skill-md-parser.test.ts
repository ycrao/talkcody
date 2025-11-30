/**
 * Tests for SkillMdParser
 */

import { describe, expect, it } from 'vitest';
import { SkillMdParser } from './skill-md-parser';

describe('SkillMdParser', () => {
  describe('parse', () => {
    it('should parse valid SKILL.md with frontmatter', () => {
      const content = `---
name: Test Skill
description: A test skill for unit testing
version: 1.0.0
---

# Test Skill

This is the main content of the skill.

## Usage

Use this skill for testing purposes.
`;

      const result = SkillMdParser.parse(content);

      expect(result.frontmatter.name).toBe('Test Skill');
      expect(result.frontmatter.description).toBe('A test skill for unit testing');
      expect(result.frontmatter.version).toBe('1.0.0');
      expect(result.content).toContain('# Test Skill');
      expect(result.content).toContain('## Usage');
    });

    it('should parse frontmatter with boolean values', () => {
      const content = `---
name: Test
description: Test
mode: true
enabled: false
---
Content here`;

      const result = SkillMdParser.parse(content);

      expect(result.frontmatter.mode).toBe(true);
      expect((result.frontmatter as any).enabled).toBe(false);
    });

    it('should parse frontmatter with arrays', () => {
      const content = `---
name: Test
description: Test
allowed-tools: [Read, Write, Grep]
tags: [python, testing, automation]
---
Content`;

      const result = SkillMdParser.parse(content);

      expect(result.frontmatter['allowed-tools']).toEqual(['Read', 'Write', 'Grep']);
      expect((result.frontmatter as any).tags).toEqual(['python', 'testing', 'automation']);
    });

    it('should throw error for missing frontmatter', () => {
      const content = `# Just a markdown file

No frontmatter here.`;

      expect(() => SkillMdParser.parse(content)).toThrow('Missing YAML frontmatter');
    });

    it('should throw error for unclosed frontmatter', () => {
      const content = `---
name: Test
description: Test

Content without closing delimiter`;

      expect(() => SkillMdParser.parse(content)).toThrow('Missing closing ---');
    });

    it('should throw error for missing required name field', () => {
      const content = `---
description: Test only
---
Content`;

      expect(() => SkillMdParser.parse(content)).toThrow('Missing required field "name"');
    });

    it('should throw error for missing required description field', () => {
      const content = `---
name: Test only
---
Content`;

      expect(() => SkillMdParser.parse(content)).toThrow('Missing required field "description"');
    });
  });

  describe('generate', () => {
    it('should generate valid SKILL.md content', () => {
      const parsed = {
        frontmatter: {
          name: 'Generated Skill',
          description: 'A generated skill',
          version: '2.0.0',
        },
        content: '# Generated Content\n\nThis is generated.',
      };

      const result = SkillMdParser.generate(parsed);

      expect(result).toContain('---');
      expect(result).toContain('name: Generated Skill');
      expect(result).toContain('description: A generated skill');
      expect(result).toContain('version: 2.0.0');
      expect(result).toContain('# Generated Content');
    });

    it('should handle arrays in frontmatter generation', () => {
      const parsed = {
        frontmatter: {
          name: 'Test',
          description: 'Test',
          'allowed-tools': ['Read', 'Write'],
        },
        content: 'Content',
      };

      const result = SkillMdParser.generate(parsed);

      expect(result).toContain('allowed-tools: [Read, Write]');
    });

    it('should skip undefined values in frontmatter', () => {
      const parsed = {
        frontmatter: {
          name: 'Test',
          description: 'Test',
          version: undefined,
        },
        content: 'Content',
      };

      const result = SkillMdParser.generate(parsed);

      expect(result).not.toContain('version:');
    });
  });

  describe('createTemplate', () => {
    it('should create a valid template', () => {
      const template = SkillMdParser.createTemplate('My New Skill', 'This is a new skill');

      expect(template).toContain('---');
      expect(template).toContain('name: My New Skill');
      expect(template).toContain('description: This is a new skill');
      expect(template).toContain('version: 1.0.0');
      expect(template).toContain('# My New Skill');
      expect(template).toContain('## Usage');
    });
  });

  describe('round-trip parsing', () => {
    it('should maintain data integrity through parse and generate cycle', () => {
      const original = `---
name: Round Trip Test
description: Testing round-trip parsing
version: 1.5.0
allowed-tools: [Read, Grep, Glob]
mode: false
---

# Round Trip Test

This tests that parsing and generating maintain data integrity.

## Features

- Feature 1
- Feature 2
`;

      const parsed = SkillMdParser.parse(original);
      const generated = SkillMdParser.generate(parsed);
      const reParsed = SkillMdParser.parse(generated);

      expect(reParsed.frontmatter.name).toBe(parsed.frontmatter.name);
      expect(reParsed.frontmatter.description).toBe(parsed.frontmatter.description);
      expect(reParsed.frontmatter.version).toBe(parsed.frontmatter.version);
      expect(reParsed.frontmatter['allowed-tools']).toEqual(parsed.frontmatter['allowed-tools']);
      expect(reParsed.content.trim()).toBe(parsed.content.trim());
    });
  });
});
