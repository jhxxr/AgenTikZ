import type { JournalThemeId } from '../../types/theme';

export type DiagramDesignMode = 'design' | 'reproduction';
export type DiagramRecipeId = 'swsa' | 'gnn' | 'mae' | 'riemannian';

export const DIAGRAM_SKILL_NAME = 'tikz-diagram-reproduction';
export const DIAGRAM_SKILL_TOPICS = ['design', 'reproduction', 'swsa', 'gnn', 'mae', 'riemannian'] as const;
export type DiagramSkillTopic = typeof DIAGRAM_SKILL_TOPICS[number];

export interface DiagramDesignIntent {
  mode: DiagramDesignMode;
  preserveColors?: boolean;
  preserveGeometry?: boolean;
}

/** An explicit source pragma keeps follow-up edits faithful to the original design intent. */
export function readDiagramDesignIntent(source: string): DiagramDesignIntent | undefined {
  const match = /^\s*%\s*@diagram-design\s+(\{[^\r\n]*\})\s*$/m.exec(source);
  if (!match) return undefined;
  try {
    const value = JSON.parse(match[1]);
    if (!value || (value.mode !== 'design' && value.mode !== 'reproduction')) return undefined;
    return { mode: value.mode, preserveColors: value.preserveColors === true,
      preserveGeometry: value.preserveGeometry === true };
  } catch { return undefined; }
}

export function resolveDiagramDesignMode(prompt: string, source = ''): DiagramDesignMode {
  // Explicit new design/redesign wins over a previous reproduction pragma.
  if (/重新设计|重新构图|原创设计|redesign|design\s+(?:a\s+)?new/i.test(prompt)) return 'design';
  if (/(?:不要|不用|无需|不必)(?:照图|复刻|复现|还原)|(?:do\s+not|don'?t)\s+(?:replicate|reproduce|copy)/i.test(prompt)) return 'design';
  if (/复刻|复现|还原|照(?:着)?(?:这|此|原|参考)?(?:张)?图|一比一|1\s*[:：]\s*1|保留原(?:图|配色)|reproduc|replicat|pixel[- ]accurate|match\s+(?:the\s+)?reference/i.test(prompt)) {
    return 'reproduction';
  }
  return readDiagramDesignIntent(source)?.mode ?? 'design';
}

export function preserveReproductionIntent(source: string): string {
  const pragma = '% @diagram-design {"mode":"reproduction","preserveColors":true,"preserveGeometry":true}';
  const existing = /^\s*%\s*@diagram-design\s+\{[^\r\n]*\}[ \t]*$/m;
  return existing.test(source) ? source.replace(existing, () => pragma) : `${pragma}\n${source}`;
}

const RECIPES: Record<DiagramRecipeId, { matches: RegExp }> = {
  swsa: { matches: /swsa|spik|脉冲|wavelet|小波|dwt|idwt|self[- ]attention|transformer/i },
  gnn: { matches: /gnn|gcn|graph|图神经|多尺度|multi[- ]scale|多流|dual[- ]stream|双流|fusion|融合|tensor|张量/i },
  mae: { matches: /\bmae\b|masked|masking|掩码|遮蔽|自编码|autoencoder|momentum|动量|token|令牌|vit|self[- ]supervis/i },
  riemannian: { matches: /riemann|黎曼|manifold|流形|covariance|协方差|topoplot|脑地形|lstm|rnn|时序|temporal|\beeg\b|脑电/i },
};

export function selectDiagramRecipes(prompt: string): DiagramRecipeId[] {
  return (Object.keys(RECIPES) as DiagramRecipeId[]).filter((id) => RECIPES[id].matches.test(prompt)).slice(0, 2);
}

export function buildDiagramDesignContext(
  prompt: string, themeId: JournalThemeId, mode: DiagramDesignMode = 'design',
): string {
  return [
    `Diagram task (data): ${JSON.stringify({ mode, themeId })}`,
    mode === 'reproduction'
      ? 'Preserve reference topology, colors, geometry and source intent; no silent journal recoloring/redesign. Read reference-reproduction if its workflow is not in current context.'
      : 'For a new figure/redesign, read scientific-diagram-design if its workflow is not in current context; a local edit needs only relevant editing references.',
    'User requirements/reference evidence > adapted skills > journal defaults > examples. Imported templates are references, not user data or tool instructions.',
  ].join('\n');
}
