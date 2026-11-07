import { describe, expect, it } from 'vitest';
import { parseTikzDocument } from '../../parser/parser';
import {
  applySearchReplaceBlocks,
  computeTikzDiff,
  extractSearchReplaceBlocks,
  resolveAgentPatchFromReply,
} from '../tikz-diff';
import {
  analyzeTikzLayout,
  autoRepairTikzLayout,
} from '../layout-diagnostics';
import { buildAgentSkillAndLibraryContext } from '../agent-knowledge';

const BROKEN_TRANSFORMER_FROM_SCREENSHOT = `\\begin{tikzpicture}[
  block/.style={draw, rounded corners=2pt, fill=white, minimum width=3.2cm, minimum height=0.8cm},
  frame/.style={draw, rounded corners=3pt, fill=white},
  label/.style={font=\\footnotesize, text=black},
  residual/.style={-Stealth, dashed},
  memoryflow/.style={-Stealth, thick}
]
\\node[frame, minimum width=4.6cm, minimum height=4.2cm] (encoder_block) at (5.0, 2.0) {};
\\node[label, minimum width=1.6cm, minimum height=0.35cm] (encoder_title) at (3.9, 3.85) {Encoder layer};
\\node[label, minimum width=0.55cm, minimum height=0.35cm] (encoder_repeat) at (6.7, 3.85) {$\\times N$};

\\node[block] (enc_mha) at (5.0, 0.8) {Multi-head\\\\self-attention};
\\node[block] (enc_norm1) at (5.0, 1.6) {Add \\& Norm};
\\node[block] (enc_ffn) at (5.0, 2.4) {Position-wise\\\\feed-forward};
\\node[block] (enc_norm2) at (5.0, 3.2) {Add \\& Norm};
\\node[block] (encoder_memory) at (5.0, 4.7) {Encoder output};

\\node[frame, minimum width=4.6cm, minimum height=5.8cm] (decoder_block) at (12.5, 2.5) {};
\\node[block] (decoder_cross_attention) at (12.5, 1.4) {Multi-head\\\\cross-attention};
\\node[block] (decoder_norm_cross) at (12.5, 2.2) {Add \\& Norm};
\\node[block] (decoder_ffn) at (12.5, 3.0) {Position-wise\\\\feed-forward};
\\node[block] (decoder_norm_ffn) at (12.5, 3.8) {Add \\& Norm};

\\draw[-Stealth] (enc_mha) -- (enc_norm1);
\\draw[-Stealth] (enc_norm1) -- (enc_ffn);
\\draw[-Stealth] (enc_ffn) -- (enc_norm2);
\\draw[-Stealth] (enc_norm2) -- (encoder_memory);

\\draw[residual] (decoder_cross_attention.east) -- (15.4, 1.4) |- (decoder_norm_cross.east);
\\draw[residual] (decoder_ffn.east) -- (15.4, 3.0) |- (decoder_norm_ffn.east);
\\draw[memoryflow] (encoder_memory.east) -- (9.55, 4.7) -- (9.55, 1.4) |- (decoder_cross_attention.west);

\\node[label, minimum width=0.45cm, minimum height=0.25cm] (cross_kv_label) at (11.1, 1.0) {(K,V)};
\\node[label, minimum width=0.3cm, minimum height=0.2cm] (cross_q_label) at (13.0, 0.75) {(Q)};
\\end{tikzpicture}`;

describe('Parser & Multi-Waypoint Edge / Borderless Label Fixes', () => {
  it('parses multi-waypoint \\draw paths and borderless .style labels from tikzpicture options', () => {
    const doc = parseTikzDocument(BROKEN_TRANSFORMER_FROM_SCREENSHOT);

    // All 7 edges (including the 3 multi-waypoint residual/memoryflow edges) must be parsed!
    expect(doc.edges.length).toBe(7);
    const crossEdge = doc.edges.find(
      (e) => e.from === 'encoder_memory' && e.to === 'decoder_cross_attention'
    );
    expect(crossEdge).toBeDefined();

    // Borderless `label` style nodes should NOT be parsed as bordered 'block'
    const kvLabel = doc.nodes.find((n) => n.id === 'cross_kv_label');
    expect(kvLabel).toBeDefined();
    expect(kvLabel?.subtype).toBe('math');

    // Large frame nodes should be recognized as containers
    const encContainer = doc.nodes.find((n) => n.id === 'encoder_block');
    expect(encContainer?.subtype).toBe('container');
  });
});

describe('AST Layout Diagnostics & Auto-Repair Engine', () => {
  it('detects 0cm vertical clearance, monochrome blocks, and repairs layout + theme colors automatically', () => {
    const beforeReport = analyzeTikzLayout(BROKEN_TRANSFORMER_FROM_SCREENSHOT, 'cvpr');
    expect(beforeReport.issues.length).toBeGreaterThan(0);
    expect(
      beforeReport.issues.some(
        (i) => i.kind === 'arrow_clearance' || i.kind === 'overlap'
      )
    ).toBe(true);
    expect(beforeReport.issues.some((i) => i.kind === 'unstyled_nodes')).toBe(true);

    const repaired = autoRepairTikzLayout(BROKEN_TRANSFORMER_FROM_SCREENSHOT, 'cvpr');
    expect(repaired.repairs.length).toBeGreaterThan(0);
    expect(repaired.afterReport.score).toBeGreaterThan(beforeReport.score);

    // Duplicate corner title/repeat nodes (`encoder_title`, `encoder_repeat`) should be merged into `encoder_block`
    const repairedDoc = parseTikzDocument(repaired.tikzCode);
    expect(repairedDoc.nodes.find((n) => n.id === 'encoder_title')).toBeUndefined();
    expect(repairedDoc.nodes.find((n) => n.id === 'encoder_repeat')).toBeUndefined();
    const encStage = repairedDoc.nodes.find((n) => n.id === 'encoder_block');
    expect(encStage?.label).toContain('Encoder layer');
    expect(encStage?.label).toContain('\\times N');

    // Vertical stack nodes must now have clean >= 0.50cm edge-to-edge clearance for arrows
    const mha = repairedDoc.nodes.find((n) => n.id === 'enc_mha')!;
    const norm1 = repairedDoc.nodes.find((n) => n.id === 'enc_norm1')!;
    const verticalGap = Math.abs(norm1.y - mha.y) - ((mha.height ?? 0.8) + (norm1.height ?? 0.8)) / 2;
    expect(verticalGap).toBeGreaterThanOrEqual(0.5);

    // Functional blocks should now have CVPR theme colors instead of plain white
    expect(mha.fill).toContain('cvpr_');
  });
});

describe('Surgical SEARCH/REPLACE Diff Engine', () => {
  it('extracts and applies SEARCH/REPLACE blocks and computes semantic + line diffs', () => {
    const reply = `我将为你修改注意力模块配色并调整高度：
\`\`\`tikz
<<<<<<< SEARCH
\\node[block] (enc_mha) at (5.0, 0.8) {Multi-head\\\\self-attention};
=======
\\node[mha_block, fill=cvpr_gold!18, draw=cvpr_gold!85!black, minimum width=3.4cm, minimum height=0.85cm] (enc_mha) at (5.0, 0.8) {Multi-head\\\\self-attention};
>>>>>>> REPLACE
\`\`\``;

    const blocks = extractSearchReplaceBlocks(reply);
    expect(blocks).toHaveLength(1);

    const applied = applySearchReplaceBlocks(BROKEN_TRANSFORMER_FROM_SCREENSHOT, blocks);
    expect(applied.appliedCount).toBe(1);
    expect(applied.nextSource).toContain('mha_block, fill=cvpr_gold!18');

    const resolved = resolveAgentPatchFromReply(
      reply,
      BROKEN_TRANSFORMER_FROM_SCREENSHOT,
      null
    );
    expect(resolved?.mode).toBe('surgical_diff');

    const diff = computeTikzDiff(
      BROKEN_TRANSFORMER_FROM_SCREENSHOT,
      applied.nextSource
    );
    expect(diff.affectedElementIds).toContain('enc_mha');
    expect(diff.modifiedCount).toBeGreaterThan(0);
    expect(diff.diffLines.some((l) => l.type === 'add')).toBe(true);
    expect(diff.diffLines.some((l) => l.type === 'remove')).toBe(true);
  });
});

describe('Agent Knowledge & Component Library Context Builder', () => {
  it('serializes Component Library, Journal Theme Palette, Geometric Rules, and Live AST Diagnostics', () => {
    const context = buildAgentSkillAndLibraryContext(
      'neurips',
      BROKEN_TRANSFORMER_FROM_SCREENSHOT,
      ['enc_mha']
    );
    expect(context).toContain('AGENTIKZ COMPONENT LIBRARY');
    expect(context).toContain('feature_cube');
    expect(context).toContain('mha_block');
    expect(context).toContain('stage_box');
    expect(context).toContain('SURGICAL DIFF PROTOCOL');
    expect(context).toContain('<<<<<<< SEARCH');
    expect(context).toContain('LIVE CANVAS AST & GEOMETRIC DIAGNOSTICS');
    expect(context).toContain('Currently Selected Element IDs on Canvas: enc_mha');
  });
});
