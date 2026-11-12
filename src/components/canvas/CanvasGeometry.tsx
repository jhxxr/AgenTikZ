import React from 'react';
import type { CoordinateLabel, CoordinatePath } from '../../core/parser/path-geometry';
import { LatexLabel } from './LatexLabel';

/** Additional primitives inside the existing scene, with no camera, tools or state. */
export function CanvasGeometry({ geometry, id }: { geometry: CoordinatePath | CoordinateLabel; id: string }) {
  const content = geometry.kind === 'path' ? (
    <>
      {geometry.arrow && <defs>
        <marker id={`canvas-arrow-${id}`} viewBox="0 0 10 10" refX="9.5" refY="5"
          markerWidth={geometry.arrowSize?.[0] || 7} markerHeight={geometry.arrowSize?.[1] || 7}
          orient="auto-start-reverse" markerUnits="userSpaceOnUse">
          <path d="M0 0L10 5L0 10Z" fill={geometry.stroke} />
        </marker>
      </defs>}
      <path d={geometry.d} fill={geometry.fill} stroke={geometry.stroke} strokeWidth={geometry.strokeWidth}
        strokeDasharray={geometry.dash} strokeLinecap={geometry.lineCap} strokeLinejoin={geometry.lineJoin}
        markerEnd={geometry.arrow ? `url(#canvas-arrow-${id})` : undefined}
        pointerEvents={geometry.fill === 'none' ? 'stroke' : 'all'} />
    </>
  ) : (
    <g transform={`translate(${geometry.x} ${geometry.y}) rotate(${geometry.rotate})`}>
      <rect x={geometry.box[0]} y={geometry.box[1]} width={geometry.box[2]} height={geometry.box[3]} fill="transparent" />
      <foreignObject x={geometry.box[0]} y={geometry.box[1]} width={geometry.box[2]} height={geometry.box[3]} pointerEvents="none">
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {geometry.lines.map((line, index) => <LatexLabel key={index}
            text={geometry.bold ? `\\textbf{${line}}` : line} fontSize={geometry.fontSize} color={geometry.color} />)}
        </div>
      </foreignObject>
    </g>
  );
  return <>{geometry.clips.reduceRight<React.ReactNode>(
    (child, clip) => <g clipPath={`url(#canvas-${clip})`}>{child}</g>, content
  )}</>;
}
