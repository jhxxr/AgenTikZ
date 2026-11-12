import { describe, expect, it } from 'vitest';
import fixture from '../../tex/__tests__/fixtures/complex-cjk-diagram.tex?raw';
import macroFixture from '../../tex/__tests__/fixtures/swsa-nested.tex?raw';
import { parseCoordinateGeometry } from '../path-geometry';
import { patchGeometryElements } from '../path-patcher';
import { buildStandaloneLatexDocument } from '../../tex/document';

const sceneFor = (source = fixture) => {
  const scene = parseCoordinateGeometry(source, (error) => { throw error; });
  expect(scene).not.toBeNull();
  return scene!;
};

describe('coordinate path editing with source spans', () => {
  it('makes every direct path and label in a detailed diagram editable, in physical units', () => {
    const scene = sceneFor();
    expect(scene.elements).toHaveLength(12);
    expect(scene.elements.every((el) => el.source)).toBe(true);
    expect(scene.coordinateScale).toEqual([1.3, 1.3]);
    const title = scene.elements.find((el) => el.kind === 'label' && el.lines.includes('中文标题 A'))!;
    expect(title).toMatchObject({ kind: 'label', x: 20.8, y: 26, anchor: 'west' });
    expect(fixture.slice(title.source!.labelSpan!.start, title.source!.labelSpan!.end)).toBe('中文标题 A');
    expect(title).toMatchObject({ fontSize: 7 * 52 / 28.45274 });
  });

  it('moves a rectangle by changing its coordinates, preserving the body and every other element', () => {
    const scene = sceneFor();
    const next = patchGeometryElements(fixture, scene, [0], { dx: 13, dy: 26 });
    expect(next).toBe(fixture.replace('(8,8) rectangle (150,150)', '(18,28) rectangle (160,170)'));
    const after = sceneFor(next);
    expect(after.elements[0].bounds[0]).toBeCloseTo(scene.elements[0].bounds[0] + 13);
    expect(after.elements[0].bounds[1]).toBeCloseTo(scene.elements[0].bounds[1] + 26);
  });

  it.each(['\n', '\r\n'])('moves all Bezier endpoints and control points by the same physical delta with %j line endings', (lineEnding) => {
    const source = fixture.replace(/\r?\n/g, lineEnding);
    const scene = sceneFor(source);
    const index = scene.elements.findIndex((el) => el.kind === 'path' && el.d.includes(' C '));
    const before = scene.elements[index].source!;
    const next = patchGeometryElements(source, scene, [index], { dx: 13, dy: -13 });
    const after = sceneFor(next).elements[index].source!;
    expect(after.coordinates).toHaveLength(7);
    for (let i = 0; i < before.coordinates.length; i++) {
      expect(after.coordinates[i].x.value).toBeCloseTo(before.coordinates[i].x.value + 10);
      expect(after.coordinates[i].y.value).toBeCloseTo(before.coordinates[i].y.value - 10);
    }
    expect(next).toContain(`\\begin{scope}${lineEnding}  \\clip`);
    expect(next.slice(0, after.span.start)).toBe(source.slice(0, before.span.start));
    expect(next.slice(after.span.end)).toBe(source.slice(before.span.end));
  });

  it('edits a control point without modifying the other coordinates', () => {
    const scene = sceneFor();
    const index = scene.elements.findIndex((el) => el.kind === 'path' && el.d.includes(' C '));
    const next = patchGeometryElements(fixture, scene, [index], { point: { index: 1, x: 65, y: 52 } });
    expect(next).toBe(fixture.replace('controls (40,30)', 'controls (50,40)'));
  });

  it('changes colored rotated text through its exact label span and retains its formatting options', () => {
    const scene = sceneFor();
    const index = scene.elements.findIndex((el) => el.kind === 'label' && el.lines.includes('旋转标签'));
    const next = patchGeometryElements(fixture, scene, [index], { label: '中文与 $x^2$' });
    expect(next).toBe(fixture.replace('{旋转标签}', '{中文与 $x^2$}'));
    expect(sceneFor(next).elements[index]).toMatchObject({ rotate: -90, color: '#2B5B84' });
    expect(buildStandaloneLatexDocument(next, 'neurips')).toContain('{中文与 $x^2$}');
  });

  it('patches one style field while retaining original whitespace, dashes and unrelated options', () => {
    const scene = sceneFor();
    const next = patchGeometryElements(fixture, scene, [0], { options: { fill: '{rgb,255:red,255;green,0;blue,0}' } });
    expect(next).toBe(fixture.replace('fill=tint,draw=accent,rounded corners=5pt', 'fill={rgb,255:red,255;green,0;blue,0},draw=accent,rounded corners=5pt'));
    expect(sceneFor(next).elements[0]).toMatchObject({ fill: '#ff0000' });
  });

  it('can append multiple options to an existing or absent option list', () => {
    for (const source of [
      String.raw`\begin{tikzpicture}\fill (0,0) rectangle (1,1);\end{tikzpicture}`,
      String.raw`\begin{tikzpicture}\fill[blue] (0,0) rectangle (1,1);\end{tikzpicture}`,
    ]) {
      const scene = sceneFor(source);
      const next = patchGeometryElements(source, scene, [0], { options: { fill: 'red', draw: 'black' } });
      expect(sceneFor(next).elements[0]).toMatchObject({ fill: '#FF0000', stroke: '#000000' });
    }
  });

  it('scales rectangle coordinates and circle radii without scaling line widths', () => {
    const scene = sceneFor();
    const next = patchGeometryElements(fixture, scene, [0], { scale: { x: 2, y: 1, originX: 10.4, originY: 10.4 } });
    expect(next).toBe(fixture.replace('(8,8) rectangle (150,150)', '(8,8) rectangle (292,150)'));
    const circle = scene.elements.findIndex((el) => el.kind === 'path' && el.radius);
    const enlarged = patchGeometryElements(fixture, scene, [circle], { scale: { x: 2, y: 2, originX: 265 * 1.3, originY: 60 * 1.3 } });
    expect(enlarged).toContain('(265,60) circle (48);');
    expect(() => patchGeometryElements(fixture, scene, [circle], { scale: { x: 2, y: 1, originX: 0, originY: 0 } })).toThrow('等比例');
  });

  it('preserves explicit coordinate units and applies physical y direction independently of y basis', () => {
    const source = String.raw`\begin{tikzpicture}[x=0.25mm,y=-0.25mm]\draw (1cm,2mm) -- (3cm,4pt);\end{tikzpicture}`;
    const scene = sceneFor(source);
    const next = patchGeometryElements(source, scene, [0], { dx: 52, dy: 52 });
    const after = sceneFor(next).elements[0].source!;
    expect(after.coordinates[0].x.unit).toBe('cm');
    expect(after.coordinates[0].x.value).toBe(2);
    expect(after.coordinates[0].y.unit).toBe('mm');
    expect(after.coordinates[0].y.value).toBe(-8);
  });

  it('keeps direct statements editable after macro expansion without editing macro definitions', () => {
    const scene = sceneFor(macroFixture);
    const direct = scene.elements.findIndex((el) => el.kind === 'label' && el.source?.labelSpan);
    const node = scene.elements[direct];
    const span = node.source!.labelSpan!;
    const next = patchGeometryElements(macroFixture, scene, [direct], { label: 'Changed direct label' });
    expect(next).toBe(macroFixture.slice(0, span.start) + 'Changed direct label' + macroFixture.slice(span.end));
    const expanded = scene.elements.findIndex((el) => !el.source);
    expect(() => patchGeometryElements(macroFixture, scene, [expanded], { dx: 1 })).toThrow('宏展开');
  });

  it('rejects stale mappings and only deletes explicitly selected statements', () => {
    const scene = sceneFor();
    expect(() => patchGeometryElements(fixture + '\n', scene, [0], { dx: 1 })).toThrow('源码已变化');
    const first = scene.elements[0].source!.span;
    expect(patchGeometryElements(fixture, scene, [0], { remove: true }))
      .toBe(fixture.slice(0, first.start) + fixture.slice(first.end));
    const next = patchGeometryElements(fixture, scene, [0, 1, 1], { dx: 13 });
    expect(sceneFor(next).elements[1].bounds[0]).toBeCloseTo(scene.elements[1].bounds[0] + 13);
  });

});
