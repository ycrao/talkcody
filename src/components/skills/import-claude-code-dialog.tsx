/**
 * Import Claude Code Skills Dialog
 */

import { AlertCircle, CheckCircle2, Circle, Folder, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { logger } from '@/lib/logger';
import {
  ClaudeCodeImporter,
  type ClaudeCodeSkillInfo,
  type ClaudeCodeSkillLocation,
} from '@/services/skills/claude-code-importer';

interface ImportClaudeCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

export function ImportClaudeCodeDialog({
  open,
  onOpenChange,
  onImportComplete,
}: ImportClaudeCodeDialogProps) {
  const [locations, setLocations] = useState<ClaudeCodeSkillLocation[]>([]);
  const [skills, setSkills] = useState<ClaudeCodeSkillInfo[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    succeeded: string[];
    failed: Array<{ path: string; error: string }>;
  } | null>(null);

  const scanForSkills = useCallback(async () => {
    setIsScanning(true);
    try {
      const paths = await ClaudeCodeImporter.getClaudeCodePaths();
      setLocations(paths);

      if (paths.length === 0) {
        logger.info('No Claude Code skills directories found');
        return;
      }

      // Scan first location by default
      const firstPath = paths[0];
      if (!firstPath) {
        logger.info('No first path found');
        return;
      }
      const detectedSkills = await ClaudeCodeImporter.scanClaudeCodeDirectory(firstPath.path);
      setSkills(detectedSkills);

      // Auto-select all valid skills
      const validSkillPaths = new Set(detectedSkills.map((s) => s.sourcePath));
      setSelectedSkills(validSkillPaths);
    } catch (error) {
      logger.error('Failed to scan for Claude Code skills:', error);
    } finally {
      setIsScanning(false);
    }
  }, []);

  // Scan for Claude Code skills on dialog open
  useEffect(() => {
    if (open) {
      scanForSkills();
    } else {
      // Reset state when dialog closes
      setSkills([]);
      setSelectedSkills(new Set());
      setImportResult(null);
    }
  }, [open, scanForSkills]);

  const toggleSkill = (skillPath: string) => {
    const newSelected = new Set(selectedSkills);
    if (newSelected.has(skillPath)) {
      newSelected.delete(skillPath);
    } else {
      newSelected.add(skillPath);
    }
    setSelectedSkills(newSelected);
  };

  const handleImport = async () => {
    if (selectedSkills.size === 0) return;

    setIsImporting(true);
    try {
      const result = await ClaudeCodeImporter.importMultipleSkills(Array.from(selectedSkills));
      setImportResult(result);

      if (result.succeeded.length > 0) {
        onImportComplete?.();
      }
    } catch (error) {
      logger.error('Import failed:', error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Claude Code Skills</DialogTitle>
          <DialogDescription>Import skills from your Claude Code installation</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {isScanning ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Scanning for Claude Code skills...</span>
            </div>
          ) : locations.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No Claude Code skills directory found. Claude Code skills are typically located at{' '}
                <code>~/.claude/skills/</code>
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Folder className="h-4 w-4" />
                  <span>{locations[0]?.name}</span>
                </div>

                {skills.length === 0 ? (
                  <Alert>
                    <AlertDescription>
                      No valid skills found in the Claude Code directory.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-1">
                    <div className="text-sm font-medium mb-2">
                      Found {skills.length} skill{skills.length !== 1 ? 's' : ''}:
                    </div>

                    {skills.map((skill) => (
                      <button
                        key={skill.sourcePath}
                        type="button"
                        onClick={() => toggleSkill(skill.sourcePath)}
                        disabled={isImporting}
                        className="w-full flex items-start gap-3 p-3 rounded-lg border hover:bg-accent transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {selectedSkills.has(skill.sourcePath) ? (
                          <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{skill.skillName}</div>
                          <div className="text-sm text-muted-foreground line-clamp-2">
                            {skill.description}
                          </div>

                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            {skill.hasReferenceMd && <span>📄 Reference</span>}
                            {skill.hasScriptsDir && (
                              <span>📜 {skill.scriptFiles.length} script(s)</span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {importResult && (
                <div className="space-y-2">
                  {importResult.succeeded.length > 0 && (
                    <Alert>
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertDescription>
                        Successfully imported {importResult.succeeded.length} skill
                        {importResult.succeeded.length !== 1 ? 's' : ''}
                      </AlertDescription>
                    </Alert>
                  )}

                  {importResult.failed.length > 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Failed to import {importResult.failed.length} skill
                        {importResult.failed.length !== 1 ? 's' : ''}:
                        <ul className="list-disc list-inside mt-2 text-xs">
                          {importResult.failed.map((f) => (
                            <li key={f.path}>
                              {f.path.split('/').pop()}: {f.error}
                            </li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isImporting}>
            {importResult ? 'Close' : 'Cancel'}
          </Button>
          {!importResult && (
            <Button
              onClick={handleImport}
              disabled={selectedSkills.size === 0 || isImporting || skills.length === 0}
            >
              {isImporting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Import {selectedSkills.size > 0 && `(${selectedSkills.size})`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
