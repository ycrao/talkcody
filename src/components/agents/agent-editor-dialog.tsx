// Agent editor dialog for creating/editing agents
import { useCallback, useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { BuiltInToolsSelector } from '@/components/agents/built-in-tools-selector';
import { DynamicContextPanel } from '@/components/agents/dynamic-context-panel';
import { MCPToolsSelector } from '@/components/agents/mcp-tools-selector';
import { ModelTypeSelector } from '@/components/selectors/model-type-selector';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { logger } from '@/lib/logger';
import type { AgentDefinition } from '@/types/agent';
import { ModelType } from '@/types/model-types';

interface AgentEditorDialogProps {
  agent?: AgentDefinition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (agentData: {
    id?: string;
    name: string;
    description?: string;
    modelType: ModelType;
    systemPrompt: string;
    selectedTools: string[];
    rules?: string;
    outputFormat?: string;
    dynamicEnabled: boolean;
    dynamicProviders: string[];
    dynamicVariables: Record<string, string>;
    dynamicProviderSettings?: Record<string, unknown>;
  }) => Promise<void>;
  onClose: () => void;
}

export function AgentEditorDialog({
  agent,
  open,
  onOpenChange,
  onSave,
  onClose,
}: AgentEditorDialogProps) {
  const [activeTab, setActiveTab] = useState('basic');
  const [saving, setSaving] = useState(false);

  // Generate unique IDs for form elements
  const nameId = useId();
  const descriptionId = useId();
  const rulesId = useId();
  const outputFormatId = useId();
  const systemPromptId = useId();

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [modelType, setModelType] = useState<ModelType>(ModelType.MAIN);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [rules, setRules] = useState('');
  const [outputFormat, setOutputFormat] = useState('');
  const [dynamicEnabled, setDynamicEnabled] = useState(false);
  const [dynamicProviders, setDynamicProviders] = useState<string[]>(['env', 'agents_md']);
  const [dynamicVariables, setDynamicVariables] = useState<Record<string, string>>({});
  const [dynamicProviderSettings, setDynamicProviderSettings] = useState<Record<string, unknown>>(
    {}
  );

  // Stable callback for DynamicContextPanel to prevent infinite re-renders
  const handleDynamicChange = useCallback(
    (dynamicPrompt: {
      enabled: boolean;
      providers: string[];
      variables: Record<string, string>;
      providerSettings?: Record<string, unknown>;
    }) => {
      setDynamicEnabled(dynamicPrompt.enabled);
      setDynamicProviders(dynamicPrompt.providers);
      setDynamicVariables(dynamicPrompt.variables);
      setDynamicProviderSettings(dynamicPrompt.providerSettings || {});
    },
    []
  );

  // Load agent data when editing
  useEffect(() => {
    if (agent) {
      setName(agent.name);
      setDescription(agent.description || '');
      // Use modelType if available, otherwise default to MAIN
      setModelType(agent.modelType ? agent.modelType : ModelType.MAIN);
      setSystemPrompt(
        typeof agent.systemPrompt === 'function' ? '' : (agent.systemPrompt as string)
      );
      setSelectedTools(Object.keys(agent.tools ?? {}));
      setRules(agent.rules || '');
      setOutputFormat(agent.outputFormat || '');
      setDynamicEnabled(agent.dynamicPrompt?.enabled ?? false);
      setDynamicProviders(agent.dynamicPrompt?.providers ?? ['env', 'agents_md']);
      setDynamicVariables(agent.dynamicPrompt?.variables ?? {});
      setDynamicProviderSettings(agent.dynamicPrompt?.providerSettings ?? {});
    } else {
      // Reset form for new agent
      setName('');
      setDescription('');
      setModelType(ModelType.MAIN);
      setSystemPrompt('');
      setSelectedTools([]);
      setRules('');
      setOutputFormat('');
      setDynamicEnabled(false);
      setDynamicProviders(['env', 'agents_md']);
      setDynamicVariables({});
      setDynamicProviderSettings({});
    }
  }, [agent]);

  const handleSave = async () => {
    // Validation
    if (!name.trim()) {
      toast.error('Agent name is required');
      return;
    }
    if (!systemPrompt.trim()) {
      toast.error('System prompt is required');
      return;
    }

    try {
      setSaving(true);

      const agentData = {
        id: agent?.id,
        name: name.trim(),
        description: description.trim() || undefined,
        modelType,
        systemPrompt: systemPrompt.trim(),
        selectedTools,
        rules: rules.trim() || undefined,
        outputFormat: outputFormat.trim() || undefined,
        dynamicEnabled,
        dynamicProviders,
        dynamicVariables,
        dynamicProviderSettings,
      };

      await onSave(agentData);
      toast.success(agent ? 'Agent updated successfully' : 'Agent created successfully');
      onClose();
    } catch (error) {
      logger.error('Failed to save agent:', error);
      toast.error('Failed to save agent');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-fit min-w-4/5 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>{agent ? 'Edit Agent' : 'Create New Agent'}</DialogTitle>
          <DialogDescription>
            {agent
              ? 'Update your agent configuration'
              : 'Create a new AI agent with custom behavior'}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="border-b px-6">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="prompt">Prompt & Tools</TabsTrigger>
              <TabsTrigger value="dynamic">Dynamic Context</TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 px-6">
            <TabsContent value="basic" className="mt-4 space-y-4">
              <div>
                <Label htmlFor={nameId}>Name *</Label>
                <Input
                  id={nameId}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Code Assistant"
                />
              </div>

              <div>
                <Label htmlFor={descriptionId}>Description</Label>
                <Textarea
                  id={descriptionId}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of this agent's purpose..."
                  rows={2}
                />
              </div>

              <div>
                <Label htmlFor="model-type">Model Type *</Label>
                <ModelTypeSelector value={modelType} onValueChange={setModelType} label="" />
                <p className="text-xs text-muted-foreground mt-1">
                  Select the model type category for this agent. Configure actual models in Settings
                  → Models.
                </p>
              </div>

              <div>
                <Label htmlFor={rulesId}>Rules</Label>
                <Textarea
                  id={rulesId}
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  placeholder="Optional rules for agent behavior..."
                  rows={3}
                  className="font-mono text-sm"
                />
              </div>

              <div>
                <Label htmlFor={outputFormatId}>Output Format</Label>
                <Textarea
                  id={outputFormatId}
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value)}
                  placeholder="Optional output format instructions..."
                  rows={3}
                  className="font-mono text-sm"
                />
              </div>
            </TabsContent>

            <TabsContent value="prompt" className="mt-4 space-y-4">
              <div>
                <Label htmlFor={systemPromptId}>System Prompt *</Label>
                <Textarea
                  id={systemPromptId}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="System prompt that defines the agent's behavior and personality..."
                  rows={12}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  The core instructions that define how this agent behaves and responds
                </p>
              </div>

              <div className="space-y-4">
                <Label>Available Tools</Label>
                <BuiltInToolsSelector
                  selectedTools={selectedTools}
                  onToolsChange={setSelectedTools}
                />
                <MCPToolsSelector selectedTools={selectedTools} onToolsChange={setSelectedTools} />
              </div>
            </TabsContent>

            <TabsContent value="dynamic" className="mt-4 pb-4">
              <DynamicContextPanel
                agent={{
                  id: agent?.id || 'new-agent',
                  name: name,
                  description: description,
                  modelType: modelType,
                  systemPrompt: systemPrompt,
                  tools: {},
                  dynamicPrompt: {
                    enabled: dynamicEnabled,
                    providers: dynamicProviders,
                    variables: dynamicVariables,
                    providerSettings: dynamicProviderSettings,
                  },
                }}
                onChange={handleDynamicChange}
              />
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="p-6 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : agent ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
