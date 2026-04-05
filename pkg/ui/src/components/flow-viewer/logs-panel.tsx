'use client';

import {
  ChevronUp,
  ChevronDown,
  Terminal,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Bot,
  Wrench,
} from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import { cn } from '~/lib/utils';
import {
  ExecutionLogNode,
  ExecutionLogAttempt,
  ExecutionLogToolCall,
  SelectedExecutionAttempt,
} from './use-execution-log-data';
import { NodeExecutionStatus, GraphNodeType } from '@invect/core/types';
import { CodeMirrorJsonEditor } from '../ui/codemirror-json-editor';

interface LogsPanelProps {
  nodes: ExecutionLogNode[];
  selectedAttempt: SelectedExecutionAttempt | null;
  onSelectAttempt: (next: SelectedExecutionAttempt) => void;
  isExpanded: boolean;
  onToggle: () => void;
  loading?: boolean;
}

function StatusIcon({ status, size = 14 }: { status: NodeExecutionStatus; size?: number }) {
  switch (status) {
    case NodeExecutionStatus.SUCCESS:
      return <CheckCircle2 className="flex-shrink-0 text-green-500" size={size} />;
    case NodeExecutionStatus.FAILED:
      return <XCircle className="flex-shrink-0 text-red-500" size={size} />;
    case NodeExecutionStatus.RUNNING:
      return (
        <div className="flex items-center justify-center" style={{ width: size, height: size }}>
          <div
            className="border-2 border-blue-500 rounded-full border-t-transparent animate-spin"
            style={{ width: size, height: size }}
          />
        </div>
      );
    case NodeExecutionStatus.PENDING:
      return <Clock className="flex-shrink-0 text-muted-foreground" size={size} />;
    case NodeExecutionStatus.SKIPPED:
      return <AlertCircle className="flex-shrink-0 text-yellow-500" size={size} />;
    case NodeExecutionStatus.BATCH_SUBMITTED:
      return <RefreshCw className="flex-shrink-0 text-amber-500" size={size} />;
    default:
      return <Clock className="flex-shrink-0 text-muted-foreground" size={size} />;
  }
}

function ToolStatusIcon({ success, size = 12 }: { success: boolean; size?: number }) {
  if (success) {
    return <CheckCircle2 className="flex-shrink-0 text-green-500" size={size} />;
  }
  return <XCircle className="flex-shrink-0 text-red-500" size={size} />;
}

const formatTimestamp = (value?: string) => {
  if (!value) {
    return '—';
  }
  try {
    return new Date(value).toLocaleString();
  } catch (error) {
    return value;
  }
};

const formatDuration = (value?: number) => {
  if (value === undefined) {
    return '—';
  }
  if (value < 1000) {
    return `${value} ms`;
  }
  const seconds = value / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}m ${secs}s`;
};

const hasData = (value?: Record<string, unknown>) => value && Object.keys(value).length > 0;

export function LogsPanel({
  nodes,
  selectedAttempt,
  onSelectAttempt,
  isExpanded,
  onToggle,
  loading,
}: LogsPanelProps) {
  const selectedNode = nodes.find((node) => node.nodeId === selectedAttempt?.nodeId) ?? nodes[0];
  const selectedAttemptData =
    selectedNode?.attempts.find((attempt) => attempt.id === selectedAttempt?.attemptId) ??
    selectedNode?.attempts[selectedNode?.attempts.length - 1];

  // Find selected tool call if any
  const selectedToolCall = selectedAttempt?.toolCallId
    ? selectedAttemptData?.toolCalls?.find((t) => t.id === selectedAttempt.toolCallId)
    : null;

  const handleSelectNode = (nodeId: string, attemptId: string) => {
    onSelectAttempt({ nodeId, attemptId, toolCallId: undefined });
  };

  const handleSelectTool = (nodeId: string, attemptId: string, toolCallId: string) => {
    onSelectAttempt({ nodeId, attemptId, toolCallId });
  };

  return (
    <div
      className={cn(
        'border-t border-border bg-imp-background text-card-foreground',
        isExpanded ? 'h-[420px]' : 'h-8',
      )}
    >
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-4 py-1 transition-colors cursor-pointer hover:bg-accent/50"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Execution Logs</span>
          <Badge variant="secondary" className="text-xs">
            {loading ? 'Loading…' : `${nodes.length} nodes`}
          </Badge>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="flex h-[calc(100%-48px)] border-t border-border">
          <div className="imp-page border-r border-imp-border bg-imp-background text-imp-foreground w-[280px] flex-shrink-0">
            <ScrollArea className="h-full">
              <div className="p-2 space-y-2">
                {loading && nodes.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    Loading node executions…
                  </div>
                )}
                {!loading && nodes.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No nodes available for this flow.
                  </div>
                )}
                {nodes.map((node) => {
                  const latestAttempt = node.attempts[node.attempts.length - 1];
                  const nodeSelected =
                    selectedAttempt?.nodeId === node.nodeId && !selectedAttempt?.toolCallId;
                  const isAgentNode =
                    node.nodeType === GraphNodeType.AGENT || node.nodeType === 'AGENT';
                  const toolCalls = latestAttempt.toolCalls ?? [];
                  return (
                    <div
                      key={node.nodeId}
                      className="border rounded-lg border-border/60 bg-card/40"
                    >
                      <button
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
                          nodeSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/40',
                        )}
                        onClick={() => handleSelectNode(node.nodeId, latestAttempt.id)}
                      >
                        <StatusIcon status={latestAttempt.status} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate flex items-center gap-1.5">
                            {isAgentNode && (
                              <Bot className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            )}
                            {node.nodeName}
                          </div>
                          <div className="text-xs truncate text-muted-foreground">
                            {latestAttempt.label}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDuration(latestAttempt.durationMs)}
                        </span>
                      </button>

                      {/* Nested tool calls for agent nodes */}
                      {isAgentNode && toolCalls.length > 0 && (
                        <div className="border-t border-border/60 bg-muted/20">
                          {toolCalls.map((tool) => {
                            const toolSelected =
                              selectedAttempt?.nodeId === node.nodeId &&
                              selectedAttempt?.toolCallId === tool.id;
                            return (
                              <button
                                key={tool.id}
                                onClick={() =>
                                  handleSelectTool(node.nodeId, latestAttempt.id, tool.id)
                                }
                                className={cn(
                                  'flex w-full items-center gap-2 pl-6 pr-3 py-1.5 text-left text-xs transition-colors',
                                  toolSelected
                                    ? 'bg-accent/60 text-accent-foreground'
                                    : 'hover:bg-accent/30',
                                )}
                              >
                                <Wrench className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                <ToolStatusIcon success={tool.success} size={10} />
                                <span className="flex-1 truncate">{tool.toolName}</span>
                                <span className="text-muted-foreground">
                                  {formatDuration(tool.executionTimeMs)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Multiple attempts (retries) */}
                      {node.attempts.length > 1 && (
                        <div className="border-t border-border/60">
                          {node.attempts.map((attempt) => {
                            const attemptSelected =
                              selectedAttempt?.nodeId === node.nodeId &&
                              selectedAttempt?.attemptId === attempt.id &&
                              !selectedAttempt?.toolCallId;
                            return (
                              <button
                                key={attempt.id}
                                onClick={() => handleSelectNode(node.nodeId, attempt.id)}
                                className={cn(
                                  'flex w-full items-center gap-2 px-4 py-2 text-left text-xs transition-colors',
                                  attemptSelected
                                    ? 'bg-accent/60 text-accent-foreground'
                                    : 'hover:bg-accent/30',
                                )}
                              >
                                <StatusIcon status={attempt.status} size={12} />
                                <span className="flex-1 truncate">{attempt.label}</span>
                                <span className="text-muted-foreground">
                                  {formatDuration(attempt.durationMs)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          <div className="flex-1 min-w-0 overflow-hidden bg-background text-foreground">
            <ScrollArea className="h-full">
              {/* Tool Call Detail View */}
              {selectedToolCall ? (
                <ToolCallDetailView tool={selectedToolCall} />
              ) : selectedAttemptData ? (
                <NodeAttemptDetailView
                  nodeName={selectedNode?.nodeName ?? ''}
                  attempt={selectedAttemptData}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  {loading
                    ? 'Waiting for node executions…'
                    : 'Select a node attempt to view details.'}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Detail view for a selected tool call
 */
function ToolCallDetailView({ tool }: { tool: ExecutionLogToolCall }) {
  return (
    <div className="max-w-full p-4 space-y-4 overflow-hidden">
      <div className="flex items-start justify-between gap-4 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Wrench className="h-5 w-5 text-muted-foreground" />
          <div>
            <div className="text-lg font-semibold flex items-center gap-2">
              {tool.toolName}
              <ToolStatusIcon success={tool.success} size={16} />
            </div>
            <div className="text-xs text-muted-foreground">
              Iteration {tool.iteration} • Tool ID: {tool.toolId}
            </div>
          </div>
          <Badge variant={tool.success ? 'default' : 'destructive'}>
            {tool.success ? 'success' : 'failed'}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex flex-col text-right">
            <span className="font-medium text-foreground/70">Duration</span>
            <span className="text-foreground">{formatDuration(tool.executionTimeMs)}</span>
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="max-w-full overflow-hidden">
        <div className="mb-2 text-sm font-semibold text-foreground">Input</div>
        <div className="max-w-full overflow-hidden border rounded-md border-border">
          <CodeMirrorJsonEditor
            value={JSON.stringify(tool.input, null, 2)}
            readOnly
            disableLinting
            minHeight="60px"
            className="max-w-full"
          />
        </div>
      </div>

      {/* Output */}
      {tool.output !== undefined && (
        <div className="max-w-full overflow-hidden">
          <div className="mb-2 text-sm font-semibold text-foreground">Output</div>
          <div className="max-w-full overflow-hidden border rounded-md border-border">
            <CodeMirrorJsonEditor
              value={JSON.stringify(tool.output, null, 2)}
              readOnly
              disableLinting
              minHeight="60px"
              className="max-w-full"
            />
          </div>
        </div>
      )}

      {/* Error */}
      {tool.error && (
        <div>
          <div className="mb-2 text-sm font-semibold text-red-500">Error</div>
          <div className="p-3 text-sm text-red-500 border rounded-md bg-red-500/10 border-red-500/20 whitespace-pre-wrap break-words max-h-60 overflow-auto">
            {tool.error}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Detail view for a selected node attempt
 */
function NodeAttemptDetailView({
  nodeName,
  attempt,
}: {
  nodeName: string;
  attempt: ExecutionLogAttempt;
}) {
  return (
    <div className="max-w-full p-4 space-y-4 overflow-hidden">
      <div className="flex items-start justify-between gap-4 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <StatusIcon status={attempt.status} size={20} />
          <div>
            <div className="text-lg font-semibold">{nodeName}</div>
            <div className="text-xs text-muted-foreground">{attempt.label}</div>
          </div>
          <Badge
            variant={
              attempt.status === NodeExecutionStatus.FAILED
                ? 'destructive'
                : attempt.status === NodeExecutionStatus.SUCCESS
                  ? 'default'
                  : 'secondary'
            }
          >
            {attempt.status.toLowerCase()}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex flex-col text-right">
            <span className="font-medium text-foreground/70">Started</span>
            <span className="text-foreground">{formatTimestamp(attempt.startedAt)}</span>
          </div>
          <div className="flex flex-col text-right">
            <span className="font-medium text-foreground/70">Duration</span>
            <span className="text-foreground">{formatDuration(attempt.durationMs)}</span>
          </div>
        </div>
      </div>

      {/* Agent Summary */}
      {attempt.agentMetadata && (
        <div className="p-3 rounded-lg bg-muted/50 border border-border/60">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Agent Summary</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Model:</span>{' '}
              <span className="text-foreground font-medium">
                {attempt.agentMetadata.model ?? 'Unknown'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Iterations:</span>{' '}
              <span className="text-foreground font-medium">
                {attempt.agentMetadata.iterations}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Tools Used:</span>{' '}
              <span className="text-foreground font-medium">{attempt.toolCalls?.length ?? 0}</span>
            </div>
            {attempt.agentMetadata.tokenUsage && (
              <div>
                <span className="text-muted-foreground">Tokens:</span>{' '}
                <span className="text-foreground font-medium">
                  ~{attempt.agentMetadata.tokenUsage.conversationTokensEstimate.toLocaleString()}
                </span>
              </div>
            )}
          </div>
          {attempt.agentMetadata.finalResponse && (
            <div className="mt-3 pt-3 border-t border-border/60">
              <div className="text-xs font-medium text-muted-foreground mb-1">Final Response</div>
              <div className="text-sm text-foreground whitespace-pre-wrap">
                {attempt.agentMetadata.finalResponse}
              </div>
            </div>
          )}
        </div>
      )}

      {hasData(attempt.inputs) && (
        <div className="max-w-full overflow-hidden">
          <div className="mb-2 text-sm font-semibold text-foreground">Inputs</div>
          <div className="max-w-full overflow-hidden border rounded-md border-border">
            <CodeMirrorJsonEditor
              value={JSON.stringify(attempt.inputs, null, 2)}
              readOnly
              disableLinting
              minHeight="60px"
              className="max-w-full"
            />
          </div>
        </div>
      )}

      {attempt.outputs && (
        <div className="max-w-full overflow-hidden">
          <div className="mb-2 text-sm font-semibold text-foreground">Outputs</div>
          <div className="max-w-full overflow-hidden border rounded-md border-border">
            <CodeMirrorJsonEditor
              value={JSON.stringify(attempt.outputs, null, 2)}
              readOnly
              disableLinting
              minHeight="60px"
              className="max-w-full"
            />
          </div>
        </div>
      )}

      {attempt.error && (
        <div>
          <div className="mb-2 text-sm font-semibold text-red-500">Error</div>
          <div className="p-3 text-sm text-red-500 border rounded-md bg-red-500/10 border-red-500/20">
            {attempt.error}
          </div>
        </div>
      )}
    </div>
  );
}
