import { ChevronDown, Edit2, Plus, Power, PowerOff, RefreshCw, Server, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMultiMCPTools } from '@/hooks/use-multi-mcp-tools';
import { DOC_LINKS } from '@/lib/doc-links';
import { logger } from '@/lib/logger';
import { TransportFactory } from '@/lib/mcp/transport-factory';
import {
  type CreateMCPServerData,
  databaseService,
  type MCPServer,
  type UpdateMCPServerData,
} from '@/services/database-service';

interface MCPServerFormData {
  id: string;
  name: string;
  url: string;
  protocol: 'http' | 'sse' | 'stdio';
  api_key?: string;
  headers?: string; // JSON string
  stdio_command?: string;
  stdio_args?: string; // JSON string
}

export function MCPServersPage() {
  // Generate unique IDs for form fields
  const createIdId = useId();
  const createNameId = useId();
  const createUrlId = useId();
  const createApiKeyId = useId();
  const createHeadersId = useId();
  const createCommandId = useId();
  const createArgsId = useId();
  const editIdId = useId();
  const editNameId = useId();
  const editUrlId = useId();
  const editApiKeyId = useId();
  const editHeadersId = useId();
  const editCommandId = useId();
  const editArgsId = useId();

  const {
    servers,
    isLoading,
    error,
    refreshTools,
    refreshServer,
    enableServer,
    disableServer,
    reloadData,
  } = useMultiMCPTools();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null);
  const [serverToDelete, setServerToDelete] = useState<MCPServer | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [formData, setFormData] = useState<MCPServerFormData>({
    id: '',
    name: '',
    url: '',
    protocol: 'http',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setFormData({
      id: '',
      name: '',
      url: '',
      protocol: 'http',
    });
    setFormError(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsCreateDialogOpen(true);
  };

  const openEditDialog = (server: MCPServer) => {
    setEditingServer(server);
    setFormData({
      id: server.id,
      name: server.name,
      url: server.url,
      protocol: server.protocol,
      api_key: server.api_key || '',
      headers: JSON.stringify(server.headers || {}, null, 2),
      stdio_command: server.stdio_command || '',
      stdio_args: JSON.stringify(server.stdio_args || [], null, 2),
    });
    setFormError(null);
    setIsEditDialogOpen(true);
  };

  const validateForm = (): boolean => {
    if (!formData.id.trim()) {
      setFormError('Server ID is required');
      return false;
    }

    if (!formData.name.trim()) {
      setFormError('Server name is required');
      return false;
    }

    // Validate protocol-specific fields
    if (formData.protocol === 'stdio') {
      if (!formData.stdio_command?.trim()) {
        setFormError('Command is required for stdio protocol');
        return false;
      }
    } else {
      if (!formData.url.trim()) {
        setFormError('URL is required for HTTP/SSE protocols');
        return false;
      }

      try {
        new URL(formData.url);
      } catch {
        setFormError('Invalid URL format');
        return false;
      }
    }

    // Validate JSON fields
    if (formData.headers?.trim()) {
      try {
        JSON.parse(formData.headers);
      } catch {
        setFormError('Headers must be valid JSON');
        return false;
      }
    }

    if (formData.stdio_args?.trim()) {
      try {
        const args = JSON.parse(formData.stdio_args);
        if (!Array.isArray(args)) {
          setFormError('Arguments must be a JSON array');
          return false;
        }
      } catch {
        setFormError('Arguments must be valid JSON array');
        return false;
      }
    }

    return true;
  };

  const handleCreateServer = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const serverData: CreateMCPServerData = {
        id: formData.id.trim(),
        name: formData.name.trim(),
        url: formData.url.trim(),
        protocol: formData.protocol,
        api_key: formData.api_key?.trim() || undefined,
        headers: formData.headers?.trim() ? JSON.parse(formData.headers) : undefined,
        stdio_command: formData.stdio_command?.trim() || undefined,
        stdio_args: formData.stdio_args?.trim() ? JSON.parse(formData.stdio_args) : undefined,
        is_enabled: true,
        is_built_in: false,
      };

      await databaseService.createMCPServer(serverData);
      await reloadData();
      setIsCreateDialogOpen(false);
      resetForm();

      logger.info(`Created MCP server: ${serverData.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create server';
      setFormError(message);
      logger.error('Failed to create MCP server:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateServer = async () => {
    if (!editingServer || !validateForm()) return;

    setIsSubmitting(true);
    try {
      const updateData: UpdateMCPServerData = {
        name: formData.name.trim(),
        url: formData.url.trim(),
        protocol: formData.protocol,
        api_key: formData.api_key?.trim() || undefined,
        headers: formData.headers?.trim() ? JSON.parse(formData.headers) : undefined,
        stdio_command: formData.stdio_command?.trim() || undefined,
        stdio_args: formData.stdio_args?.trim() ? JSON.parse(formData.stdio_args) : undefined,
      };

      await databaseService.updateMCPServer(editingServer.id, updateData);
      await refreshServer(editingServer.id);
      await reloadData();
      setIsEditDialogOpen(false);
      setEditingServer(null);

      logger.info(`Updated MCP server: ${editingServer.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update server';
      setFormError(message);
      logger.error('Failed to update MCP server:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteServer = (server: MCPServer) => {
    if (server.is_built_in) {
      alert('Cannot delete built-in servers');
      return;
    }

    setServerToDelete(server);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteServer = async () => {
    if (!serverToDelete) return;

    try {
      await databaseService.deleteMCPServer(serverToDelete.id);
      await reloadData();

      logger.info(`Deleted MCP server: ${serverToDelete.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete server';
      alert(message);
      logger.error('Failed to delete MCP server:', error);
    } finally {
      setServerToDelete(null);
      setIsDeleteDialogOpen(false);
    }
  };

  const handleToggleServer = async (server: MCPServer) => {
    try {
      if (server.is_enabled) {
        await disableServer(server.id);
      } else {
        await enableServer(server.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to toggle server';
      alert(message);
      logger.error('Failed to toggle MCP server:', error);
    }
  };

  const supportedProtocols = TransportFactory.getSupportedProtocols();

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">MCP Servers</h1>
            <HelpTooltip
              title="MCP Servers"
              description="Model Context Protocol (MCP) servers provide external tools and integrations. Connect to services like databases, APIs, and other external systems to extend the AI agent's capabilities."
              docUrl={DOC_LINKS.features.mcpServers}
            />
          </div>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage Model Context Protocol servers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refreshTools} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh All
          </Button>
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add Server
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-6">
          {/* Error Alert */}
          {error && (
            <Alert className="mb-6 border-red-200 bg-red-50 text-red-800">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Servers Grid */}
          <div className="grid gap-4">
            {servers.map((serverData) => (
              <Card key={serverData.server.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Server className="h-5 w-5" />
                      <div>
                        <CardTitle className="text-lg">{serverData.server.name}</CardTitle>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {serverData.server.url || `Command: ${serverData.server.stdio_command}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Status Badges */}
                      {serverData.server.is_built_in && <Badge variant="secondary">Built-in</Badge>}

                      <Badge
                        variant={serverData.server.protocol === 'http' ? 'default' : 'outline'}
                      >
                        {serverData.server.protocol.toUpperCase()}
                      </Badge>

                      {serverData.isConnected ? (
                        <Badge className="bg-green-100 text-green-800">
                          Connected ({serverData.toolCount} tools)
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Disconnected</Badge>
                      )}

                      {/* Action Buttons */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => refreshServer(serverData.server.id)}
                            disabled={isLoading}
                          >
                            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Refresh connection</p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleServer(serverData.server)}
                            disabled={isLoading}
                          >
                            {serverData.server.is_enabled ? (
                              <Power className="h-4 w-4 text-green-600" />
                            ) : (
                              <PowerOff className="h-4 w-4 text-gray-400" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{serverData.server.is_enabled ? 'Disable server' : 'Enable server'}</p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditDialog(serverData.server)}
                            disabled={isLoading}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Edit server</p>
                        </TooltipContent>
                      </Tooltip>

                      {!serverData.server.is_built_in && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteServer(serverData.server)}
                          disabled={isLoading}
                          title="Delete server"
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {serverData.error && (
                  <CardContent className="pt-0">
                    <Alert className="border-red-200 bg-red-50 text-red-800">
                      <AlertDescription>{serverData.error}</AlertDescription>
                    </Alert>
                  </CardContent>
                )}

                {/* GitHub MCP Server Setup Instructions */}
                {serverData.server.id === 'github' && !serverData.server.api_key && (
                  <CardContent className="pt-0">
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Alert className="cursor-pointer border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
                          <div className="flex items-center gap-2">
                            <span className="whitespace-nowrap text-sm font-medium">
                              Setup Required
                            </span>
                            <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                          </div>
                        </Alert>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-2 space-y-1 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
                          <p>This server requires a GitHub Personal Access Token (PAT).</p>
                          <p>
                            1. Go to GitHub Settings → Developer settings → Personal access tokens →
                            Tokens (classic)
                          </p>
                          <p>
                            2. Generate a new token with these scopes:{' '}
                            <span className="inline-flex flex-wrap gap-1">
                              <code>repo</code>
                              <code>read:packages</code>
                              <code>read:org</code>
                            </span>
                          </p>
                          <p>3. Edit this server and add the token as the API Key</p>
                          <p>4. Enable the server after adding the token</p>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </CardContent>
                )}

                {/* GitHub MCP Server Connection Error Help */}
                {serverData.server.id === 'github' &&
                  serverData.server.api_key &&
                  serverData.error && (
                    <CardContent className="pt-0">
                      <Alert className="border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200">
                        <AlertDescription>
                          <strong>Connection Failed:</strong> Please check:
                          <br />• Token has correct scopes:{' '}
                          <span className="inline-flex flex-wrap gap-1">
                            <code>repo</code>
                            <code>read:packages</code>
                            <code>read:org</code>
                          </span>
                          <br />• Token is not expired
                          <br />• Network connection is available
                          <br />• GitHub API is accessible
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                  )}

                {serverData.server.is_enabled && serverData.tools.length > 0 && (
                  <CardContent className="pt-0">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      <strong>Available Tools:</strong>{' '}
                      {serverData.tools.map((tool) => tool.name).join(', ')}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}

            {servers.length === 0 && !isLoading && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Server className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                    No MCP servers configured
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 text-center mt-2 mb-4">
                    Get started by adding your first MCP server
                  </p>
                  <Button onClick={openCreateDialog}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Server
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Create Server Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add MCP Server</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {formError && (
              <Alert className="border-red-200 bg-red-50 text-red-800">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor={createIdId}>Server ID</Label>
                <Input
                  id={createIdId}
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  placeholder="e.g., my-server"
                />
              </div>
              <div>
                <Label htmlFor={createNameId}>Name</Label>
                <Input
                  id={createNameId}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., My MCP Server"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="create-protocol">Protocol</Label>
              <Select
                value={formData.protocol}
                onValueChange={(value: 'http' | 'sse' | 'stdio') =>
                  setFormData({ ...formData, protocol: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {supportedProtocols.map((protocol) => (
                    <SelectItem key={protocol.value} value={protocol.value}>
                      <div>
                        <div className="font-medium">{protocol.label}</div>
                        <div className="text-xs text-gray-500">{protocol.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.protocol !== 'stdio' ? (
              <>
                <div>
                  <Label htmlFor={createUrlId}>URL</Label>
                  <Input
                    id={createUrlId}
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    placeholder="https://api.example.com/mcp"
                  />
                </div>

                <div>
                  <Label htmlFor={createApiKeyId}>API Key (optional)</Label>
                  <Input
                    id={createApiKeyId}
                    type="password"
                    value={formData.api_key || ''}
                    onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                    placeholder="Bearer token or API key"
                  />
                </div>

                <div>
                  <Label htmlFor={createHeadersId}>Headers (optional JSON)</Label>
                  <Textarea
                    id={createHeadersId}
                    value={formData.headers || ''}
                    onChange={(e) => setFormData({ ...formData, headers: e.target.value })}
                    placeholder='{"Authorization": "Bearer token", "X-Custom": "value"}'
                    rows={3}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor={createCommandId}>Command</Label>
                  <Input
                    id={createCommandId}
                    value={formData.stdio_command || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        stdio_command: e.target.value,
                      })
                    }
                    placeholder="node"
                  />
                </div>

                <div>
                  <Label htmlFor={createArgsId}>Arguments (JSON array)</Label>
                  <Textarea
                    id={createArgsId}
                    value={formData.stdio_args || ''}
                    onChange={(e) => setFormData({ ...formData, stdio_args: e.target.value })}
                    placeholder='["path/to/server.js", "--option", "value"]'
                    rows={3}
                  />
                </div>
              </>
            )}

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateServer} disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Server'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Server Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit MCP Server</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {formError && (
              <Alert className="border-red-200 bg-red-50 text-red-800">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor={editIdId}>Server ID</Label>
                <Input
                  id={editIdId}
                  value={formData.id}
                  disabled
                  className="bg-gray-100 dark:bg-gray-800"
                />
              </div>
              <div>
                <Label htmlFor={editNameId}>Name</Label>
                <Input
                  id={editNameId}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., My MCP Server"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-protocol">Protocol</Label>
              <Select
                value={formData.protocol}
                onValueChange={(value: 'http' | 'sse' | 'stdio') =>
                  setFormData({ ...formData, protocol: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {supportedProtocols.map((protocol) => (
                    <SelectItem key={protocol.value} value={protocol.value}>
                      <div>
                        <div className="font-medium">{protocol.label}</div>
                        <div className="text-xs text-gray-500">{protocol.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.protocol !== 'stdio' ? (
              <>
                <div>
                  <Label htmlFor={editUrlId}>URL</Label>
                  <Input
                    id={editUrlId}
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    placeholder="https://api.example.com/mcp"
                  />
                </div>

                <div>
                  <Label htmlFor={editApiKeyId}>API Key (optional)</Label>
                  <Input
                    id={editApiKeyId}
                    type="password"
                    value={formData.api_key || ''}
                    onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                    placeholder="Bearer token or API key"
                  />
                </div>

                <div>
                  <Label htmlFor={editHeadersId}>Headers (optional JSON)</Label>
                  <Textarea
                    id={editHeadersId}
                    value={formData.headers || ''}
                    onChange={(e) => setFormData({ ...formData, headers: e.target.value })}
                    placeholder='{"Authorization": "Bearer token", "X-Custom": "value"}'
                    rows={3}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor={editCommandId}>Command</Label>
                  <Input
                    id={editCommandId}
                    value={formData.stdio_command || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        stdio_command: e.target.value,
                      })
                    }
                    placeholder="node"
                  />
                </div>

                <div>
                  <Label htmlFor={editArgsId}>Arguments (JSON array)</Label>
                  <Textarea
                    id={editArgsId}
                    value={formData.stdio_args || ''}
                    onChange={(e) => setFormData({ ...formData, stdio_args: e.target.value })}
                    placeholder='["path/to/server.js", "--option", "value"]'
                    rows={3}
                  />
                </div>
              </>
            )}

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button onClick={handleUpdateServer} disabled={isSubmitting}>
                {isSubmitting ? 'Updating...' : 'Update Server'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete MCP Server</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{serverToDelete?.name}"? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setServerToDelete(null);
                setIsDeleteDialogOpen(false);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteServer}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
