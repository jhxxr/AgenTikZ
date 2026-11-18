import { parseTikzOptionEntries } from './options';

export type TikzOptions = Record<string, string>;
export type TikzOptionEntries = ReadonlyArray<readonly [string, string]>;
export type TikzStyles = Record<string, TikzOptionEntries>;
const widths: Record<string, string> = {
  'ultra thin': '0.1pt', 'very thin': '0.2pt', thin: '0.4pt', semithick: '0.6pt',
  thick: '0.8pt', 'very thick': '1.2pt', 'ultra thick': '1.6pt',
};

/** Apply declarations in source order; .style replaces and .append style extends. */
export function applyStyleDefinitions(options: TikzOptionEntries, styles: TikzStyles): TikzOptionEntries {
  const values: Array<readonly [string, string]> = [];
  for (const [key, value] of options) {
    const match = /^(.*?)\/\s*\.(style|append style)$/.exec(key);
    if (match) {
      const name = match[1].trim();
      styles[name] = [...(match[2] === 'append style' && Object.hasOwn(styles, name) ? styles[name] : []), ...parseTikzOptionEntries(value)];
    } else values.push([key, value]);
  }
  return values;
}

/** Resolve recursively at the point of use, respecting option order and cycles. */
export function resolveTikzStyles(raw: TikzOptionEntries, styles: TikzStyles): TikzOptions {
  const result: TikzOptions = Object.create(null);
  const stack = new Set<string>();
  let remaining = 20000;
  const visit = (entries: TikzOptionEntries) => {
    for (const [key, value] of entries) {
      if (--remaining < 0) throw new Error('Style expansion limit');
      if (value === 'true' && Object.hasOwn(styles, key)) {
        if (stack.has(key) || stack.size >= 32) throw new Error(`Style cycle: ${[...stack, key].join(' -> ')}`);
        stack.add(key);
        visit(styles[key]);
        stack.delete(key);
      } else if (value === 'true' && Object.hasOwn(widths, key)) result['line width'] = widths[key];
      else if (key === 'rounded corners' && value === 'true') result[key] = '4pt';
      else if (key === 'sharp corners' && value === 'true') result['rounded corners'] = '0pt';
      else {
        delete result[key];
        result[key] = value;
      }
    }
  };
  visit(raw);
  return result;
}
