import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts';
import { logger } from '@/lib/logger';
import {
  DEFAULT_SHORTCUTS,
  type ShortcutAction,
  type ShortcutConfig,
  type ShortcutSettings,
} from '@/types/shortcuts';
import { ShortcutInput } from './shortcut-input';

const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  globalFileSearch: 'Global File Search',
  globalContentSearch: 'Global Content Search',
  fileSearch: 'Search in File',
  saveFile: 'Save File',
  newWindow: 'Open New Window',
  openModelSettings: 'Open Model Settings',
  toggleTerminal: 'Toggle Terminal',
  nextTerminalTab: 'Next Terminal Tab',
  previousTerminalTab: 'Previous Terminal Tab',
  newTerminalTab: 'New Terminal Tab',
};

export function ShortcutSettingsPanel() {
  const [localShortcuts, setLocalShortcuts] = useState<ShortcutSettings | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const {
    shortcuts,
    isLoading: shortcutsLoading,
    updateShortcuts,
    resetToDefaults,
  } = useGlobalShortcuts();

  // Initialize local shortcuts when shortcuts are loaded
  useEffect(() => {
    if (shortcuts && !localShortcuts) {
      setLocalShortcuts({ ...shortcuts });
    }
  }, [shortcuts, localShortcuts]);

  // Check for changes
  useEffect(() => {
    if (!shortcuts || !localShortcuts) {
      setHasChanges(false);
      return;
    }

    const hasChanged = Object.keys(shortcuts).some((key) => {
      const shortcutKey = key as ShortcutAction;
      const original = shortcuts[shortcutKey];
      const local = localShortcuts[shortcutKey];

      return (
        original.key !== local.key ||
        JSON.stringify(original.modifiers) !== JSON.stringify(local.modifiers)
      );
    });

    setHasChanges(hasChanged);
  }, [shortcuts, localShortcuts]);

  const handleShortcutChange = (action: ShortcutAction, config: ShortcutConfig) => {
    if (!localShortcuts) return;

    setLocalShortcuts({
      ...localShortcuts,
      [action]: config,
    });
  };

  const handleResetSingle = (action: ShortcutAction) => {
    if (!localShortcuts) return;

    setLocalShortcuts({
      ...localShortcuts,
      [action]: DEFAULT_SHORTCUTS[action],
    });
  };

  const handleSave = async () => {
    if (!localShortcuts) return;

    try {
      await updateShortcuts(localShortcuts);
      toast.success('Shortcut settings saved');
      setHasChanges(false);

      // Update local shortcuts to match saved shortcuts to prevent flickering
      setLocalShortcuts({ ...localShortcuts });

      // Notify other components that shortcuts have been updated
      window.dispatchEvent(new CustomEvent('shortcutsUpdated'));

      logger.info('Shortcuts saved successfully');
    } catch (error) {
      logger.error('Failed to save shortcuts:', error);
      toast.error('Failed to save shortcut settings');
    }
  };

  const handleResetAll = async () => {
    try {
      await resetToDefaults();
      // The shortcuts will be updated through the useEffect when resetToDefaults updates the global state
      toast.success('Shortcuts reset to defaults');
      setHasChanges(false);
      logger.info('All shortcuts reset to defaults');
    } catch (error) {
      logger.error('Failed to reset shortcuts:', error);
      toast.error('Failed to reset shortcuts');
    }
  };

  const handleDiscard = () => {
    if (shortcuts) {
      setLocalShortcuts({ ...shortcuts });
      setHasChanges(false);
    }
  };

  if (shortcutsLoading || !localShortcuts) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Shortcut Settings</CardTitle>
          <CardDescription>
            Customize application shortcuts. Click the input field and press your desired key
            combination.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Loading skeleton matching actual layout */}
          <div className="grid gap-4">
            {Object.keys(SHORTCUT_LABELS).map((action) => (
              <div key={`skeleton-${action}`} className="space-y-2 animate-pulse">
                {/* Label skeleton */}
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                {/* Input and buttons skeleton */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </div>
                {/* Description skeleton */}
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
              </div>
            ))}
          </div>

          <Separator />

          {/* Action buttons skeleton */}
          <div className="flex items-center justify-between">
            <div className="h-10 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
            <div className="h-10 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
          </div>

          {/* Help text skeleton */}
          <div className="space-y-2 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 animate-pulse"></div>
            <div className="space-y-1">
              {['line1', 'line2', 'line3', 'line4'].map((id) => (
                <div
                  key={`help-skeleton-${id}`}
                  className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse"
                ></div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="animate-in fade-in duration-200">
      <CardHeader>
        <CardTitle>Shortcut Settings</CardTitle>
        <CardDescription>
          Customize application shortcuts. Click the input field and press your desired key
          combination.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Shortcut inputs */}
        <div className="grid gap-4">
          {Object.entries(SHORTCUT_LABELS).map(([action, label]) => (
            <ShortcutInput
              key={action}
              label={label}
              action={action as ShortcutAction}
              value={localShortcuts[action as ShortcutAction]}
              onChange={(config) => handleShortcutChange(action as ShortcutAction, config)}
              onReset={() => handleResetSingle(action as ShortcutAction)}
            />
          ))}
        </div>

        <Separator />

        {/* Action buttons */}
        <div className="flex items-center justify-between">
          <div className="space-x-2">
            <Button variant="outline" onClick={handleResetAll} disabled={shortcutsLoading}>
              Reset All to Defaults
            </Button>
          </div>

          <div className="space-x-2">
            {hasChanges && (
              <Button variant="outline" onClick={handleDiscard} disabled={shortcutsLoading}>
                Discard Changes
              </Button>
            )}
            <Button onClick={handleSave} disabled={!hasChanges || shortcutsLoading}>
              Save Settings
            </Button>
          </div>
        </div>

        {hasChanges && (
          <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg">
            <p className="text-sm text-blue-700 dark:text-blue-200">
              You have unsaved changes. Click "Save Settings" to apply them.
            </p>
          </div>
        )}

        {/* Help text */}
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
          <h4 className="font-medium text-sm mb-2">Usage Instructions:</h4>
          <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <li>• Click an input field and press your desired key combination</li>
            <li>• Supports Cmd/Ctrl + Alt + Shift + letter key combinations</li>
            <li>• Shows Cmd on macOS, Ctrl on other platforms</li>
            <li>• Use the reset button to restore individual shortcuts to defaults</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
