import React from 'react';
import type { CoordinateLabel, CoordinatePath } from '../../core/parser/path-geometry';
import { LatexLabel } from './LatexLabel';

/** Additional primitives inside the existing scene, with no camera, tools or state. */
export function CanvasGeometry({ geometry, id }: { geometry: CoordinatePath | CoordinateLabel; id: string }) {
  const content = geometry.kind === 'path' ? (
    <>
      {(geometry.arrow || geometry.arrowStart) && <defs>
        <marker id={`canvas-arrow-${id}`} viewBox="0 0 10 10" refX="9.5" refY="5"
          markerWidth={geometry.arrowSize?.[0] || 7} markerHeight={geometry.arrowSize?.[1] || 7}
          orient="auto-start-reverse" markerUnits="userSpaceOnUse">
          <path d="M0 0L10 5L0 10Z" fill={geometry.stroke} />
        </marker>
      </defs>}
      {geometry.preaction && <path d={geometry.renderD || geometry.d} fill="none" stroke={geometry.preaction.stroke}
        strokeWidth={geometry.preaction.strokeWidth} strokeLinecap={geometry.lineCap} strokeLinejoin={geometry.lineJoin} pointerEvents="none" />}
      <path d={geometry.renderD || geometry.d} fill={geometry.fill} stroke={geometry.stroke} strokeWidth={geometry.strokeWidth} opacity={geometry.opacity}
        strokeDasharray={geometry.dash} strokeLinecap={geometry.lineCap} strokeLinejoin={geometry.lineJoin}
        markerEnd={geometry.arrow ? `url(#canvas-arrow-${id})` : undefined}
        markerStart={geometry.arrowStart ? `url(#canvas-arrow-${id})` : undefined}
        pointerEvents={geometry.fill === 'none' ? 'stroke' : 'all'} />
    </>
  ) : (
    <g transform={`translate(${geometry.x} ${geometry.y}) rotate(${geometry.rotate})`}>
      {geometry.shape && (geometry.shape.kind === 'rectangle'
        ? <rect x={geometry.box[0]} y={geometry.box[1]} width={geometry.box[2]} height={geometry.box[3]}
            rx={geometry.shape.radius} fill={geometry.shape.fill} stroke={geometry.shape.stroke}
            strokeWidth={geometry.shape.strokeWidth} strokeDasharray={geometry.shape.dash} />
        : <ellipse cx={geometry.box[0] + geometry.box[2] / 2} cy={geometry.box[1] + geometry.box[3] / 2}
            rx={geometry.box[2] / 2} ry={geometry.box[3] / 2} fill={geometry.shape.fill} stroke={geometry.shape.stroke}
            strokeWidth={geometry.shape.strokeWidth} strokeDasharray={geometry.shape.dash} />)}
      <rect x={geometry.box[0]} y={geometry.box[1]} width={geometry.box[2]} height={geometry.box[3]} fill="transparent" />
      <foreignObject x={geometry.box[0]} y={geometry.box[1]} width={geometry.box[2]} height={geometry.box[3]} pointerEvents="none">
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', fontFamily: geometry.fontFamily,
          alignItems: geometry.align === 'left' ? 'flex-start' : geometry.align === 'right' ? 'flex-end' : 'center', justifyContent: 'center' }}>
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
