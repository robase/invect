'use client';

import { useState } from 'react';
import { ChevronRight, CheckCircle2, XCircle, Wrench, Bot, Clock, Zap } from 'lucide-react';
import { Badge } from '../ui/badge';
import { cn } from '~/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { CodeMirrorJsonEditor } from '../ui/codemirror-json-editor';
import type { ExecutionLogToolCall, AgentExecutionMetadata } from './use-execution-log-data';

interface AgentToolExecutionsListProps {
  toolCalls: ExecutionLogToolCall[];
  agentMetadata?: AgentExecutionMetadata;
}

const formatDuration = (ms?: number) => {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const formatFinishReason = (reason?: string) => {
  switch (reason) {
    case 'completed':
      return 'Completed';
    case 'max_iterations':
      return 'Max Iterations';
    case 'tool_result':
      return 'Tool Result';
    case 'error':
      return 'Error';
    default:
      return reason ?? 'Unknown';
  }
};

export function AgentToolExecutionsList({
  toolCalls,
  agentMetadata,
}: AgentToolExecutionsListProps) {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  const toggleTool = (toolId: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedTools(new Set(toolCalls.map((t) => t.id)));
  };

  const collapseAll = () => {
    setExpandedTools(new Set());
  };

  // Group tools by iteration
  const iterationGroups = toolCalls.reduce(
    (acc, tool) => {
      const key = tool.iteration;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(tool);
      return acc;
    },
    {} as Record<number, ExecutionLogToolCall[]>,
  );

  const iterations = Object.keys(iterationGroups)
    .map(Number)
    .sort((a, b) => a - b);
  const successCount = toolCalls.filter((t) => t.success).length;
  const failedCount = toolCalls.filter((t) => !t.success).length;

  return (
    <div className="mt-4 border-t border-border pt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Tool Executions</span>
          <Badge variant="outline" className="text-xs">
            {toolCalls.length} call{toolCalls.length !== 1 ? 's' : ''}
          </Badge>
          {successCount > 0 && (
            <Badge
              variant="default"
              className="text-xs bg-green-500/10 text-green-600 border-green-500/20"
            >
              {successCount} ✓
            </Badge>
          )}
          {failedCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {failedCount} ✗
            </Badge>
          )}
        </div>
        {toolCalls.length > 1 && (
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={expandAll}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Expand all
            </button>
            <span className="text-muted-foreground">|</span>
            <button
              onClick={collapseAll}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Collapse all
            </button>
          </div>
        )}
      </div>

      {/* Agent Summary */}
      {agentMetadata && (
        <div className="mb-4 p-3 rounded-lg bg-muted/50 border border-border/60">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Agent Summary</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Model:</span>{' '}
              <span className="text-foreground font-medium">
                {agentMetadata.model ?? 'Unknown'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Iterations:</span>{' '}
              <span className="text-foreground font-medium">{agentMetadata.iterations}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Finish:</span>{' '}
              <span className="text-foreground font-medium">
                {formatFinishReason(agentMetadata.finishReason)}
              </span>
            </div>
            {agentMetadata.tokenUsage && (
              <div>
                <span className="text-muted-foreground">Tokens:</span>{' '}
                <span className="text-foreground font-medium">
                  ~{agentMetadata.tokenUsage.conversationTokensEstimate.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tool Calls by Iteration */}
      <div className="space-y-3">
        {iterations.map((iteration) => {
          const tools = iterationGroups[iteration];
          const hasMultipleIterations = iterations.length > 1;

          return (
            <div
              key={iteration}
              className={cn(hasMultipleIterations && 'pl-3 border-l-2 border-muted')}
            >
              {hasMultipleIterations && (
                <div className="flex items-center gap-2 mb-2 -ml-[11px]">
                  <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                    <span className="text-xs font-medium text-muted-foreground">{iteration}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">Iteration {iteration}</span>
                </div>
              )}

              <div className="space-y-2">
                {tools.map((tool) => {
                  const isExpanded = expandedTools.has(tool.id);

                  return (
                    <Collapsible
                      key={tool.id}
                      open={isExpanded}
                      onOpenChange={() => toggleTool(tool.id)}
                    >
                      <CollapsibleTrigger asChild>
                        <button
                          className={cn(
                            'flex items-center gap-2 w-full p-2 rounded-lg transition-colors text-left',
                            'border border-border/60 hover:bg-accent/50',
                            isExpanded && 'bg-accent/30',
                          )}
                        >
                          {tool.success ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                          )}
                          <span className="font-medium text-sm text-foreground truncate flex-1">
                            {tool.toolName}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDuration(tool.executionTimeMs)}
                            </span>
                            <ChevronRight
                              className={cn(
                                'h-4 w-4 transition-transform',
                                isExpanded && 'rotate-90',
                              )}
                            />
                          </div>
                        </button>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <div className="mt-2 ml-6 space-y-3 pb-2">
                          {/* Input */}
                          <div>
                            <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                              <Zap className="h-3 w-3" /> Input
                            </div>
                            <div className="border rounded-md border-border overflow-hidden">
                              <CodeMirrorJsonEditor
                                value={JSON.stringify(tool.input, null, 2)}
                                readOnly
                                disableLinting
                                minHeight="40px"
                                className="text-xs"
                              />
                            </div>
                          </div>

                          {/* Output */}
                          {tool.output !== undefined && (
                            <div>
                              <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-green-500" /> Output
                              </div>
                              <div className="border rounded-md border-border overflow-hidden">
                                <CodeMirrorJsonEditor
                                  value={JSON.stringify(tool.output, null, 2)}
                                  readOnly
                                  disableLinting
                                  minHeight="40px"
                                  className="text-xs"
                                />
                              </div>
                            </div>
                          )}

                          {/* Error */}
                          {tool.error && (
                            <div>
                              <div className="text-xs font-medium text-red-500 mb-1 flex items-center gap-1">
                                <XCircle className="h-3 w-3" /> Error
                              </div>
                              <div className="p-2 text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-md whitespace-pre-wrap break-words max-h-40 overflow-auto">
                                {tool.error}
                              </div>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Final Response */}
      {agentMetadata?.finalResponse && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Final Response</span>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border border-border/60 text-sm text-foreground whitespace-pre-wrap">
            {agentMetadata.finalResponse}
          </div>
        </div>
      )}
    </div>
  );
}
