// src/services/commands/built-in-commands.ts

import { z } from 'zod';
import type { Command } from '@/types/command';
import { CommandCategory, CommandType } from '@/types/command';

/**
 * Get all built-in commands
 */
export async function getBuiltInCommands(): Promise<Command[]> {
  const commands: Command[] = [
    // /new - Create new conversation
    {
      id: 'new-conversation',
      name: 'new',
      description: 'Create a new conversation',
      category: CommandCategory.CONVERSATION,
      type: CommandType.ACTION,
      executor: async (_args, context) => {
        try {
          if (context.createNewConversation) {
            await context.createNewConversation();
            return {
              success: true,
              message: 'New conversation created successfully',
            };
          }
          return {
            success: false,
            error: 'Unable to create new conversation - function not available',
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to create new conversation: ${error}`,
          };
        }
      },
      isBuiltIn: true,
      enabled: true,
      icon: 'Plus',
      examples: ['/new'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },

    //     // /pr-review - Review a pull request
    //     {
    //       id: 'pr-review',
    //       name: 'pr-review',
    //       description: 'Review and analyze a GitHub pull request',
    //       category: CommandCategory.GIT,
    //       type: CommandType.AI_PROMPT,
    //       parameters: [
    //         {
    //           name: 'url',
    //           description: 'GitHub PR URL or PR number',
    //           required: true,
    //           type: 'url',
    //         },
    //       ],
    //       parametersSchema: z.object({
    //         url: z.string().min(1, 'PR URL or number is required'),
    //       }),
    //       executor: async (args, _context) => {
    //         const prIdentifier = args.url;

    //         const aiMessage = `Please review the GitHub pull request: ${prIdentifier}.

    // Use the appropriate tools to:
    // 1. Fetch the PR details and changes
    // 2. Analyze the code changes for quality, security, and best practices
    // 3. Check for potential issues or improvements
    // 4. Provide constructive feedback and suggestions
    // 5. Summarize the overall quality and readiness of the PR

    // Focus on code quality, potential bugs, security issues, performance implications, and adherence to best practices.`;

    //         return {
    //           success: true,
    //           message: `PR review initiated for: ${prIdentifier}`,
    //           continueProcessing: true,
    //           aiMessage,
    //         };
    //       },
    //       isBuiltIn: true,
    //       enabled: true,
    //       icon: 'Search',
    //       aliases: ['review'],
    //       examples: ['/pr-review https://github.com/owner/repo/pull/123', '/pr-review 123'],
    //       createdAt: new Date(),
    //       updatedAt: new Date(),
    //     },

    // /init - Initialize project with AGENTS.md
    {
      id: 'init-project',
      name: 'init',
      description: 'Initialize project with AGENTS.md guide',
      category: CommandCategory.PROJECT,
      type: CommandType.AI_PROMPT,
      parameters: [
        {
          name: 'type',
          description: 'Project type (web, api, mobile, etc.)',
          required: false,
          type: 'string',
        },
      ],
      parametersSchema: z.object({
        type: z.string().optional(),
        _raw: z.string().optional(),
      }),
      executor: async (args, _context) => {
        const projectType = args.type || args._raw || '';

        let aiMessage =
          'Please help initialize this project by creating an AGENTS.md file that serves as a comprehensive guide for AI agents working on this project. ';

        if (projectType) {
          aiMessage += `The project type is: ${projectType}. `;
        }

        return {
          success: true,
          message: 'Project initialization started',
          continueProcessing: true,
          aiMessage,
        };
      },
      isBuiltIn: true,
      enabled: true,
      icon: 'FileText',
      preferredAgentId: 'init-project',
      aliases: ['initialize'],
      examples: ['/init', '/init web application'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  return commands;
}
