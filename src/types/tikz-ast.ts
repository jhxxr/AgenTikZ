export interface SourceSpan {
  start: number;
  end: number;
  startLine: number;
  endLine: number;
}

export type NodeSubtype =
  | 'block'       // Standard neural layer / process rectangle
  | 'mha'         // Multi-Head Attention block (accented header/border)
  | 'addnorm'     // Add & LayerNorm compact block
  | 'conv'        // Convolution / Pooling trapezoid or accented block
  | 'op_circle'   // Circle operator: \oplus, \otimes, Concat, \sigma
  | 'cuboid'      // 3D Feature Map / Tensor Volume (C x H x W)
  | 'container'   // Dashed Group / Stage container box
  | 'caption'     // Subfigure caption / Figure note e.g. "(a) Architecture Overview"
  | 'math';       // Standalone formula / annotation text

export type EdgeRouteType =
  | 'direct'         // (a) -- (b)
  | 'vh'             // (a) |- (b)
  | 'hv'             // (a) -| (b)
  | 'residual_right' // (a.east) -- ++(dx,0) |- (b.east)
  | 'residual_left'  // (a.west) -- ++(-dx,0) |- (b.west)
  | 'curved';        // (a) to[bend left=25] (b)

export type PgfChartType = 'line' | 'bar' | 'heatmap' | 'boxplot';

export interface ChartDataPoint {
  x: number | string;
  y: number;
  error?: number; // For confidence band / error bar
}

export interface BoxplotStat {
  label: string;
  median: number;
  upperQuartile: number;
  lowerQuartile: number;
  upperWhisker: number;
  lowerWhisker: number;
  color?: string;
}

export interface ChartSeries {
  id: string;
  name: string;
  color: string;
  mark?: 'none' | '*' | 'square*' | 'triangle*' | 'diamond*';
  dashed?: boolean;
  points: ChartDataPoint[];
}

export interface TikzNodeElement {
  kind: 'node';
  id: string;
  namedInSource: boolean;
  subtype: NodeSubtype;
  x: number; // TikZ cm (1cm = 50px on canvas at 100% zoom)
  y: number; // TikZ cm (Y-axis points UP in TikZ!)
  width: number; // cm
  height: number; // cm
  depth?: number; // cm (for 3D cuboid tensor blocks)
  channels?: string; // Dimension label e.g. "64×64×128"
  label: string;
  sublabel?: string;
  styleClass?: string;
  fill?: string;
  stroke?: string;
  textColor?: string;
  lineWidth?: string;
  roundedCorners?: string;
  dashed?: boolean;
  rawOptions: Record<string, string>;
  span: SourceSpan;
  coordSpan?: SourceSpan;
  optionsSpan?: SourceSpan;
  labelSpan?: SourceSpan;
}

export interface TikzEdgeElement {
  kind: 'edge';
  id: string;
  from: string;
  fromAnchor?: string;
  to: string;
  toAnchor?: string;
  routeType: EdgeRouteType;
  residualOffset?: number; // cm
  bendAngle?: number;
  label?: string;
  arrowStart?: boolean;
  arrowEnd: boolean;
  stroke?: string;
  lineWidth?: string;
  dashed?: boolean;
  styleClass?: string;
  rawOptions: Record<string, string>;
  span: SourceSpan;
  optionsSpan?: SourceSpan;
  routeSpan?: SourceSpan;
}

export interface TikzChartElement {
  kind: 'chart';
  id: string;
  chartType: PgfChartType;
  x: number; // TikZ cm (bottom-left of axis in scope shift)
  y: number; // TikZ cm
  width: number; // cm
  height: number; // cm
  title: string;
  xlabel: string;
  ylabel: string;
  subcaption?: string; // Optional subfigure caption below chart e.g. "(b) Scaling Curve"
  showGrid: boolean;
  showLegend: boolean;
  legendPos: { x: number; y: number }; // Normalized axis description cs (0..1, 0..1) for top-left of legend
  titleOffset?: { x: number; y: number }; // Pixel/relative offset for draggable chart title
  xlabelOffset?: { x: number; y: number }; // Offset for draggable xlabel
  ylabelOffset?: { x: number; y: number }; // Offset for draggable ylabel
  series: ChartSeries[];
  heatmapMatrix?: number[][];
  heatmapXLabels?: string[];
  heatmapYLabels?: string[];
  boxplots?: BoxplotStat[];
  span: SourceSpan;
  coordSpan?: SourceSpan;
  legendCoordSpan?: SourceSpan;
}

export interface TikzRawElement {
  kind: 'raw';
  id: string;
  content: string;
  span: SourceSpan;
}

export type SceneElement =
  | TikzNodeElement
  | TikzEdgeElement
  | TikzChartElement
  | TikzRawElement;

export interface ParsedTikzDocument {
  fullSource: string;
  figureCaption: string;
  figureLabel: string;
  preambleStyles: Record<string, Record<string, string>>;
  elements: SceneElement[];
  nodes: TikzNodeElement[];
  edges: TikzEdgeElement[];
  charts: TikzChartElement[];
  diagnostics: Array<{
    line: number;
    message: string;
    severity: 'warning' | 'error';
  }>;
}
