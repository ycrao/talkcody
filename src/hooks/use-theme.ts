import { useCallback, useEffect, useState } from 'react';
import { logger } from '@/lib/logger';
import { settingsManager } from '@/stores/settings-store';

export type Theme = 'light' | 'dark' | 'system';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

  // Notify listeners across the app when theme changes
  const notifyThemeChange = useCallback((resolved: 'light' | 'dark') => {
    try {
      window.dispatchEvent(
        new CustomEvent('theme-changed', {
          detail: { resolvedTheme: resolved },
        })
      );
    } catch (_e) {
      // no-op if window unavailable
    }
  }, []);

  // Get system theme preference
  const getSystemTheme = useCallback((): 'light' | 'dark' => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  }, []);

  // Apply theme to document
  const applyTheme = useCallback((resolvedTheme: 'light' | 'dark') => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
  }, []);

  // Set theme and persist to settings
  const setTheme = useCallback(
    async (newTheme: Theme) => {
      try {
        await settingsManager.set('theme', newTheme);
        setThemeState(newTheme);

        const resolved = newTheme === 'system' ? getSystemTheme() : newTheme;
        setResolvedTheme(resolved);
        applyTheme(resolved);
        notifyThemeChange(resolved);
      } catch (error) {
        logger.error('Failed to set theme:', error);
      }
    },
    [getSystemTheme, applyTheme, notifyThemeChange]
  );

  // Toggle between light and dark (skip system for manual toggle)
  const toggleTheme = useCallback(() => {
    const newTheme = resolvedTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  }, [resolvedTheme, setTheme]);

  // Initialize theme from settings
  useEffect(() => {
    const initializeTheme = async () => {
      try {
        const savedTheme = (await settingsManager.get('theme')) as Theme;
        const initialTheme = savedTheme || 'system';
        setThemeState(initialTheme);

        const resolved = initialTheme === 'system' ? getSystemTheme() : initialTheme;
        setResolvedTheme(resolved);
        applyTheme(resolved);
        notifyThemeChange(resolved);
      } catch (error) {
        logger.error('Failed to initialize theme:', error);
        // Fallback to system theme
        const systemTheme = getSystemTheme();
        setResolvedTheme(systemTheme);
        applyTheme(systemTheme);
        notifyThemeChange(systemTheme);
      }
    };

    initializeTheme();
  }, [getSystemTheme, applyTheme, notifyThemeChange]);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      const systemTheme = e.matches ? 'dark' : 'light';
      setResolvedTheme(systemTheme);
      applyTheme(systemTheme);
      notifyThemeChange(systemTheme);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, applyTheme, notifyThemeChange]);

  return {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
  };
}
