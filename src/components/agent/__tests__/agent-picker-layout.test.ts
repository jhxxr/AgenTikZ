import { describe, expect, it } from 'vitest';
import { getAgentPickerPopupPosition } from '../agent-ui';

describe('Agent picker popup layout', () => {
  it('keeps a wide popup inside the viewport next to its trigger', () => {
    const position = getAgentPickerPopupPosition({ left: 260, top: 720 }, 520, 529, 900);
    expect(position).toEqual({ left: 209, top: 192, width: 312, maxHeight: 544 });
    expect(Number(position.left) + Number(position.width)).toBeLessThanOrEqual(521);
  });

  it('shrinks the popup and caps its height on a narrow viewport', () => {
    const position = getAgentPickerPopupPosition({ left: 180, top: 280 }, 600, 360, 400);
    expect(position).toEqual({ left: 40, top: 8, width: 312, maxHeight: 280 });
    expect(Number(position.left) + Number(position.width)).toBeLessThanOrEqual(352);
  });
});
