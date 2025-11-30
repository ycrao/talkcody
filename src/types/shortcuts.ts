export interface ModifierKeys {
  meta?: boolean; // Cmd on macOS, Windows key on Windows/Linux
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}

export interface ShortcutConfig {
  key: string;
  modifiers: ModifierKeys;
  description: string;
}

export interface ShortcutSettings {
  globalFileSearch: ShortcutConfig;
  globalContentSearch: ShortcutConfig;
  fileSearch: ShortcutConfig;
  saveFile: ShortcutConfig;
  newWindow: ShortcutConfig;
  openModelSettings: ShortcutConfig;
  toggleTerminal: ShortcutConfig;
  nextTerminalTab: ShortcutConfig;
  previousTerminalTab: ShortcutConfig;
  newTerminalTab: ShortcutConfig;
}

export type ShortcutAction = keyof ShortcutSettings;

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  globalFileSearch: {
    key: 'o',
    modifiers: { meta: true },
    description: 'Global File Search',
  },
  globalContentSearch: {
    key: 'g',
    modifiers: { meta: true },
    description: 'Global Content Search',
  },
  fileSearch: {
    key: 'f',
    modifiers: { meta: true },
    description: 'Search in File',
  },
  saveFile: {
    key: 's',
    modifiers: { meta: true },
    description: 'Save File',
  },
  newWindow: {
    key: 'n',
    modifiers: { meta: true, shift: true },
    description: 'Open New Window',
  },
  openModelSettings: {
    key: 'm',
    modifiers: { meta: true, shift: true },
    description: 'Open Model Settings',
  },
  toggleTerminal: {
    key: 'j',
    modifiers: { meta: true },
    description: 'Toggle Terminal',
  },
  nextTerminalTab: {
    key: 'ArrowRight',
    modifiers: { meta: true },
    description: 'Next Terminal Tab',
  },
  previousTerminalTab: {
    key: 'ArrowLeft',
    modifiers: { meta: true },
    description: 'Previous Terminal Tab',
  },
  newTerminalTab: {
    key: 't',
    modifiers: { meta: true },
    description: 'New Terminal Tab',
  },
};

export const MODIFIER_LABELS = {
  // Use userAgent to detect macOS since process is not available in browser
  meta: navigator.userAgent.includes('Macintosh') ? 'Cmd' : 'Ctrl',
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
};

export function formatShortcut(config: ShortcutConfig): string {
  const parts: string[] = [];

  if (config.modifiers.meta) {
    parts.push(MODIFIER_LABELS.meta);
  }
  if (config.modifiers.ctrl) {
    parts.push(MODIFIER_LABELS.ctrl);
  }
  if (config.modifiers.alt) {
    parts.push(MODIFIER_LABELS.alt);
  }
  if (config.modifiers.shift) {
    parts.push(MODIFIER_LABELS.shift);
  }

  parts.push(config.key.toUpperCase());

  return parts.join('+');
}

export function parseShortcutString(shortcutString: string): ShortcutConfig | null {
  const parts = shortcutString.toLowerCase().split('+');
  if (parts.length === 0) return null;

  const key = parts[parts.length - 1];
  if (!key) return null;
  const modifierParts = parts.slice(0, -1);

  const modifiers: ModifierKeys = {};

  for (const part of modifierParts) {
    switch (part) {
      case 'cmd':
      case 'command':
      case 'meta':
        modifiers.meta = true;
        break;
      case 'ctrl':
      case 'control':
        modifiers.ctrl = true;
        break;
      case 'alt':
      case 'option':
        modifiers.alt = true;
        break;
      case 'shift':
        modifiers.shift = true;
        break;
    }
  }

  return {
    key,
    modifiers,
    description: '',
  };
}

export function shortcutMatches(event: KeyboardEvent, config: ShortcutConfig): boolean {
  if (event.key.toLowerCase() !== config.key.toLowerCase()) {
    return false;
  }

  return (
    Boolean(event.metaKey) === Boolean(config.modifiers.meta) &&
    Boolean(event.ctrlKey) === Boolean(config.modifiers.ctrl) &&
    Boolean(event.altKey) === Boolean(config.modifiers.alt) &&
    Boolean(event.shiftKey) === Boolean(config.modifiers.shift)
  );
}

export function getShortcutSettingKey(action: ShortcutAction): string {
  return `shortcut_${action}`;
}
