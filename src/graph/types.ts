export interface GraphNode {
  id: string;
  type: string;
  name: string;
  filePath?: string;
  summary: string;
  tags: string[];
  complexity?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  direction?: string;
  description?: string;
  weight?: number;
  recoveredFromImportMap?: boolean;
}

export interface Layer {
  id: string;
  name: string;
  description: string;
  nodeIds: string[];
}

export interface TourStep {
  order: number;
  title: string;
  description: string;
  nodeIds: string[];
  languageLesson?: string;
}

export interface ProjectMeta {
  name: string;
  languages: string[];
  frameworks: string[];
  description: string;
  analyzedAt: string;
  gitCommitHash?: string;
}

export interface KnowledgeGraph {
  version: string;
  valid?: boolean;
  project: ProjectMeta;
  nodes: GraphNode[];
  edges: GraphEdge[];
  layers: Layer[];
  tour: TourStep[];
}

export interface AnalyzerOptions {
  include?: string[];
  exclude?: string[];
  batchSize?: number;
}

export interface CodeAnalyzer {
  readonly name: string;
  analyze(projectRoot: string, options?: AnalyzerOptions): Promise<KnowledgeGraph>;
}

export interface BatchData {
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  [key: string]: unknown;
}

export interface MergeReport {
  input: { nodes: number; edges: number };
  fixed: { total: number; patterns: Map<string, number> };
  testedBy: { added: number; dropped: number; tagged: number; swapped: number };
  unfixable: string[];
  output: { nodes: number; edges: number };
}

export interface MergeResult {
  assembled: { nodes: GraphNode[]; edges: GraphEdge[] };
  report: string[];
}

export interface PathResult {
  from: string;
  to: string;
  found: boolean;
  length: number;
  steps: Array<{
    node: string;
    type?: string;
    name?: string;
    edgeToNext?: string;
  }>;
}

export interface DiffResult {
  changedFiles: string[];
  direct: GraphNode[];
  impacted: GraphNode[];
}

export interface SearchOptions {
  limit?: number;
  type?: string;
}
