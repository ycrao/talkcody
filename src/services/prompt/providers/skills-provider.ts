// src/services/prompt/providers/skills-provider.ts

import { logger } from '@/lib/logger';
import { getFileBasedSkillService } from '@/services/skills/file-based-skill-service';
import { useSkillsStore } from '@/stores/skills-store';
import type { PromptContextProvider, ResolveContext } from '@/types/prompt';

/**
 * Skills Provider
 * Injects compact skill summaries into the system prompt
 * Skills are configured at the agent level
 *
 * This provider uses a lazy-loading approach:
 * - System prompt contains only skill names and descriptions (compact)
 * - Full skill content (domain knowledge, workflow rules, docs) is loaded via get_skill tool
 * - This significantly reduces system prompt token usage while maintaining skill accessibility
 *
 * System skills (like talkcody-knowledge-base) are always included in the prompt,
 * while user skills are included based on active selection.
 */
export const SkillsProvider: PromptContextProvider = {
  id: 'skills',
  label: 'Available Skills',
  description:
    'Injects compact summaries of available skills; full content loaded on-demand via get_skill tool',
  badges: ['Auto', 'Agent', 'Skills'],

  providedTokens() {
    return ['active_skills', 'skills_context'];
  },

  canResolve(token: string) {
    return token === 'active_skills' || token === 'skills_context';
  },

  async resolve(_token: string, _ctx: ResolveContext): Promise<string | undefined> {
    try {
      // Get global active skills from the skills store
      const activeSkillIds = useSkillsStore.getState().getActiveSkills();

      // Get file-based skill service
      const skillService = await getFileBasedSkillService();

      // Load all skills
      const allSkills = await skillService.listSkills();

      // Filter: system skills are always included + active user skills
      const skillsToUse = allSkills.filter((skill) => {
        const isSystem = skill.metadata.source === 'system';
        const isActive = activeSkillIds && activeSkillIds.includes(skill.id);
        return isSystem || isActive;
      });

      if (!skillsToUse || skillsToUse.length === 0) {
        return undefined;
      }

      // Build compact skills summaries (name + description + script indicator + system badge)
      const skillsSummaries: string[] = [];

      for (const skill of skillsToUse) {
        const isSystem = skill.metadata.source === 'system' ? ' [System]' : '';
        const scriptIndicator =
          skill.hasScripts && skill.scriptFiles && skill.scriptFiles.length > 0
            ? ` [${skill.scriptFiles.length} script(s)]`
            : '';
        const summary = `- **${skill.name}**: ${skill.description || 'Domain-specific knowledge and best practices'}${scriptIndicator}${isSystem}`;
        skillsSummaries.push(summary);
      }

      // Return compact list
      return skillsSummaries.join('\n');
    } catch (error) {
      logger.error('Failed to resolve skills context:', error);
      return undefined;
    }
  },

  injection: {
    enabledByDefault: true,
    placement: 'append', // Append skills after agent's base prompt
    sectionTitle: 'Available Skills',
    sectionTemplate(values: Record<string, string>) {
      const content = values.skills_context || values.active_skills || '';
      if (!content) return '';

      return [
        '====',
        '# Available Skills',
        '',
        'The following skills are available to assist you.',
        'System skills (marked with [System]) are always available.',
        '',
        content,
        '',
        '## Using Skills',
        '',
        'Skills are loaded on-demand to optimize prompt efficiency. Use the `get_skill` tool when you need:',
        '- Detailed domain knowledge for implementation',
        '- Specific workflow rules for a technology stack',
        '- Reference documentation for APIs or frameworks',
        '- Best practices and design patterns for a domain',
        '',
        'Example: If you\'re implementing a React component and need React best practices, use `get_skill` with skill_name="React Best Practices".',
        'Or to learn about TalkCody features and usage, use `get_skill` with skill_name="TalkCody Knowledge Base".',
        '',
        "**Note**: Only fetch skills when they're relevant to your current task. For simple tasks that don't require deep expertise, you may not need to load any skills.",
        '====',
      ].join('\n');
    },
  },
};
