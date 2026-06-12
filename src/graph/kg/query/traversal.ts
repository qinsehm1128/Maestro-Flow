// src/graph/kg/query/traversal.ts — 图遍历 (BFS/DFS)
// 参考: codegraph/src/graph/traversal.ts

import type { KgQueryBuilder } from '../db/queries.js';
import type { UnifiedNode, UnifiedEdge } from '../db/types.js';

// ---------------------------------------------------------------------------
// 遍历结果
// ---------------------------------------------------------------------------

export interface TraversalResult {
  nodes: Map<string, UnifiedNode>;
  edges: UnifiedEdge[];
  visited: Set<string>;
}

export interface TraversalOptions {
  /** 最大深度 */
  maxDepth?: number;
  /** 边类型过滤 */
  edgeKinds?: string[];
  /** 方向: outgoing/incoming/both */
  direction?: 'outgoing' | 'incoming' | 'both';
  /** 最大节点数限制 */
  maxNodes?: number;
}

// ---------------------------------------------------------------------------
// BFS 广度优先遍历
// ---------------------------------------------------------------------------

export function bfs(
  queries: KgQueryBuilder,
  startNodeId: string,
  options?: TraversalOptions,
): TraversalResult {
  const maxDepth = options?.maxDepth ?? 2;
  const direction = options?.direction ?? 'both';
  const maxNodes = options?.maxNodes ?? 200;
  const edgeKinds = options?.edgeKinds ? new Set(options.edgeKinds) : null;

  const visited = new Set<string>([startNodeId]);
  const nodes = new Map<string, UnifiedNode>();
  const edges: UnifiedEdge[] = [];

  // 加载起始节点
  const startNode = queries.getNode(startNodeId);
  if (startNode) nodes.set(startNodeId, startNode);

  let frontier = [startNodeId];

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const nextFrontier: string[] = [];

    for (const nodeId of frontier) {
      if (nodes.size >= maxNodes) break;

      const neighbors = getNeighbors(queries, nodeId, direction, edgeKinds);

      for (const { edge, neighborId } of neighbors) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        nextFrontier.push(neighborId);

        // 加载邻居节点
        const neighborNode = queries.getNode(neighborId);
        if (neighborNode) nodes.set(neighborId, neighborNode);

        edges.push(edge);
      }
    }

    frontier = nextFrontier;
  }

  return { nodes, edges, visited };
}

// ---------------------------------------------------------------------------
// 调用链追踪 (A→B→C→D)
// ---------------------------------------------------------------------------

export function traceCallChain(
  queries: KgQueryBuilder,
  startSymbol: string,
  options?: { maxDepth?: number; edgeKinds?: string[] },
): TraversalResult {
  return bfs(queries, startSymbol, {
    maxDepth: options?.maxDepth ?? 5,
    direction: 'outgoing',
    edgeKinds: options?.edgeKinds ?? ['calls', 'imports'],
    maxNodes: 100,
  });
}

// ---------------------------------------------------------------------------
// 调用方/被调用方
// ---------------------------------------------------------------------------

export function getCallers(
  queries: KgQueryBuilder,
  nodeId: string,
  depth: number = 1,
): Array<{ node: UnifiedNode; edge: UnifiedEdge }> {
  const result = bfs(queries, nodeId, {
    maxDepth: depth,
    direction: 'incoming',
    edgeKinds: ['calls'],
    maxNodes: 50,
  });

  const callers: Array<{ node: UnifiedNode; edge: UnifiedEdge }> = [];
  for (const edge of result.edges) {
    const node = result.nodes.get(edge.source);
    if (node) callers.push({ node, edge });
  }
  return callers;
}

export function getCallees(
  queries: KgQueryBuilder,
  nodeId: string,
  depth: number = 1,
): Array<{ node: UnifiedNode; edge: UnifiedEdge }> {
  const result = bfs(queries, nodeId, {
    maxDepth: depth,
    direction: 'outgoing',
    edgeKinds: ['calls'],
    maxNodes: 50,
  });

  const callees: Array<{ node: UnifiedNode; edge: UnifiedEdge }> = [];
  for (const edge of result.edges) {
    const node = result.nodes.get(edge.target);
    if (node) callees.push({ node, edge });
  }
  return callees;
}

// ---------------------------------------------------------------------------
// 影响半径分析
// ---------------------------------------------------------------------------

export function getImpactRadius(
  queries: KgQueryBuilder,
  nodeId: string,
  depth: number = 3,
): TraversalResult {
  return bfs(queries, nodeId, {
    maxDepth: depth,
    direction: 'outgoing',
    edgeKinds: ['calls', 'imports', 'extends', 'implements', 'references'],
    maxNodes: 200,
  });
}

// ---------------------------------------------------------------------------
// 最短路径 (BFS)
// ---------------------------------------------------------------------------

export function findShortestPath(
  queries: KgQueryBuilder,
  fromId: string,
  toId: string,
  maxDepth: number = 10,
): string[] | null {
  const visited = new Set<string>([fromId]);
  const parent = new Map<string, string>();
  let frontier = [fromId];

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const nextFrontier: string[] = [];

    for (const nodeId of frontier) {
      const neighbors = getNeighbors(queries, nodeId, 'both', null);

      for (const { neighborId } of neighbors) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        parent.set(neighborId, nodeId);
        nextFrontier.push(neighborId);

        if (neighborId === toId) {
          // 回溯路径
          const path: string[] = [toId];
          let current = toId;
          while (parent.has(current)) {
            current = parent.get(current)!;
            path.unshift(current);
          }
          return path;
        }
      }
    }

    frontier = nextFrontier;
  }

  return null; // 无路径
}

// ---------------------------------------------------------------------------
// 内部辅助
// ---------------------------------------------------------------------------

interface Neighbor {
  edge: UnifiedEdge;
  neighborId: string;
}

function getNeighbors(
  queries: KgQueryBuilder,
  nodeId: string,
  direction: 'outgoing' | 'incoming' | 'both',
  edgeKinds: Set<string> | null,
): Neighbor[] {
  const neighbors: Neighbor[] = [];

  if (direction === 'outgoing' || direction === 'both') {
    const outgoing = queries.getOutgoingEdges(nodeId);
    for (const edge of outgoing) {
      if (edgeKinds && !edgeKinds.has(edge.kind)) continue;
      neighbors.push({ edge, neighborId: edge.target });
    }
  }

  if (direction === 'incoming' || direction === 'both') {
    const incoming = queries.getIncomingEdges(nodeId);
    for (const edge of incoming) {
      if (edgeKinds && !edgeKinds.has(edge.kind)) continue;
      neighbors.push({ edge, neighborId: edge.source });
    }
  }

  return neighbors;
}