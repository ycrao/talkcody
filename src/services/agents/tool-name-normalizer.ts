// src/services/agents/tool-name-normalizer.ts
import { logger } from '@/lib/logger';
import { getAllToolNames } from '@/lib/tools';

/**
 * Validates if a tool name follows the required pattern for AI providers
 * Tool names must match: [a-zA-Z0-9_-]+
 */
export function isValidToolName(toolName: string): boolean {
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  return validPattern.test(toolName);
}

/**
 * Normalizes a tool name by removing invalid characters and mapping to known tool names
 *
 * This function handles cases where AI models return tool names with invalid characters
 * (e.g., "bash Tool" instead of "bash" or "bashTool")
 *
 * @param toolName - The tool name to normalize
 * @returns The normalized tool name, or null if it cannot be mapped to a valid tool
 */
export function normalizeToolName(toolName: string): string | null {
  // Remove all invalid characters (anything not alphanumeric, underscore, or hyphen)
  const cleaned = toolName.replace(/[^a-zA-Z0-9_-]/g, '');

  // If cleaning changed the name, log it
  if (cleaned !== toolName) {
    logger.warn('[ToolNameNormalizer] Invalid tool name detected, attempting to normalize', {
      originalToolName: toolName,
      cleanedName: cleaned,
    });
  }

  // Common mappings from AI-generated names to actual tool names
  // This handles cases like "bash Tool" -> "bashTool", "Bash Tool" -> "bashTool", etc.
  // Note: The key in TOOL_DEFINITIONS is 'bashTool', but the tool's name property is 'bash'
  const commonMappings: Record<string, string> = {
    // Bash tool variations
    bash: 'bashTool',
    bashTool: 'bashTool',
    Bash: 'bashTool',
    BashTool: 'bashTool',
    bashtool: 'bashTool',
    BASH: 'bashTool',

    // Read file variations
    readFile: 'readFile',
    ReadFile: 'readFile',
    readfile: 'readFile',
    READFILE: 'readFile',
    readFileTool: 'readFile',
    ReadFileTool: 'readFile',

    // Write file variations
    writeFile: 'writeFile',
    WriteFile: 'writeFile',
    writefile: 'writeFile',
    WRITEFILE: 'writeFile',
    writeFileTool: 'writeFile',
    WriteFileTool: 'writeFile',

    // Edit file variations
    editFile: 'editFile',
    EditFile: 'editFile',
    editfile: 'editFile',
    EDITFILE: 'editFile',
    editFileTool: 'editFile',
    EditFileTool: 'editFile',

    // Glob tool variations
    globTool: 'globTool',
    GlobTool: 'globTool',
    glob: 'globTool',
    Glob: 'globTool',
    GLOB: 'globTool',
    globtool: 'globTool',

    // Code search variations
    codeSearch: 'codeSearch',
    CodeSearch: 'codeSearch',
    codesearch: 'codeSearch',
    CODESEARCH: 'codeSearch',
    codeSearchTool: 'codeSearch',
    CodeSearchTool: 'codeSearch',
    GrepTool: 'codeSearch',
    grep: 'codeSearch',
    Grep: 'codeSearch',

    // List files variations
    listFiles: 'listFiles',
    ListFiles: 'listFiles',
    listfiles: 'listFiles',
    LISTFILES: 'listFiles',
    listFilesTool: 'listFiles',
    ListFilesTool: 'listFiles',

    // Call agent variations
    callAgent: 'callAgent',
    CallAgent: 'callAgent',
    callagent: 'callAgent',
    CALLAGENT: 'callAgent',
    callAgentTool: 'callAgent',
    CallAgentTool: 'callAgent',

    // Todo write variations
    todoWriteTool: 'todoWriteTool',
    TodoWriteTool: 'todoWriteTool',
    todoWrite: 'todoWriteTool',
    TodoWrite: 'todoWriteTool',
    todowrite: 'todoWriteTool',
    TODOWRITE: 'todoWriteTool',
    todowritetool: 'todoWriteTool',

    // Web search variations
    webSearchTool: 'webSearchTool',
    WebSearchTool: 'webSearchTool',
    webSearch: 'webSearchTool',
    WebSearch: 'webSearchTool',
    websearch: 'webSearchTool',
    WEBSEARCH: 'webSearchTool',
    websearchtool: 'webSearchTool',

    // Web fetch variations
    webFetchTool: 'webFetchTool',
    WebFetchTool: 'webFetchTool',
    webFetch: 'webFetchTool',
    WebFetch: 'webFetchTool',
    webfetch: 'webFetchTool',
    WEBFETCH: 'webFetchTool',
    webfetchtool: 'webFetchTool',

    // Ask user questions variations
    askUserQuestionsTool: 'askUserQuestionsTool',
    AskUserQuestionsTool: 'askUserQuestionsTool',
    askUserQuestions: 'askUserQuestionsTool',
    AskUserQuestions: 'askUserQuestionsTool',
    askuserquestions: 'askUserQuestionsTool',

    // Exit plan mode variations
    exitPlanModeTool: 'exitPlanModeTool',
    ExitPlanModeTool: 'exitPlanModeTool',
    exitPlanMode: 'exitPlanModeTool',
    ExitPlanMode: 'exitPlanModeTool',
    exitplanmode: 'exitPlanModeTool',

    // Get skill variations
    getSkillTool: 'getSkillTool',
    GetSkillTool: 'getSkillTool',
    getSkill: 'getSkillTool',
    GetSkill: 'getSkillTool',
    getskill: 'getSkillTool',
  };

  // Try exact match first
  if (commonMappings[cleaned]) {
    const normalized = commonMappings[cleaned];
    logger.info('[ToolNameNormalizer] Successfully normalized tool name via mapping', {
      originalToolName: toolName,
      cleanedName: cleaned,
      normalizedName: normalized,
    });
    return normalized;
  }

  // Try case-insensitive match
  const lowerCleaned = cleaned.toLowerCase();
  for (const [key, value] of Object.entries(commonMappings)) {
    if (key.toLowerCase() === lowerCleaned) {
      logger.info(
        '[ToolNameNormalizer] Successfully normalized tool name via case-insensitive match',
        {
          originalToolName: toolName,
          cleanedName: cleaned,
          normalizedName: value,
        }
      );
      return value;
    }
  }

  // If it's an MCP tool (starts with a server ID prefix like "mcp__"), keep the cleaned version
  if (cleaned.startsWith('mcp__') || cleaned.includes('__')) {
    logger.info('[ToolNameNormalizer] Detected MCP tool, using cleaned name', {
      originalToolName: toolName,
      cleanedName: cleaned,
    });
    return cleaned;
  }

  // Check if the cleaned name matches any registered tool names
  const validToolNames = getAllToolNames();
  if (validToolNames.includes(cleaned as any)) {
    logger.info('[ToolNameNormalizer] Cleaned tool name matches a registered tool', {
      originalToolName: toolName,
      cleanedName: cleaned,
    });
    return cleaned;
  }

  logger.error('[ToolNameNormalizer] Unable to normalize tool name to a known tool', {
    originalToolName: toolName,
    cleanedName: cleaned,
    availableTools: validToolNames,
  });

  return null;
}
