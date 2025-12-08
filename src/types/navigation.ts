export enum NavigationView {
  EXPLORER = 'explorer',
  CHAT = 'chat',
  PROJECTS = 'projects',
  AGENTS_MARKETPLACE = 'agents-marketplace',
  SKILLS_MARKETPLACE = 'skills-marketplace',
  MCP_SERVERS = 'mcp-servers',
  LOGS = 'logs',
  SETTINGS = 'settings',
}

export interface NavigationItem {
  id: NavigationView;
  icon: string;
  label: string;
  tooltip: string;
}
