import Editor, { type Monaco, useMonaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useEffect, useMemo, useRef } from 'react';
import { EDITOR_OPTIONS } from '@/constants/editor';
import { useTheme } from '@/hooks/use-theme';
import { logger } from '@/lib/logger';
import { createTextModelService } from '@/services/monaco-text-model-service';
import { repositoryService } from '@/services/repository-service';
import { setupMonacoTheme } from '@/utils/monaco-utils';

interface FileEditorContentProps {
  filePath: string;
  currentContent: string;
  onContentChange: (value: string | undefined) => void;
  onEditorDidMount: (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => void;
  onSave: () => void;
}

export function FileEditorContent({
  filePath,
  currentContent,
  onContentChange,
  onEditorDidMount,
  onSave,
}: FileEditorContentProps) {
  const fileName = repositoryService.getFileNameFromPath(filePath);
  const language = repositoryService.getLanguageFromExtension(fileName);
  const { resolvedTheme } = useTheme();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  // Use useMonaco hook to get Monaco instance before editor renders
  // This allows us to create overrideServices with the Monaco instance
  const monacoFromHook = useMonaco();

  // Create overrideServices for cross-file peek widget support
  // This is required because Monaco standalone mode cannot resolve models by URI
  // See: https://github.com/microsoft/monaco-editor/issues/935
  const overrideServices = useMemo(() => {
    if (!monacoFromHook) {
      logger.info('[TextModelService] Monaco not yet loaded, overrideServices will be empty');
      return {};
    }
    logger.info('[TextModelService] Creating textModelService with Monaco instance');
    return {
      textModelService: createTextModelService(monacoFromHook),
    };
  }, [monacoFromHook]);

  // Handle theme changes
  useEffect(() => {
    if (monacoRef.current && editorRef.current) {
      const theme = resolvedTheme === 'light' ? 'light-ai' : 'vs-dark-ai';
      logger.info('Setting Monaco theme to:', theme);

      // Force update the theme using Monaco API
      monacoRef.current.editor.setTheme(theme);

      // Also trigger a layout update to ensure rendering
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.layout();
        }
      }, 0);
    }
  }, [resolvedTheme]);

  // Listen for global theme change events to keep Monaco in sync
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        resolvedTheme?: 'light' | 'dark';
      };
      const rt = detail?.resolvedTheme;
      if (!(rt && monacoRef.current)) return;
      const theme = rt === 'light' ? 'light-ai' : 'vs-dark-ai';
      logger.info('Monaco receiving theme-changed event ->', theme);
      // Make sure themes are defined; in case of fresh load
      setupMonacoTheme(rt, monacoRef.current);
      monacoRef.current.editor.setTheme(theme);
      editorRef.current?.layout();
    };
    window.addEventListener('theme-changed', handler as EventListener);
    return () => window.removeEventListener('theme-changed', handler as EventListener);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        onSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onSave]);

  const handleEditorDidMount = (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Setup custom themes with AI suggestion support using the actual Monaco instance
    setupMonacoTheme(resolvedTheme, monaco);

    // Set initial theme immediately after mount
    const theme = resolvedTheme === 'light' ? 'light-ai' : 'vs-dark-ai';
    monaco.editor.setTheme(theme);

    onEditorDidMount(editor, monaco);
  };

  return (
    <div className="min-h-0 flex-1">
      <Editor
        key={resolvedTheme}
        path={filePath}
        className="h-full"
        language={language}
        loading={false}
        onChange={onContentChange}
        beforeMount={(monaco) => {
          // Ensure themes exist before the editor is created
          monacoRef.current = monaco;
          setupMonacoTheme(resolvedTheme, monaco);

          // Disable TypeScript/JavaScript diagnostics globally before editor mounts
          monaco.languages.typescript?.typescriptDefaults?.setDiagnosticsOptions({
            noSemanticValidation: true,
            noSyntaxValidation: true,
            noSuggestionDiagnostics: true,
          });
          monaco.languages.typescript?.javascriptDefaults?.setDiagnosticsOptions({
            noSemanticValidation: true,
            noSyntaxValidation: true,
            noSuggestionDiagnostics: true,
          });
        }}
        onMount={handleEditorDidMount}
        options={EDITOR_OPTIONS}
        overrideServices={overrideServices}
        theme={resolvedTheme === 'light' ? 'light-ai' : 'vs-dark-ai'}
        value={currentContent}
      />
    </div>
  );
}
