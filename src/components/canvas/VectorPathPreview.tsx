import React from 'react';
import { VectorPreviewScene } from '../../core/tex/vector-preview';
import { LatexLabel } from './LatexLabel';

export function VectorPathPreview({ scene }: { scene: VectorPreviewScene }) {
  return (
    <svg
      id="agentikz-vector-preview-svg"
      xmlns="http://www.w3.org/2000/svg"
      viewBox={scene.viewBox.join(' ')}
      width={scene.viewBox[2]}
      height={scene.viewBox[3]}
      className="max-w-full max-h-full w-auto h-auto m-auto"
      style={{ fontFamily: scene.fontFamily }}
    >
      <defs>
        <marker id="vector-preview-arrow" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
          <path d="M 0 0 L 10 5 L 0 10 Z" fill="#000" />
        </marker>
        {scene.clips.map((clip) => <clipPath key={clip.id} id={clip.id}><path d={clip.d} /></clipPath>)}
      </defs>
      {scene.elements.map((el, index) => {
        const content = el.kind === 'path' ? (
          <path d={el.d} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} strokeDasharray={el.dash}
            strokeLinejoin="round" strokeLinecap="round" markerEnd={el.arrow ? 'url(#vector-preview-arrow)' : undefined} />
        ) : (
          <g transform={`translate(${el.x} ${el.y}) rotate(${el.rotate})`}>
            <foreignObject x={-400} y={-el.fontSize * el.lines.length * 0.65} width={800} height={el.fontSize * el.lines.length * 1.3}>
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontWeight: el.bold ? 700 : 400 }}>
                {el.lines.map((line, i) => (
                  <LatexLabel key={i} text={el.bold ? `\\textbf{${line}}` : line} fontSize={el.fontSize} color="#000000" />
                ))}
              </div>
            </foreignObject>
          </g>
        );
        return <g key={index}>{el.clips.reduceRight<React.ReactNode>(
          (child, id) => <g clipPath={`url(#${id})`}>{child}</g>, content
        )}</g>;
      })}
    </svg>
  );
}
