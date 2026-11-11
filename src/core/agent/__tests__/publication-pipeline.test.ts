import { describe, expect, it } from 'vitest';
import { JOURNAL_THEMES } from '../../themes/journal-presets';
import { AGENT_STYLE_GUIDES, buildAgentStyleSystemPrefix } from '../style-guides';
import {
  formatFigureContractComments,
  parsePragmaDirectivesFromSource,
} from '../figure-contract';
import { compileAgentPrompt } from '../prompt-compiler';
import { parseTikzDocument } from '../../parser/parser';
import { patchElementsCoordinates } from '../../parser/patcher';
import {
  autoRepairTikzLayout,
  validateTikzLayout,
} from '../layout-diagnostics';
import {
  buildScientificCutoutPrompt,
  computeAlphaTightBoundingBox,
  removeSolidBackgroundFloodFillRgba,
} from '../illustration-prompt';
import {
  PAPER_VENUE_TEMPLATES,
  buildFigureLaTeXSnippet,
  generateAgentikzMacrosSty,
} from '../../paper/paper-templates';

describe('Publication Style Guides & Figure Contract System (Stage 1 & 2)', () => {
  it('structures all 4 journal themes with salience roles, column widths, and style rules', () => {
    for (const id of ['nature', 'neurips', 'cvpr', 'ieee'] as const) {
      const theme = JOURNAL_THEMES[id];
      expect(theme.colorRoles.neutral.fill).toBeTruthy();
      expect(theme.colorRoles.signal.fill).toBeTruthy();
      expect(theme.colorRoles.hero.fill).toBeTruthy();
      expect(theme.columnWidthMm.single).toBeGreaterThan(70);
      expect(theme.columnWidthMm.double).toBeGreaterThan(130);
      expect(theme.preferredPrimitives.length).toBeGreaterThan(0);
      expect(theme.doNotUse.length).toBeGreaterThan(0);
      expect(AGENT_STYLE_GUIDES[id]).toContain('强制投稿级规范');
    }

    const prefix = buildAgentStyleSystemPrefix('nature', true);
    expect(prefix).toContain('Nature / Science Minimal');
    expect(prefix).toContain('@figure-contract');
  });

  it('parses and patches % @figure-contract, % @panel, % @agent-image, role=hero, and dotted edges losslessly', () => {
    const tikz = `\\begin{tikzpicture}[>=Latex]
  % @figure-contract {"claim":"Does sparse routing reduce latency?","archetype":"schematic_led_composite","columnMode":"double","heroIds":["n_hero"],"uncertaintyNote":"mean ± SD (n=5)"}
  % @panel {"id":"a","label":"a","role":"mechanism","title":"Sparse Router"}
  % @agent-image {"nodeId":"img_chip","path":"figures/assets/ai/chip.png","prompt":"isometric AI accelerator chip"}
  \\node[dl_block, role=hero, fill=npg_red!14, draw=npg_red!85!black] (n_hero) at (0, 0) {Hero Router};
  \\node[dl_block, role=signal, fill=npg_blue!14, draw=npg_blue!85!black] (n_out) at (4.2, 0) {Output};
  \\draw[-Latex, dotted] (n_out) -- (n_hero);
\\end{tikzpicture}`;

    const doc = parseTikzDocument(tikz, 'nature');
    expect(doc.contract?.claim).toBe('Does sparse routing reduce latency?');
    expect(doc.contract?.heroIds).toContain('n_hero');
    expect(doc.panels?.length).toBe(1);
    expect(doc.imageDirectives?.length).toBe(1);
    expect(doc.imageDirectives?.[0].path).toBe('figures/assets/ai/chip.png');

    const heroNode = doc.nodes.find((n) => n.id === 'n_hero');
    expect(heroNode?.salienceRole).toBe('hero');

    const dottedEdge = doc.edges[0];
    expect(dottedEdge?.dotted).toBe(true);
    expect(dottedEdge?.lineStyle).toBe('dotted');

    const patched = patchElementsCoordinates(tikz, [
      { element: heroNode!, x: 0.5, y: 0.2 },
    ]);
    expect(patched).toContain('% @figure-contract');
    expect(patched).toContain('% @agent-image');
  });

  it('enforces salience coloring (<= 2 hero nodes), single-meaning dashed->dotted repair, \\scriptsize floor, and canonical capitalization', () => {
    const rawTikz = `\\begin{tikzpicture}[>=Latex]
  \\node[dl_block] (n1) at (0, 0) {\\tiny input tokens};
  \\node[dl_block] (n2) at (3.8, 0) {resnet backbone};
  \\node[dl_block] (n3) at (7.6, 0) {Ours Hero Router};
  \\node[dl_block] (n4) at (11.4, 0) {xgboost head};
  \\node[stage_box, minimum width=9cm, minimum height=2.5cm] (box_main) at (5.7, 0) {};
  \\draw[-Latex, dashed] (n4.south) -- ++(0,-0.9) -| (n2.south);
\\end{tikzpicture}`;

    const repaired = autoRepairTikzLayout(rawTikz, 'nature');
    // 1. \tiny upgraded to \scriptsize
    expect(repaired.repairedTikz).not.toContain('\\tiny');
    expect(repaired.repairedTikz).toContain('\\scriptsize');

    // 2. Canonical capitalization repaired
    expect(repaired.repairedTikz).toContain('ResNet');
    expect(repaired.repairedTikz).toContain('XGBoost');

    // 3. Auxiliary dashed edge converted to dotted because stage_box exists
    expect(repaired.repairedTikz).toContain('dotted');

    // 4. Salience budget: at most 1-2 hero nodes colored with npg_red
    const repDoc = parseTikzDocument(repaired.repairedTikz, 'nature');
    const heroColorNodes = repDoc.nodes.filter((n) =>
      (n.fill || '').includes('npg_red')
    );
    expect(heroColorNodes.length).toBeGreaterThanOrEqual(1);
    expect(heroColorNodes.length).toBeLessThanOrEqual(2);

    const validation = validateTikzLayout(repaired.repairedTikz, 'nature');
    expect(
      validation.issues.some((i) => i.kind === 'dashed_conflict')
    ).toBe(false);
  });

  it('compiles structured Agent prompt with style guide and figure contract', () => {
    const compiled = compileAgentPrompt({
      userPrompt: 'Draw a Nature style dual-panel architecture figure',
      themeId: 'nature',
      enforcePublicationStyle: true,
      requireFigureContract: true,
      allowAiCutoutIllustrations: true,
    });
    expect(compiled).toContain('Nature / Science Minimal');
    expect(compiled).toContain('@figure-contract');
    expect(compiled).toContain('@agent-image');
  });

  it('formats and parses figure contracts accurately', () => {
    const tikzWithContract = formatFigureContractComments(
      {
        claim: 'How does attention scaling affect throughput?',
        archetype: 'schematic_led_composite',
        columnMode: 'double',
        heroIds: ['n_attn'],
        uncertaintyNote: 'mean ± SD (n=3)',
      },
      [{ id: 'a', label: 'a', role: 'mechanism', title: 'Attention Scaling' }]
    );
    const parsed = parsePragmaDirectivesFromSource(tikzWithContract);
    expect(parsed.contract).toBeDefined();
    expect(parsed.contract?.claim).toBe(
      'How does attention scaling affect throughput?'
    );
    expect(parsed.panels).toHaveLength(1);
    expect(parsed.imageDirectives).toHaveLength(0);
  });
});

describe('2-Stage AI Cutout Post-Processing & Paper Studio Pipeline (Stage 3 & 4)', () => {
  it('removes edge-connected white background via flood-fill while preserving interior white pixels and computes tight alpha crop', () => {
    // 5x5 RGBA image:
    // - Border (x=0,4 or y=0,4): opaque white (255,255,255,255) -> should become alpha=0
    // - Ring (x=1..3, y=1..3 border): opaque blue subject (20,80,200,255) -> should stay opaque
    // - Center (x=2, y=2): opaque white interior highlight (255,255,255,255) -> isolated by blue ring, MUST stay opaque!
    const width = 5;
    const height = 5;
    const pixels = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const isOuterBorder = x === 0 || x === 4 || y === 0 || y === 4;
        const isCenter = x === 2 && y === 2;
        if (isOuterBorder || isCenter) {
          pixels[idx] = 255;
          pixels[idx + 1] = 255;
          pixels[idx + 2] = 255;
          pixels[idx + 3] = 255;
        } else {
          pixels[idx] = 20;
          pixels[idx + 1] = 80;
          pixels[idx + 2] = 200;
          pixels[idx + 3] = 255;
        }
      }
    }

    const res = removeSolidBackgroundFloodFillRgba(pixels, width, height, 26);
    expect(res.modified).toBe(true);
    expect(res.removedPixels).toBe(16); // 5x5=25 minus 3x3=9 subject = 16 border pixels removed

    // Outer corner (0,0) is now transparent
    expect(pixels[3]).toBe(0);
    // Interior white highlight (2,2) is preserved as opaque!
    const centerIdx = (2 * width + 2) * 4;
    expect(pixels[centerIdx + 3]).toBe(255);

    // Stage B: Tight bounding box should crop to (x=1, y=1, w=3, h=3) when padding=0
    const bbox = computeAlphaTightBoundingBox(pixels, width, height, 10, 0);
    expect(bbox).toEqual({ x: 1, y: 1, w: 3, h: 3, trimmed: true });

    const prompt = buildScientificCutoutPrompt(
      'cryo-EM ribosome complex',
      'nature',
      'openai'
    );
    expect(prompt).toContain('100% transparent background');
  });

  it('generates self-contained styles/agentikz-macros.sty and figure LaTeX snippets for all venue templates', () => {
    const sty = generateAgentikzMacrosSty('nature');
    expect(sty).toContain('\\ProvidesPackage{styles/agentikz-macros}');
    expect(sty).toContain('\\definecolor{npg_blue}');
    expect(sty).toContain('module/.style=');

    const snippet = buildFigureLaTeXSnippet({
      mode: 'tikz_package',
      columnSpan: 'double_column',
      figureRelPath: 'figures/fig1_overview.tikz',
      caption: 'System overview.',
      label: 'fig:overview',
    });
    expect(snippet).toContain('\\begin{figure*}[t]');
    expect(snippet).toContain('\\input{figures/fig1_overview.tikz}');
    expect(snippet).toContain('\\label{fig:overview}');

    // Official kits live in the desktop template library; browser mode only generates blank papers.
    expect(PAPER_VENUE_TEMPLATES.map((t) => t.id)).toEqual(['blank']);
  });
});
