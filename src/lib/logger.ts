// Direct re-exports to preserve original stack trace behavior
export { debug, error, info, trace, warn } from '@tauri-apps/plugin-log';

// Import the original functions
import {
  debug as tauriDebug,
  error as tauriError,
  info as tauriInfo,
  trace as tauriTrace,
  warn as tauriWarn,
} from '@tauri-apps/plugin-log';

// For users who prefer the logger object interface with parameter support
export const logger = {
  trace: (message: string, ...args: any[]) => {
    const formattedMessage =
      args.length > 0
        ? `${message} ${args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, '\t') : String(arg))).join(' ')}`
        : message;
    return tauriTrace(formattedMessage);
  },

  debug: (message: string, ...args: any[]) => {
    const formattedMessage =
      args.length > 0
        ? `${message} ${args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, '\t') : String(arg))).join(' ')}`
        : message;
    return tauriDebug(formattedMessage);
  },

  info: (message: string, ...args: any[]) => {
    const formattedMessage =
      args.length > 0
        ? `${message} ${args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, '\t') : String(arg))).join(' ')}`
        : message;
    return tauriInfo(formattedMessage);
  },

  warn: (message: string, ...args: any[]) => {
    const formattedMessage =
      args.length > 0
        ? `${message} ${args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, '\t') : String(arg))).join(' ')}`
        : message;
    return tauriWarn(formattedMessage);
  },

  error: (message: string, errorObj?: Error | unknown, ...args: any[]) => {
    const errorMessage = errorObj instanceof Error ? errorObj.message : String(errorObj || '');
    const allArgs = errorMessage ? [errorMessage, ...args] : args;
    const formattedMessage =
      allArgs.length > 0
        ? `${message} ${allArgs.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ')}`
        : message;
    return tauriError(formattedMessage);
  },
};
