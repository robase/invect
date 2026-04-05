import { FlowRunContext } from 'src/types.internal';
import { NodeExecutionStatus } from 'src/types/base';
import { ValidationError } from 'src/types/common/errors.types';
import { Logger } from 'src/schemas';
import { NodeExecutionService } from './node-executions/node-execution.service';
import { BaseLogger } from 'src/utils/logger';
import { FlowEdge, FlowNodeDefinitions } from './flow-versions/schemas-fresh';

/**
 * Graph Service for flow topology analysis and dependency management
 * Provides utilities for topological sorting, cycle detection, and dependency resolution
 */
export class GraphService {
  static logger: Logger = new BaseLogger({ level: 'debug' });

  constructor(
    private readonly logger: Logger,
    private readonly nodeExecutionService: NodeExecutionService,
  ) {
    GraphService.logger = logger || new BaseLogger({ level: 'debug' });
  }

  /**
   * Perform topological sort on flow nodes to determine execution order
   */
  static topologicalSort(
    nodes: readonly FlowNodeDefinitions[],
    edges: readonly FlowEdge[],
  ): string[] {
    const nodeIds = nodes.map((n) => n.id);
    const adjList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Initialize adjacency list and in-degree count
    for (const nodeId of nodeIds) {
      adjList.set(nodeId, []);
      inDegree.set(nodeId, 0);
    }

    // Build adjacency list and calculate in-degrees
    for (const edge of edges) {
      const from = edge.source;
      const to = edge.target;

      if (adjList.has(from) && adjList.has(to)) {
        const fromList = adjList.get(from);
        if (fromList) {
          fromList.push(to);
        }
        const currentInDegree = inDegree.get(to);
        if (currentInDegree !== undefined) {
          inDegree.set(to, currentInDegree + 1);
        }
      }
    }

    // Kahn's algorithm for topological sorting
    const queue: string[] = [];
    const result: string[] = [];

    // Find all nodes with no incoming edges
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        break;
      }

      result.push(current);

      // Remove this node from the graph
      const neighbors = adjList.get(current) || [];
      for (const neighbor of neighbors) {
        const currentInDegree = inDegree.get(neighbor);
        if (currentInDegree !== undefined) {
          const newInDegree = currentInDegree - 1;
          inDegree.set(neighbor, newInDegree);
          if (newInDegree === 0) {
            queue.push(neighbor);
          }
        }
      }
    }

    // Check for cycles
    if (result.length !== nodeIds.length) {
      throw new Error('Flow contains cycles and cannot be executed');
    }

    return result;
  }

  /**
   * Mark downstream nodes as skipped (smart skipping)
   * Used primarily for conditional flows (if-else nodes) to skip non-executed branches
   * Only skips nodes if ALL their incoming edges come from skipped nodes
   */
  markDownstreamNodesAsSkipped(
    nodeId: string,
    edges: readonly FlowEdge[],
    skippedNodes: Set<string>,
    isFromIfElse: boolean | undefined = false,
  ): void {
    this.logger.debug('Marking downstream nodes as skipped', {
      startNodeId: nodeId,
      edgeCount: edges.length,
      currentSkippedCount: skippedNodes.size,
      isFromIfElse,
    });

    const queue: string[] = [];

    if (isFromIfElse) {
      // When called from if-else node, mark the starting node itself as skipped
      // (the starting node is the first node on the non-executed branch)
      if (!skippedNodes.has(nodeId)) {
        skippedNodes.add(nodeId);
        this.logger.debug(`Marking node ${nodeId} as SKIPPED (from if-else branch)`);

        // Add its downstream nodes to queue for further processing
        const outgoingEdges = GraphService.getOutgoingEdges(nodeId, edges);
        outgoingEdges.forEach((edge) => {
          if (!skippedNodes.has(edge.target)) {
            queue.push(edge.target);
          }
        });
      }
    } else {
      // Otherwise, start with the immediate downstream nodes
      const outgoingEdges = GraphService.getOutgoingEdges(nodeId, edges);
      outgoingEdges.forEach((edge) => {
        if (!skippedNodes.has(edge.target)) {
          queue.push(edge.target);
        }
      });
    }

    // Smart breadth-first traversal with dependency checking
    while (queue.length > 0) {
      const currentNodeId = queue.shift();
      if (!currentNodeId) {
        break;
      }

      // Only skip if ALL incoming edges come from skipped nodes
      if (this.shouldNodeBeSkipped(currentNodeId, edges, skippedNodes)) {
        if (!skippedNodes.has(currentNodeId)) {
          skippedNodes.add(currentNodeId);
          this.logger.debug(`Marking node ${currentNodeId} as SKIPPED (all dependencies skipped)`);

          // Add downstream nodes to queue only if this node was actually skipped
          const outgoingEdges = GraphService.getOutgoingEdges(currentNodeId, edges);
          outgoingEdges.forEach((edge) => {
            if (!skippedNodes.has(edge.target)) {
              queue.push(edge.target);
            }
          });
        }
      } else {
        this.logger.debug(`Node ${currentNodeId} NOT skipped (has non-skipped dependencies)`);
      }
    }

    this.logger.debug('Completed marking downstream nodes as skipped', {
      startNodeId: nodeId,
      totalSkippedCount: skippedNodes.size,
      isFromIfElse,
    });
  }

  /**
   * Check if a node should be skipped based on its dependencies
   * A node should only be skipped if ALL its incoming edges come from skipped nodes
   */
  private shouldNodeBeSkipped(
    nodeId: string,
    edges: readonly FlowEdge[],
    skippedNodes: Set<string>,
  ): boolean {
    const incomingEdges = GraphService.getIncomingEdges(nodeId, edges);

    // If node has no incoming edges, it should not be skipped (it's a root node)
    if (incomingEdges.length === 0) {
      return false;
    }

    // Check if ALL incoming edges come from skipped nodes
    const allDependenciesSkipped = incomingEdges.every((edge) => skippedNodes.has(edge.source));

    this.logger.debug(`Checking skip condition for node ${nodeId}`, {
      nodeId,
      incomingEdgeCount: incomingEdges.length,
      skippedSources: incomingEdges
        .filter((edge) => skippedNodes.has(edge.source))
        .map((edge) => edge.source),
      nonSkippedSources: incomingEdges
        .filter((edge) => !skippedNodes.has(edge.source))
        .map((edge) => edge.source),
      allDependenciesSkipped,
    });

    return allDependenciesSkipped;
  }

  /**
   * Checks if a node is ready to execute based on dependency completion
   */
  async isNodeReadyToExecute(
    nodeId: string,
    flowContext: FlowRunContext,
    executionId?: string,
  ): Promise<boolean> {
    this.logger.debug('Checking if node is ready to execute', { nodeId, executionId });

    if (!nodeId) {
      throw new ValidationError('Node ID is required', 'nodeId');
    }

    const { edges, nodeExecutionResults, skippedNodeIds, allNodeOutputs } = flowContext;

    // Get incoming edges for this node
    const incomingEdges = GraphService.getIncomingEdges(nodeId, edges);

    if (incomingEdges.length === 0) {
      // TODO: maybe should skip if this is not an input node?
      this.logger.debug('Node has no dependencies, ready to execute', { nodeId });
      return true; // No dependencies
    }

    // Check if all dependency nodes have completed
    for (const edge of incomingEdges) {
      const sourceNodeId = edge.source;

      // If the source node is skipped, that's okay
      if (skippedNodeIds.has(sourceNodeId)) {
        this.logger.debug('Dependency node is skipped, continuing', {
          nodeId,
          dependencyNodeId: sourceNodeId,
        });
        continue;
      }

      // If we have the output, check if it's a batch output or actual output
      if (nodeExecutionResults.has(sourceNodeId)) {
        const executionResult = nodeExecutionResults.get(sourceNodeId);

        // Check if this is a batch submission
        if (executionResult?.state === NodeExecutionStatus.PENDING) {
          // This is a batch job that hasn't completed yet
          // Check the database for the actual status
          if (executionId) {
            try {
              const dependencyTrace =
                await this.nodeExecutionService.getNodeExecutionById(executionId);

              if (dependencyTrace && dependencyTrace.status === NodeExecutionStatus.RUNNING) {
                this.logger.debug('Dependency batch job still running', {
                  nodeId,
                  dependencyNodeId: sourceNodeId,
                });
                return false;
              }
            } catch (error) {
              this.logger.warn('Failed to check dependency trace status', {
                nodeId,
                dependencyNodeId: sourceNodeId,
                error,
              });
              return false;
            }
          }
          // If no trace or trace shows completion, fall through to continue
        }

        // Normal output - dependency is ready
        continue;
      }

      // If we have executionId and database service, check database for dependency status
      if (executionId) {
        try {
          const dependencyTrace = await this.nodeExecutionService.getNodeExecutionById(executionId);

          if (dependencyTrace) {
            switch (dependencyTrace.status) {
              case NodeExecutionStatus.RUNNING:
                this.logger.debug('Dependency still running', {
                  nodeId,
                  dependencyNodeId: sourceNodeId,
                });
                return false;
              case NodeExecutionStatus.SUCCESS:
                // Add output to nodeOutputs if we have it
                if (dependencyTrace.outputs) {
                  allNodeOutputs.set(sourceNodeId, dependencyTrace.outputs);
                }
                continue;
              case NodeExecutionStatus.FAILED:
                this.logger.debug('Dependency failed, node not ready', {
                  nodeId,
                  dependencyNodeId: sourceNodeId,
                });
                return false;
            }
          }
        } catch (error) {
          this.logger.warn('Failed to check dependency status', {
            nodeId,
            dependencyNodeId: sourceNodeId,
            error,
          });
          return false;
        }
      }

      // Dependency not ready
      this.logger.debug('Dependency not ready', {
        nodeId,
        dependencyNodeId: sourceNodeId,
      });
      return false;
    }

    this.logger.debug('Node is ready to execute', { nodeId });
    return true;
  }

  /**
   * Checks if there are circular dependencies in the flow
   */
  static hasCycleDetection(
    nodes: readonly FlowNodeDefinitions[],
    edges: readonly FlowEdge[],
  ): { hasCycle: boolean; cyclePath?: string[] } {
    if (!nodes || nodes.length === 0) {
      return { hasCycle: false };
    }

    const adjList: Record<string, string[]> = {};

    // Initialize adjacency list
    for (const node of nodes) {
      adjList[node.id] = [];
    }

    // Build adjacency list
    for (const edge of edges) {
      if (adjList[edge.source]) {
        adjList[edge.source].push(edge.target);
      }
    }

    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string, path: string[]): { hasCycle: boolean; cyclePath?: string[] } => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const neighbors = adjList[nodeId] || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          const result = dfs(neighbor, [...path]);
          if (result.hasCycle) {
            return result;
          }
        } else if (recursionStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor);
          const cyclePath = [...path.slice(cycleStart), neighbor];

          return {
            hasCycle: true,
            cyclePath,
          };
        }
      }

      recursionStack.delete(nodeId);
      return { hasCycle: false };
    };

    // Check each unvisited node
    for (const node of nodes) {
      if (!visited.has(node.id)) {
        const result = dfs(node.id, []);
        if (result.hasCycle) {
          return result;
        }
      }
    }

    return { hasCycle: false };
  }

  /**
   * Finds all nodes that are not connected to any output node
   */
  static findDisconnectedNodes(
    nodes: readonly FlowNodeDefinitions[],
    edges: readonly FlowEdge[],
    outputNodeType: string,
  ): string[] {
    GraphService.logger.debug('Finding disconnected nodes', {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      outputNodeType,
    });

    if (!nodes || nodes.length === 0) {
      return [];
    }

    // Find all output nodes
    const outputNodes = nodes.filter((node) => node.type === outputNodeType);

    if (outputNodes.length === 0) {
      const allNodeIds = nodes.map((n) => n.id);
      GraphService.logger.warn('No output nodes found, all nodes are disconnected', {
        disconnectedNodes: allNodeIds,
      });
      return allNodeIds; // All nodes are disconnected if no output nodes
    }

    // Find all nodes that can reach an output node
    const connectedNodes = new Set<string>();

    // Start from output nodes and work backwards
    const visited = new Set<string>();
    const queue = outputNodes.map((n) => n.id);

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (!nodeId) {
        break;
      }

      if (visited.has(nodeId)) {
        continue;
      }

      visited.add(nodeId);
      connectedNodes.add(nodeId);

      // Find all edges that lead to this node
      const incomingEdges = GraphService.getIncomingEdges(nodeId, edges);
      for (const edge of incomingEdges) {
        if (!visited.has(edge.source)) {
          queue.push(edge.source);
        }
      }
    }

    // Return nodes that are not connected to any output
    const disconnectedNodes = nodes
      .filter((node) => node.type !== outputNodeType && !connectedNodes.has(node.id))
      .map((node) => node.id);

    GraphService.logger.debug('Disconnected nodes found', {
      disconnectedNodes,
      connectedNodeCount: connectedNodes.size,
    });

    return disconnectedNodes;
  }

  /**
   * Gets incoming edges for a specific node
   */
  static getIncomingEdges(nodeId: string, edges: readonly FlowEdge[]): FlowEdge[] {
    return edges.filter((edge) => edge.target === nodeId);
  }

  /**
   * Gets outgoing edges for a specific node
   */
  static getOutgoingEdges(nodeId: string, edges: readonly FlowEdge[]): FlowEdge[] {
    return edges.filter((edge) => edge.source === nodeId);
  }

  /**
   * Checks if a node type requires structured input (for validation)
   */
  nodeRequiresStructuredInput(nodeType: string): boolean {
    // Node types that require structured JSON input
    const structuredInputTypes = ['ifElseNode', 'jqNode'];
    return structuredInputTypes.includes(nodeType);
  }

  /**
   * Checks if any remaining nodes have running dependencies
   */
  async checkForRunningDependencies(
    remainingNodeIds: string[],
    edges: FlowEdge[],
    runningDependencyCheckFn: (nodeId: string) => Promise<boolean>,
  ): Promise<boolean> {
    this.logger.debug('Checking for running dependencies', {
      remainingNodeCount: remainingNodeIds.length,
    });

    // Check if any of the remaining nodes have dependencies that are still running
    for (const nodeId of remainingNodeIds) {
      const incomingEdges = GraphService.getIncomingEdges(nodeId, edges);

      for (const edge of incomingEdges) {
        try {
          const isRunning = await runningDependencyCheckFn(edge.source);
          if (isRunning) {
            this.logger.debug('Found running dependency', {
              nodeId,
              dependencyNodeId: edge.source,
            });
            return true; // Found a running dependency
          }
        } catch (error) {
          this.logger.warn('Failed to check running dependency', {
            nodeId,
            dependencyNodeId: edge.source,
            error,
          });
        }
      }
    }

    this.logger.debug('No running dependencies found');
    return false;
  }

  /**
   * Gets all terminal nodes (nodes with no outgoing edges)
   */
  getTerminalNodes(
    nodes: readonly FlowNodeDefinitions[],
    edges: readonly FlowEdge[],
  ): FlowNodeDefinitions[] {
    return nodes.filter((n) => !edges.some((e) => e.source === n.id));
  }

  /**
   * Gets immediate dependents of a node
   */
  getNodeDependents(nodeId: string, edges: readonly FlowEdge[]): string[] {
    return GraphService.getOutgoingEdges(nodeId, edges).map((edge) => edge.target);
  }

  /**
   * Gets all downstream nodes (all nodes reachable from this node)
   */
  getDownstreamNodes(nodeId: string, edges: readonly FlowEdge[]): string[] {
    const visited = new Set<string>();
    const downstream: string[] = [];

    const dfs = (currentNodeId: string) => {
      const dependents = this.getNodeDependents(currentNodeId, edges);

      for (const dependent of dependents) {
        if (!visited.has(dependent)) {
          visited.add(dependent);
          downstream.push(dependent);
          dfs(dependent); // Recursively find downstream nodes
        }
      }
    };

    dfs(nodeId);
    return downstream;
  }

  /**
   * Gets immediate dependencies of a node (nodes that feed into this node)
   */
  getNodeDependencies(nodeId: string, edges: readonly FlowEdge[]): string[] {
    return GraphService.getIncomingEdges(nodeId, edges).map((edge) => edge.source);
  }

  /**
   * Gets all upstream nodes (all nodes that this node depends on, directly or indirectly)
   * Returns nodes in topological order (dependencies first)
   */
  getUpstreamNodes(
    nodeId: string,
    nodes: readonly FlowNodeDefinitions[],
    edges: readonly FlowEdge[],
  ): string[] {
    const visited = new Set<string>();
    const upstream: string[] = [];

    const dfs = (currentNodeId: string) => {
      const dependencies = this.getNodeDependencies(currentNodeId, edges);

      for (const dependency of dependencies) {
        if (!visited.has(dependency)) {
          visited.add(dependency);
          dfs(dependency); // Recursively find upstream nodes first
          upstream.push(dependency); // Add after dependencies (topological order)
        }
      }
    };

    dfs(nodeId);
    return upstream;
  }

  /**
   * Gets all upstream nodes plus the target node, in topological execution order
   */
  getExecutionPathToNode(
    targetNodeId: string,
    nodes: readonly FlowNodeDefinitions[],
    edges: readonly FlowEdge[],
  ): string[] {
    const upstreamNodes = this.getUpstreamNodes(targetNodeId, nodes, edges);
    return [...upstreamNodes, targetNodeId];
  }
}
