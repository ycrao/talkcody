export enum NavigationView {
  EXPLORER = 'explorer',
  CHAT = 'chat',
  PROJECTS = 'projects',
  AGENTS = 'agents',
  MARKETPLACE = 'marketplace',
  SKILLS_MARKETPLACE = 'skills-marketplace',
  MCP_SERVERS = 'mcp-servers',
  SETTINGS = 'settings',
}

export interface NavigationItem {
  id: NavigationView;
  icon: string;
  label: string;
  tooltip: string;
}
