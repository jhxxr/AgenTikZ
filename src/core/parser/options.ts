/** Split TikZ options at top-level commas, retaining nested values. */
export function parseTikzOptionString(optStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  let depth = 0;
  let current = '';

  const commit = (token: string) => {
    const trimmed = token.trim();
    if (!trimmed) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      result[trimmed] = 'true';
    } else {
      const k = trimmed.slice(0, eqIdx).trim();
      let v = trimmed.slice(eqIdx + 1).trim();
      if (v.startsWith('{') && v.endsWith('}')) {
        v = v.slice(1, -1).trim();
      }
      result[k] = v;
    }
  };

  for (let i = 0; i < optStr.length; i++) {
    const ch = optStr[i];
    if (ch === '{' || ch === '(') depth++;
    else if (ch === '}' || ch === ')') depth = Math.max(0, depth - 1);

    if (ch === ',' && depth === 0) {
      commit(current);
      current = '';
    } else {
      current += ch;
    }
  }
  commit(current);
  return result;
}

export function formatTikzOptions(options: Record<string, string>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(options)) {
    if (v === undefined || v === '') continue;
    if (v === 'true') {
      parts.push(k);
    } else if (
      k === 'channels' ||
      k === 'sublabel' ||
      v.includes(',') ||
      v.includes('\\')
    ) {
      parts.push(`${k}={${v}}`);
    } else if (v.includes(' ')) {
      if (
        k === 'minimum width' ||
        k === 'minimum height' ||
        k === 'minimum size' ||
        k === 'rounded corners' ||
        k === 'line width' ||
        k === 'inner sep' ||
        k === 'text width' ||
        k === 'align'
      ) {
        parts.push(`${k}=${v}`);
      } else {
        parts.push(`${k}={${v}}`);
      }
    } else {
      parts.push(`${k}=${v}`);
    }
  }
  return parts.join(', ');
}
