const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Unicode Double-Struck (\mathbb{...}) lookup for ASCII A-Z
 */
const MATHBB_MAP: Record<string, string> = {
  A: '𝔸',
  B: '𝔹',
  C: 'ℂ',
  D: '𝔻',
  E: '𝔼',
  F: '𝔽',
  G: '𝔾',
  H: 'ℍ',
  I: '𝕀',
  J: '𝕁',
  K: '𝕂',
  L: '𝕃',
  M: '𝕄',
  N: 'ℕ',
  O: '𝕆',
  P: 'ℙ',
  Q: 'ℚ',
  R: 'ℝ',
  S: '𝕊',
  T: '𝕋',
  U: '𝕌',
  V: '𝕍',
  W: '𝕎',
  X: '𝕏',
  Y: '𝕐',
  Z: 'ℤ',
};

/**
 * Unicode Script/Calligraphic (\mathcal{...}) lookup for ASCII A-Z
 */
const MATHCAL_MAP: Record<string, string> = {
  A: '𝒜',
  B: 'ℬ',
  C: '𝒞',
  D: '𝒟',
  E: 'ℰ',
  F: 'ℱ',
  G: '𝒢',
  H: 'ℋ',
  I: 'ℐ',
  J: '𝒥',
  K: '𝒦',
  L: 'ℒ',
  M: 'ℳ',
  N: '𝒩',
  O: '𝒪',
  P: '𝒫',
  Q: '𝒬',
  R: 'ℛ',
  S: '𝒮',
  T: '𝒯',
  U: '𝒰',
  V: '𝒱',
  W: '𝒲',
  X: '𝒳',
  Y: '𝒴',
  Z: '𝒵',
};

function mapSpecialMathChars(str: string, el: Element): string {
  if (el.closest('.mathbb')) {
    return Array.from(str)
      .map((ch) => MATHBB_MAP[ch] || ch)
      .join('');
  }
  if (el.closest('.mathcal')) {
    return Array.from(str)
      .map((ch) => MATHCAL_MAP[ch] || ch)
      .join('');
  }
  return str;
}

function round2(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

function isTransparentColor(color: string | null | undefined): boolean {
  if (!color) return true;
  const c = color.trim().toLowerCase();
  return (
    c === 'transparent' ||
    c === 'none' ||
    c === 'rgba(0, 0, 0, 0)' ||
    c === 'rgba(0,0,0,0)'
  );
}

interface LocalBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

function screenRectToLocalBox(
  rect: DOMRect,
  invMatrix: DOMMatrix
): LocalBox | null {
  if (rect.width <= 0 && rect.height <= 0) return null;
  const p1 = new DOMPoint(rect.left, rect.top).matrixTransform(invMatrix);
  const p2 = new DOMPoint(rect.right, rect.top).matrixTransform(invMatrix);
  const p3 = new DOMPoint(rect.right, rect.bottom).matrixTransform(invMatrix);
  const p4 = new DOMPoint(rect.left, rect.bottom).matrixTransform(invMatrix);
  const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
  const maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
  const minY = Math.min(p1.y, p2.y, p3.y, p4.y);
  const maxY = Math.max(p1.y, p2.y, p3.y, p4.y);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

/**
 * Fallback conversion when DOM layout metrics (getBoundingClientRect / getScreenCTM)
 * are unavailable (e.g., headless unit tests or detached SVG).
 */
function convertForeignObjectFallback(
  liveFo: SVGForeignObjectElement,
  doc: Document
): SVGGElement {
  const g = doc.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'agentikz-vector-label');

  const x = parseFloat(liveFo.getAttribute('x') || '0');
  const y = parseFloat(liveFo.getAttribute('y') || '0');
  const w = parseFloat(liveFo.getAttribute('width') || '100');
  const h = parseFloat(liveFo.getAttribute('height') || '28');

  const rootDiv = liveFo.firstElementChild as HTMLElement | null;
  const baseColor =
    rootDiv?.style?.color ||
    liveFo.getAttribute('color') ||
    '#0F172A';
  const baseFontSize = parseFloat(rootDiv?.style?.fontSize || '11') || 11;

  // Gather lines inside LatexLabel
  const lineDivs = rootDiv
    ? Array.from(rootDiv.children).filter(
        (c) => c.tagName === 'DIV' || c.tagName === 'SPAN'
      )
    : [];
  const targets = lineDivs.length > 0 ? lineDivs : [liveFo];

  const totalLines = targets.length;
  const lineStep = baseFontSize * 1.25;
  const startY =
    y + h / 2 - ((totalLines - 1) * lineStep) / 2 + baseFontSize * 0.34;

  targets.forEach((lineEl, idx) => {
    // Remove any .katex-mathml if present
    const clone = lineEl.cloneNode(true) as Element;
    clone.querySelectorAll('.katex-mathml').forEach((m) => m.remove());
    const rawText = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    if (!rawText) return;

    const textEl = doc.createElementNS(SVG_NS, 'text');
    textEl.setAttribute('x', round2(x + w / 2));
    textEl.setAttribute('y', round2(startY + idx * lineStep));
    textEl.setAttribute('text-anchor', 'middle');
    textEl.setAttribute('fill', baseColor);
    textEl.setAttribute('font-size', round2(baseFontSize));
    textEl.setAttribute(
      'font-family',
      '"Latin Modern Math", "Cambria Math", "Computer Modern", "Times New Roman", serif'
    );
    textEl.textContent = rawText;
    g.appendChild(textEl);
  });

  return g;
}

/**
 * Converts a live <foreignObject> containing <LatexLabel> + KaTeX DOM
 * into pure native SVG 1.1 primitives (<g>, <rect>, <line>, <path>, <svg>, <text>, <tspan>)
 * so exported SVGs work in any viewer, browser <img>, Illustrator, Inkscape, or Keynote
 * without requiring external KaTeX or Tailwind CSS.
 */
function convertForeignObjectToNativeSvg(
  liveFo: SVGForeignObjectElement,
  doc: Document
): SVGGElement {
  const parentSvgG = (liveFo.parentElement as unknown as SVGGraphicsElement) || liveFo;
  const ctm =
    typeof parentSvgG.getScreenCTM === 'function'
      ? parentSvgG.getScreenCTM()
      : null;
  const foRect = liveFo.getBoundingClientRect();

  if (!ctm || (foRect.width <= 0 && foRect.height <= 0)) {
    return convertForeignObjectFallback(liveFo, doc);
  }

  let invMatrix: DOMMatrix;
  try {
    invMatrix = ctm.inverse();
  } catch {
    return convertForeignObjectFallback(liveFo, doc);
  }

  // Scale factor from screen CSS px to local SVG user units
  const originPt = new DOMPoint(0, 0).matrixTransform(invMatrix);
  const unitXPt = new DOMPoint(1, 0).matrixTransform(invMatrix);
  const unitYPt = new DOMPoint(0, 1).matrixTransform(invMatrix);
  const scaleFactor =
    (Math.hypot(unitXPt.x - originPt.x, unitXPt.y - originPt.y) +
      Math.hypot(unitYPt.x - originPt.x, unitYPt.y - originPt.y)) /
    2;

  const outG = doc.createElementNS(SVG_NS, 'g');
  outG.setAttribute('class', 'agentikz-vector-label');

  // 1. Export visible pill backgrounds/borders (e.g., container badge, edge label pill)
  const htmlDescendants = [
    liveFo,
    ...Array.from(liveFo.querySelectorAll('*')),
  ];
  for (const el of htmlDescendants) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.closest('.katex')) continue;
    const cs = window.getComputedStyle(el);
    const hasBg = !isTransparentColor(cs.backgroundColor);
    const borderW = parseFloat(cs.borderTopWidth || '0');
    const hasBorder =
      borderW > 0 &&
      cs.borderTopStyle !== 'none' &&
      !isTransparentColor(cs.borderTopColor);

    if (hasBg || hasBorder) {
      const box = screenRectToLocalBox(el.getBoundingClientRect(), invMatrix);
      if (box && box.width > 1 && box.height > 1) {
        const rectEl = doc.createElementNS(SVG_NS, 'rect');
        rectEl.setAttribute('x', round2(box.minX));
        rectEl.setAttribute('y', round2(box.minY));
        rectEl.setAttribute('width', round2(box.width));
        rectEl.setAttribute('height', round2(box.height));
        const rx = Math.min(
          box.height / 2,
          (parseFloat(cs.borderTopLeftRadius || '0') || 2) * scaleFactor
        );
        if (rx > 0) {
          rectEl.setAttribute('rx', round2(rx));
        }
        rectEl.setAttribute('fill', hasBg ? cs.backgroundColor : 'none');
        if (hasBorder) {
          rectEl.setAttribute('stroke', cs.borderTopColor);
          rectEl.setAttribute('stroke-width', round2(borderW * scaleFactor));
        } else {
          rectEl.setAttribute('stroke', 'none');
        }
        outG.appendChild(rectEl);
      }
    }
  }

  // 2. Export KaTeX fraction lines, overlines, underlines, and matrix rules
  const ruleElements = liveFo.querySelectorAll(
    '.frac-line, .overline-line, .underline-line, .hline'
  );
  ruleElements.forEach((ruleEl) => {
    const box = screenRectToLocalBox(ruleEl.getBoundingClientRect(), invMatrix);
    if (!box || box.width <= 0.2) return;
    const cs = window.getComputedStyle(ruleEl);
    const strokeColor =
      !isTransparentColor(cs.borderBottomColor)
        ? cs.borderBottomColor
        : !isTransparentColor(cs.borderTopColor)
          ? cs.borderTopColor
          : !isTransparentColor(cs.backgroundColor)
            ? cs.backgroundColor
            : cs.color || '#0F172A';
    const lineEl = doc.createElementNS(SVG_NS, 'line');
    lineEl.setAttribute('x1', round2(box.minX));
    lineEl.setAttribute('y1', round2(box.cy));
    lineEl.setAttribute('x2', round2(box.maxX));
    lineEl.setAttribute('y2', round2(box.cy));
    lineEl.setAttribute('stroke', strokeColor);
    lineEl.setAttribute(
      'stroke-width',
      round2(Math.max(0.75, box.height || 0.9))
    );
    outG.appendChild(lineEl);
  });

  // 3. Export inline SVGs inside KaTeX (e.g. \sqrt{...} radical sign inside .hide-tail)
  const inlineSvgs = liveFo.querySelectorAll('svg');
  inlineSvgs.forEach((innerSvg) => {
    const clipParent =
      (innerSvg.closest('.hide-tail') as HTMLElement | null) ||
      innerSvg.parentElement;
    const clipRect = (clipParent || innerSvg).getBoundingClientRect();
    const box = screenRectToLocalBox(clipRect, invMatrix);
    if (!box || box.width <= 0.3 || box.height <= 0.3) return;

    const cs = window.getComputedStyle(innerSvg);
    const color = cs.color || '#0F172A';
    const vbAttr = innerSvg.getAttribute('viewBox');
    const vbParts = vbAttr
      ? vbAttr
          .trim()
          .split(/[\s,]+/)
          .map(Number)
      : [];

    const nestedSvg = doc.createElementNS(SVG_NS, 'svg');
    nestedSvg.setAttribute('x', round2(box.minX));
    nestedSvg.setAttribute('y', round2(box.minY));
    nestedSvg.setAttribute('width', round2(box.width));
    nestedSvg.setAttribute('height', round2(box.height));
    nestedSvg.setAttribute('overflow', 'hidden');

    if (vbParts.length === 4 && vbParts[3] > 0) {
      // KaTeX radical SVGs have viewBox="0 0 400000 1080" and rely on .hide-tail overflow:hidden.
      // Crop the viewBox width and horizontal vinculum path to the exact clipped aspect ratio!
      const croppedVbW = Math.max(
        100,
        Math.round(vbParts[3] * (box.width / box.height))
      );
      nestedSvg.setAttribute(
        'viewBox',
        `${vbParts[0]} ${vbParts[1]} ${croppedVbW} ${vbParts[3]}`
      );
      nestedSvg.setAttribute('preserveAspectRatio', 'none');

      innerSvg.querySelectorAll('path').forEach((p) => {
        const d = p.getAttribute('d') || '';
        const croppedD = d
          .replace(/H\s*400000/g, `H${croppedVbW}`)
          .replace(/400000/g, String(croppedVbW));
        const newPath = doc.createElementNS(SVG_NS, 'path');
        newPath.setAttribute('d', croppedD);
        newPath.setAttribute('fill', color);
        nestedSvg.appendChild(newPath);
      });
    } else {
      innerSvg.querySelectorAll('path').forEach((p) => {
        const newPath = doc.createElementNS(SVG_NS, 'path');
        newPath.setAttribute('d', p.getAttribute('d') || '');
        newPath.setAttribute('fill', color);
        nestedSvg.appendChild(newPath);
      });
    }

    outG.appendChild(nestedSvg);
  });

  // 4. Export KaTeX accents (\hat, \bar, \tilde, \vec) as crisp vector paths above base glyph
  const accents = liveFo.querySelectorAll('.accent');
  accents.forEach((accEl) => {
    // Find the base character box (first .mord or .mathnormal inside the accent vlist)
    const baseEl =
      accEl.querySelector('.mord, .mathnormal, .mop') || accEl;
    const box = screenRectToLocalBox(baseEl.getBoundingClientRect(), invMatrix);
    if (!box || box.width <= 0.2) return;

    const accBody = accEl.querySelector('.accent-body');
    const accText = accBody?.textContent || '';
    const cs = window.getComputedStyle(accEl);
    const color = cs.color || '#0F172A';

    const w = Math.max(4, box.width * 0.78);
    const cx = box.cx + box.width * 0.08;
    const topY = box.minY + box.height * 0.12;

    if (accText.includes('\u02C9') || accText.includes('\u00AF') || accText.includes('-')) {
      // \bar
      const bar = doc.createElementNS(SVG_NS, 'line');
      bar.setAttribute('x1', round2(cx - w / 2));
      bar.setAttribute('y1', round2(topY));
      bar.setAttribute('x2', round2(cx + w / 2));
      bar.setAttribute('y2', round2(topY));
      bar.setAttribute('stroke', color);
      bar.setAttribute('stroke-width', '0.9');
      outG.appendChild(bar);
    } else if (accText.includes('\u02DC') || accText.includes('~')) {
      // \tilde
      const tilde = doc.createElementNS(SVG_NS, 'path');
      const x0 = cx - w / 2;
      const x1 = cx + w / 2;
      tilde.setAttribute(
        'd',
        `M ${round2(x0)} ${round2(topY + 0.6)} Q ${round2(cx - w * 0.2)} ${round2(topY - 1.4)} ${round2(cx)} ${round2(topY)} T ${round2(x1)} ${round2(topY - 0.6)}`
      );
      tilde.setAttribute('fill', 'none');
      tilde.setAttribute('stroke', color);
      tilde.setAttribute('stroke-width', '0.85');
      outG.appendChild(tilde);
    } else if (accText.includes('\u20D7') || accText.includes('→')) {
      // \vec
      const vec = doc.createElementNS(SVG_NS, 'path');
      const x0 = cx - w / 2;
      const x1 = cx + w / 2;
      vec.setAttribute(
        'd',
        `M ${round2(x0)} ${round2(topY)} L ${round2(x1)} ${round2(topY)} M ${round2(x1 - 1.8)} ${round2(topY - 1.3)} L ${round2(x1)} ${round2(topY)} L ${round2(x1 - 1.8)} ${round2(topY + 1.3)}`
      );
      vec.setAttribute('fill', 'none');
      vec.setAttribute('stroke', color);
      vec.setAttribute('stroke-width', '0.85');
      outG.appendChild(vec);
    } else {
      // Default to \hat circumflex
      const hat = doc.createElementNS(SVG_NS, 'path');
      hat.setAttribute(
        'd',
        `M ${round2(cx - w / 2)} ${round2(topY + 1.4)} L ${round2(cx)} ${round2(topY - 1.1)} L ${round2(cx + w / 2)} ${round2(topY + 1.4)}`
      );
      hat.setAttribute('fill', 'none');
      hat.setAttribute('stroke', color);
      hat.setAttribute('stroke-width', '0.9');
      hat.setAttribute('stroke-linecap', 'round');
      hat.setAttribute('stroke-linejoin', 'round');
      outG.appendChild(hat);
    }
  });

  // 5. Export KaTeX multi-size delimiters (\left( \right), \left[ \right], \left\| \right\|)
  const delims = liveFo.querySelectorAll('.delimsizing, .delimcenter');
  delims.forEach((delimEl) => {
    const text = (delimEl.textContent || '').trim();
    if (!text) return;
    // Measure either the delimiter or its enclosing .minner vertical span
    const minner = delimEl.closest('.minner');
    const delimBox = screenRectToLocalBox(
      delimEl.getBoundingClientRect(),
      invMatrix
    );
    const minnerBox = minner
      ? screenRectToLocalBox(minner.getBoundingClientRect(), invMatrix)
      : null;
    if (!delimBox || delimBox.width <= 0.2) return;

    const topY = minnerBox ? Math.min(delimBox.minY, minnerBox.minY + 1) : delimBox.minY;
    const botY = minnerBox ? Math.max(delimBox.maxY, minnerBox.maxY - 1) : delimBox.maxY;
    const h = botY - topY;
    const cx = delimBox.cx;
    const cs = window.getComputedStyle(delimEl);
    const color = cs.color || '#0F172A';

    if (text.includes('(') || text.includes('⎛') || text.includes('⎝')) {
      const curve = Math.max(2.2, Math.min(4.5, h * 0.16));
      const p = doc.createElementNS(SVG_NS, 'path');
      p.setAttribute(
        'd',
        `M ${round2(cx + curve * 0.45)} ${round2(topY)} Q ${round2(cx - curve * 0.75)} ${round2((topY + botY) / 2)} ${round2(cx + curve * 0.45)} ${round2(botY)}`
      );
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', color);
      p.setAttribute('stroke-width', '1.05');
      p.setAttribute('stroke-linecap', 'round');
      outG.appendChild(p);
    } else if (text.includes(')') || text.includes('⎞') || text.includes('⎠')) {
      const curve = Math.max(2.2, Math.min(4.5, h * 0.16));
      const p = doc.createElementNS(SVG_NS, 'path');
      p.setAttribute(
        'd',
        `M ${round2(cx - curve * 0.45)} ${round2(topY)} Q ${round2(cx + curve * 0.75)} ${round2((topY + botY) / 2)} ${round2(cx - curve * 0.45)} ${round2(botY)}`
      );
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', color);
      p.setAttribute('stroke-width', '1.05');
      p.setAttribute('stroke-linecap', 'round');
      outG.appendChild(p);
    } else if (text.includes('[') || text.includes('⎡') || text.includes('⎣')) {
      const arm = Math.max(2.2, Math.min(3.8, h * 0.14));
      const p = doc.createElementNS(SVG_NS, 'path');
      p.setAttribute(
        'd',
        `M ${round2(cx + arm * 0.5)} ${round2(topY)} L ${round2(cx - arm * 0.5)} ${round2(topY)} L ${round2(cx - arm * 0.5)} ${round2(botY)} L ${round2(cx + arm * 0.5)} ${round2(botY)}`
      );
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', color);
      p.setAttribute('stroke-width', '1.05');
      outG.appendChild(p);
    } else if (text.includes(']') || text.includes('⎤') || text.includes('⎦')) {
      const arm = Math.max(2.2, Math.min(3.8, h * 0.14));
      const p = doc.createElementNS(SVG_NS, 'path');
      p.setAttribute(
        'd',
        `M ${round2(cx - arm * 0.5)} ${round2(topY)} L ${round2(cx + arm * 0.5)} ${round2(topY)} L ${round2(cx + arm * 0.5)} ${round2(botY)} L ${round2(cx - arm * 0.5)} ${round2(botY)}`
      );
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', color);
      p.setAttribute('stroke-width', '1.05');
      outG.appendChild(p);
    } else if (text.includes('∥') || text.includes('\u2016')) {
      for (const dx of [-1.2, 1.2]) {
        const l = doc.createElementNS(SVG_NS, 'line');
        l.setAttribute('x1', round2(cx + dx));
        l.setAttribute('y1', round2(topY));
        l.setAttribute('x2', round2(cx + dx));
        l.setAttribute('y2', round2(botY));
        l.setAttribute('stroke', color);
        l.setAttribute('stroke-width', '0.95');
        outG.appendChild(l);
      }
    } else if (text.includes('|') || text.includes('∣')) {
      const l = doc.createElementNS(SVG_NS, 'line');
      l.setAttribute('x1', round2(cx));
      l.setAttribute('y1', round2(topY));
      l.setAttribute('x2', round2(cx));
      l.setAttribute('y2', round2(botY));
      l.setAttribute('stroke', color);
      l.setAttribute('stroke-width', '0.95');
      outG.appendChild(l);
    }
  });

  // 6. Export text & math runs
  const rootDiv = liveFo.firstElementChild as HTMLElement | null;
  const lineContainers: HTMLElement[] =
    rootDiv && rootDiv.children.length > 0
      ? (Array.from(rootDiv.children).filter(
          (el): el is HTMLElement => el instanceof HTMLElement
        ) as HTMLElement[])
      : [liveFo as unknown as HTMLElement];

  const emitStyledTextElement = (
    content: string,
    x: number,
    y: number,
    anchor: 'start' | 'middle' | 'end',
    styleEl: Element
  ) => {
    const cs = window.getComputedStyle(styleEl);
    const fontSize = (parseFloat(cs.fontSize || '11') || 11) * scaleFactor;
    const isKatex = Boolean(styleEl.closest('.katex'));
    const isSansText = Boolean(styleEl.closest('.text, .textrm, .textsf'));
    const isItalic =
      cs.fontStyle === 'italic' ||
      styleEl.classList.contains('mathnormal') ||
      styleEl.classList.contains('mathit') ||
      Boolean(styleEl.closest('em, i'));
    const weightNum = parseInt(cs.fontWeight || '400', 10);
    const isBold =
      weightNum >= 600 ||
      cs.fontWeight === 'bold' ||
      styleEl.classList.contains('mathbf') ||
      styleEl.classList.contains('boldsymbol') ||
      Boolean(styleEl.closest('strong, b'));

    const textEl = doc.createElementNS(SVG_NS, 'text');
    textEl.setAttribute('x', round2(x));
    textEl.setAttribute('y', round2(y));
    textEl.setAttribute('text-anchor', anchor);
    textEl.setAttribute('fill', cs.color || '#0F172A');
    textEl.setAttribute('font-size', round2(fontSize));
    textEl.setAttribute(
      'font-family',
      isKatex && !isSansText
        ? '"Latin Modern Math", "Cambria Math", "Computer Modern", "Times New Roman", serif'
        : cs.fontFamily || '"Times New Roman", serif'
    );
    if (isItalic) {
      textEl.setAttribute('font-style', 'italic');
    }
    if (isBold) {
      textEl.setAttribute(
        'font-weight',
        Number.isNaN(weightNum) ? 'bold' : String(Math.max(600, weightNum))
      );
    }
    textEl.textContent = mapSpecialMathChars(content, styleEl);
    outG.appendChild(textEl);
  };

  for (const lineContainer of lineContainers) {
    const hasKatex = Boolean(lineContainer.querySelector('.katex'));

    // Case A: Pure plain-text line (no .katex math inside).
    // Export as a single centered <text> with <tspan> children for bold/italic runs!
    if (!hasKatex) {
      const range = document.createRange();
      range.selectNodeContents(lineContainer);
      const lineBox = screenRectToLocalBox(
        range.getBoundingClientRect(),
        invMatrix
      );
      if (!lineBox) continue;

      const cs = window.getComputedStyle(lineContainer);
      const fontSize = (parseFloat(cs.fontSize || '11') || 11) * scaleFactor;
      const baselineY = lineBox.minY + lineBox.height * 0.78;

      const textEl = doc.createElementNS(SVG_NS, 'text');
      textEl.setAttribute('x', round2(lineBox.cx));
      textEl.setAttribute('y', round2(baselineY));
      textEl.setAttribute('text-anchor', 'middle');
      textEl.setAttribute('fill', cs.color || '#0F172A');
      textEl.setAttribute('font-size', round2(fontSize));
      textEl.setAttribute(
        'font-family',
        cs.fontFamily || '"Times New Roman", serif'
      );
      const baseWeight = parseInt(cs.fontWeight || '400', 10);
      if (baseWeight >= 600 || cs.fontWeight === 'bold') {
        textEl.setAttribute('font-weight', cs.fontWeight);
      }
      if (cs.fontStyle === 'italic') {
        textEl.setAttribute('font-style', 'italic');
      }

      const walker = document.createTreeWalker(
        lineContainer,
        NodeFilter.SHOW_TEXT
      );
      let node: Node | null;
      let hasAnyText = false;
      while ((node = walker.nextNode())) {
        const raw = node.nodeValue || '';
        if (!raw) continue;
        hasAnyText = true;
        const parentEl = node.parentElement || lineContainer;
        const pcs = window.getComputedStyle(parentEl);
        const tspan = doc.createElementNS(SVG_NS, 'tspan');
        const pw = parseInt(pcs.fontWeight || '400', 10);
        if (pw >= 600 || pcs.fontWeight === 'bold') {
          tspan.setAttribute('font-weight', 'bold');
        }
        if (pcs.fontStyle === 'italic') {
          tspan.setAttribute('font-style', 'italic');
        }
        if (pcs.color && pcs.color !== cs.color) {
          tspan.setAttribute('fill', pcs.color);
        }
        tspan.textContent = raw;
        textEl.appendChild(tspan);
      }

      if (hasAnyText) {
        outG.appendChild(textEl);
      }
      continue;
    }

    // Case B: Line contains .katex math (either standalone math or mixed text + math).
    // Walk text nodes inside lineContainer, grouping multi-char math words (.mord.text, multi-char .mop)
    // and anchoring plain text outside .katex cleanly against adjacent math.
    const processedGroupedElements = new Set<Element>();
    const katexElements = Array.from(lineContainer.querySelectorAll('.katex'));
    const firstKatexRect = katexElements[0]?.getBoundingClientRect();
    const lastKatexRect =
      katexElements[katexElements.length - 1]?.getBoundingClientRect();

    const walker = document.createTreeWalker(
      lineContainer,
      NodeFilter.SHOW_TEXT
    );
    let tNode: Node | null;
    while ((tNode = walker.nextNode())) {
      const parentEl = tNode.parentElement;
      if (!parentEl) continue;

      // Skip hidden accessibility MathML, strut spacers, accent bodies, and vector-drawn delimiters
      if (
        parentEl.closest('.katex-mathml') ||
        parentEl.closest('.vlist-s') ||
        parentEl.closest('.accent-body') ||
        parentEl.closest('.delimsizing') ||
        parentEl.closest('.delimcenter') ||
        parentEl.closest('svg')
      ) {
        continue;
      }

      const rawVal = tNode.nodeValue || '';
      if (!rawVal || rawVal.replace(/[\s\u200B\u00A0]+/g, '') === '') {
        continue;
      }

      const inKatex = Boolean(parentEl.closest('.katex'));

      if (inKatex) {
        // Check if this text node belongs to a multi-character upright word (.mord.text)
        // or a multi-letter math operator (.mop like log, sin, cos, exp, max, min, lim)
        const wordGroupEl =
          parentEl.closest('.mord.text') ||
          (parentEl.closest('.mop') &&
          !parentEl.closest('.mop')?.querySelector('.vlist') &&
          (parentEl.closest('.mop')?.textContent || '').trim().length > 1
            ? parentEl.closest('.mop')
            : null);

        if (wordGroupEl) {
          if (processedGroupedElements.has(wordGroupEl)) continue;
          processedGroupedElements.add(wordGroupEl);
          const groupText = (wordGroupEl.textContent || '').trim();
          if (!groupText) continue;
          const box = screenRectToLocalBox(
            wordGroupEl.getBoundingClientRect(),
            invMatrix
          );
          if (!box) continue;
          const baselineY = box.minY + box.height * 0.79;
          emitStyledTextElement(
            groupText,
            box.cx,
            baselineY,
            'middle',
            wordGroupEl
          );
          continue;
        }

        // Single math token / symbol (variable, subscript, superscript, operator, number)
        const range = document.createRange();
        range.selectNodeContents(tNode);
        const box = screenRectToLocalBox(
          range.getBoundingClientRect(),
          invMatrix
        );
        if (!box) continue;
        const baselineY = box.minY + box.height * 0.79;
        emitStyledTextElement(
          rawVal.trim(),
          box.cx,
          baselineY,
          'middle',
          parentEl
        );
      } else {
        // Plain text outside .katex on a mixed text+math line (e.g. "1. Patchify (" or "(a) Loss ")
        const leadSpaces = rawVal.length - rawVal.trimStart().length;
        const trimmedRightLen = rawVal.trimEnd().length;
        if (trimmedRightLen <= leadSpaces) continue;

        const range = document.createRange();
        range.setStart(tNode, leadSpaces);
        range.setEnd(tNode, trimmedRightLen);
        const screenRect = range.getBoundingClientRect();
        const box = screenRectToLocalBox(screenRect, invMatrix);
        if (!box) continue;

        const baselineY = box.minY + box.height * 0.78;
        const trimmedText = rawVal.slice(leadSpaces, trimmedRightLen);

        // If this text precedes a .katex formula, right-align at box.maxX so it never collides with math
        if (
          firstKatexRect &&
          screenRect.right <= firstKatexRect.left + 4
        ) {
          emitStyledTextElement(
            trimmedText,
            box.maxX,
            baselineY,
            'end',
            parentEl
          );
        } else if (
          lastKatexRect &&
          screenRect.left >= lastKatexRect.right - 4
        ) {
          // If this text follows a .katex formula, left-align at box.minX
          emitStyledTextElement(
            trimmedText,
            box.minX,
            baselineY,
            'start',
            parentEl
          );
        } else {
          emitStyledTextElement(
            trimmedText,
            box.cx,
            baselineY,
            'middle',
            parentEl
          );
        }
      }
    }
  }

  return outG;
}

/**
 * Computes a tight bounding box (in scene-root coordinates) around all visible figure elements.
 * Combines live DOM measurement (when available) with SVG attribute inspection fallback.
 */
function computeSceneTightBounds(
  liveSceneRoot: SVGGElement | null,
  clonedSceneRoot: SVGGElement
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const includeRect = (x1: number, y1: number, x2: number, y2: number) => {
    if (
      !Number.isFinite(x1) ||
      !Number.isFinite(y1) ||
      !Number.isFinite(x2) ||
      !Number.isFinite(y2)
    ) {
      return;
    }
    minX = Math.min(minX, x1, x2);
    minY = Math.min(minY, y1, y2);
    maxX = Math.max(maxX, x1, x2);
    maxY = Math.max(maxY, y1, y2);
  };

  // 1. Live DOM bounding box measurement in scene-root coordinates
  if (
    liveSceneRoot &&
    typeof liveSceneRoot.getScreenCTM === 'function'
  ) {
    const sceneCtm = liveSceneRoot.getScreenCTM();
    if (sceneCtm) {
      try {
        const invScene = sceneCtm.inverse();
        const measureEl = (el: Element) => {
          if (el.getAttribute('data-export-ignore') === 'true') return;
          if (el.tagName.toLowerCase() === 'title') return;
          const tag = el.tagName.toLowerCase();
          if (
            tag === 'rect' ||
            tag === 'path' ||
            tag === 'circle' ||
            tag === 'ellipse' ||
            tag === 'polygon' ||
            tag === 'line' ||
            tag === 'text' ||
            tag === 'foreignobject'
          ) {
            const fill = el.getAttribute('fill');
            const stroke = el.getAttribute('stroke');
            if (
              tag !== 'text' &&
              tag !== 'foreignobject' &&
              isTransparentColor(fill) &&
              isTransparentColor(stroke)
            ) {
              return;
            }
            const r = el.getBoundingClientRect();
            const box = screenRectToLocalBox(r, invScene);
            if (box && (box.width > 0.1 || box.height > 0.1)) {
              includeRect(box.minX, box.minY, box.maxX, box.maxY);
            }
          }
          Array.from(el.children).forEach(measureEl);
        };
        Array.from(liveSceneRoot.children).forEach(measureEl);
      } catch {
        // Fall through to attribute-based bounds
      }
    }
  }

  // 2. Attribute-based inspection on clonedSceneRoot (handles detached SVGs / tests & ensures nothing is missed)
  const walkAttributes = (el: Element, tx: number, ty: number) => {
    const transform = el.getAttribute('transform') || '';
    const trMatch = transform.match(
      /translate\(\s*([-\d.]+)(?:[\s,]+([-\d.]+))?\s*\)/
    );
    const curTx = tx + (trMatch ? parseFloat(trMatch[1]) || 0 : 0);
    const curTy = ty + (trMatch ? parseFloat(trMatch[2]) || 0 : 0);

    const tag = el.tagName.toLowerCase();
    const fill = el.getAttribute('fill');
    const stroke = el.getAttribute('stroke');
    const isVisibleShape =
      !isTransparentColor(fill) || !isTransparentColor(stroke);

    if (tag === 'rect' && isVisibleShape) {
      const x = parseFloat(el.getAttribute('x') || '0');
      const y = parseFloat(el.getAttribute('y') || '0');
      const w = parseFloat(el.getAttribute('width') || '0');
      const h = parseFloat(el.getAttribute('height') || '0');
      if (w > 0 && h > 0 && w < 5000 && h < 5000) {
        includeRect(curTx + x, curTy + y, curTx + x + w, curTy + y + h);
      }
    } else if (tag === 'circle' && isVisibleShape) {
      const cx = parseFloat(el.getAttribute('cx') || '0');
      const cy = parseFloat(el.getAttribute('cy') || '0');
      const r = parseFloat(el.getAttribute('r') || '0');
      if (r > 0) {
        includeRect(curTx + cx - r, curTy + cy - r, curTx + cx + r, curTy + cy + r);
      }
    } else if (tag === 'ellipse' && isVisibleShape) {
      const cx = parseFloat(el.getAttribute('cx') || '0');
      const cy = parseFloat(el.getAttribute('cy') || '0');
      const rx = parseFloat(el.getAttribute('rx') || '0');
      const ry = parseFloat(el.getAttribute('ry') || '0');
      if (rx > 0 && ry > 0) {
        includeRect(
          curTx + cx - rx,
          curTy + cy - ry,
          curTx + cx + rx,
          curTy + cy + ry
        );
      }
    } else if (tag === 'line' && isVisibleShape) {
      const x1 = parseFloat(el.getAttribute('x1') || '0');
      const y1 = parseFloat(el.getAttribute('y1') || '0');
      const x2 = parseFloat(el.getAttribute('x2') || '0');
      const y2 = parseFloat(el.getAttribute('y2') || '0');
      includeRect(curTx + x1, curTy + y1, curTx + x2, curTy + y2);
    } else if (tag === 'path' && isVisibleShape && !el.closest('defs')) {
      const d = el.getAttribute('d') || '';
      const coordRegex = /[MLCQTS]\s*([-\d.]+)[\s,]+([-\d.]+)/gi;
      let m: RegExpExecArray | null;
      while ((m = coordRegex.exec(d)) !== null) {
        const px = parseFloat(m[1]);
        const py = parseFloat(m[2]);
        if (Math.abs(px) < 5000 && Math.abs(py) < 5000) {
          includeRect(curTx + px, curTy + py, curTx + px, curTy + py);
        }
      }
    } else if (tag === 'text') {
      const x = parseFloat(el.getAttribute('x') || '0');
      const y = parseFloat(el.getAttribute('y') || '0');
      const fs = parseFloat(el.getAttribute('font-size') || '11') || 11;
      const len = (el.textContent || '').length;
      const approxHalfW = Math.max(12, len * fs * 0.32);
      includeRect(
        curTx + x - approxHalfW,
        curTy + y - fs,
        curTx + x + approxHalfW,
        curTy + y + fs * 0.35
      );
    }

    Array.from(el.children).forEach((child) =>
      walkAttributes(child, curTx, curTy)
    );
  };

  walkAttributes(clonedSceneRoot, 0, 0);

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { minX: 0, minY: -400, maxX: 600, maxY: 0 };
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Exports a publication-clean, tightly cropped, transparent-background SVG 1.1 string
 * from the interactive canvas SVG element:
 * - Removes all canvas background rects, grid patterns, origin crosshairs, resize handles,
 *   connection port circles, hover boxes, and selection frames (`[data-export-ignore="true"]`).
 * - Restores original TikZ stroke colors, widths, and arrow markers on any currently selected elements.
 * - Converts all `<foreignObject>` + KaTeX labels into pure vector SVG `<g>`/`<text>`/`<line>`/`<path>` elements.
 * - Crops `viewBox`, `width`, and `height` tightly around the figure with a 16px margin.
 */
export function exportCleanCanvasSvg(svgEl: SVGSVGElement): string {
  const clonedSvg = svgEl.cloneNode(true) as SVGSVGElement;
  const doc = clonedSvg.ownerDocument || document;

  // 1. Convert every <foreignObject> in clonedSvg using live DOM geometry from svgEl
  const liveFos = Array.from(svgEl.querySelectorAll('foreignObject'));
  const clonedFos = Array.from(clonedSvg.querySelectorAll('foreignObject'));

  for (let i = 0; i < clonedFos.length; i++) {
    const clonedFo = clonedFos[i];
    const liveFo = liveFos[i];
    if (liveFo && clonedFo.parentNode) {
      const vectorGroup = convertForeignObjectToNativeSvg(liveFo, doc);
      clonedFo.parentNode.replaceChild(vectorGroup, clonedFo);
    } else {
      clonedFo.remove();
    }
  }

  // 2. Remove all interactive UI / grid / background / handle elements marked with data-export-ignore="true"
  clonedSvg
    .querySelectorAll('[data-export-ignore="true"], title')
    .forEach((el) => el.remove());

  // 3. Restore original TikZ stroke/marker attributes on any selected nodes or edges
  clonedSvg.querySelectorAll('[data-orig-stroke]').forEach((el) => {
    const origStroke = el.getAttribute('data-orig-stroke');
    if (origStroke) {
      el.setAttribute('stroke', origStroke);
    }
    el.removeAttribute('data-orig-stroke');
  });

  clonedSvg.querySelectorAll('[data-orig-stroke-width]').forEach((el) => {
    const origWidth = el.getAttribute('data-orig-stroke-width');
    if (origWidth) {
      el.setAttribute('stroke-width', origWidth);
    }
    el.removeAttribute('data-orig-stroke-width');
  });

  clonedSvg.querySelectorAll('[data-orig-marker-end]').forEach((el) => {
    const origMarker = el.getAttribute('data-orig-marker-end');
    if (origMarker) {
      el.setAttribute('marker-end', origMarker);
    } else {
      el.removeAttribute('marker-end');
    }
    el.removeAttribute('data-orig-marker-end');
  });

  // 4. Normalize CSS 'transparent' fill/stroke to valid SVG 1.1 'none' and strip interactive classes
  clonedSvg.querySelectorAll('*').forEach((el) => {
    if (el.getAttribute('fill') === 'transparent') {
      el.setAttribute('fill', 'none');
    }
    if (el.getAttribute('stroke') === 'transparent') {
      el.setAttribute('stroke', 'none');
    }
    const cls = el.getAttribute('class');
    if (cls && cls !== 'agentikz-vector-label') {
      el.removeAttribute('class');
    }
  });

  // 5. Reset pan/zoom transform on #agentikz-scene-root and compute tight figure viewBox
  const liveSceneRoot = svgEl.querySelector(
    '#agentikz-scene-root'
  ) as SVGGElement | null;
  const clonedSceneRoot = clonedSvg.querySelector(
    '#agentikz-scene-root'
  ) as SVGGElement | null;

  if (clonedSceneRoot) {
    clonedSceneRoot.removeAttribute('transform');
    // Unwrap parent pan <g transform="translate(pan.x, pan.y)"> if present
    const parentG = clonedSceneRoot.parentElement;
    if (
      parentG &&
      parentG.tagName.toLowerCase() === 'g' &&
      parentG !== (clonedSvg as unknown as Element)
    ) {
      parentG.removeAttribute('transform');
    }

    const bounds = computeSceneTightBounds(liveSceneRoot, clonedSceneRoot);
    const pad = 16;
    const vbX = Math.floor(bounds.minX - pad);
    const vbY = Math.floor(bounds.minY - pad);
    const vbW = Math.max(60, Math.ceil(bounds.maxX - bounds.minX + pad * 2));
    const vbH = Math.max(40, Math.ceil(bounds.maxY - bounds.minY + pad * 2));

    clonedSvg.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
    clonedSvg.setAttribute('width', String(vbW));
    clonedSvg.setAttribute('height', String(vbH));
  }

  clonedSvg.removeAttribute('class');
  clonedSvg.removeAttribute('style');
  clonedSvg.setAttribute('xmlns', SVG_NS);

  const rawXml = new XMLSerializer().serializeToString(clonedSvg);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${rawXml}`;
}

/**
 * Renders the clean, transparent-background SVG onto a high-DPI offscreen <canvas>
 * and returns a PNG Blob (default 3x scale for 300+ DPI publication figures).
 */
export async function exportCleanCanvasPng(
  svgEl: SVGSVGElement,
  scale = 3
): Promise<Blob> {
  const cleanSvgString = exportCleanCanvasSvg(svgEl);
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(cleanSvgString, 'image/svg+xml');
  const root = svgDoc.documentElement;
  const width = Math.max(100, parseFloat(root.getAttribute('width') || '800'));
  const height = Math.max(80, parseFloat(root.getAttribute('height') || '500'));

  const svgBlob = new Blob([cleanSvgString], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = (err) => reject(err);
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create 2D canvas context for PNG export.');
    }

    // Keep background 100% transparent (clearRect)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas PNG serialization returned null.'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
