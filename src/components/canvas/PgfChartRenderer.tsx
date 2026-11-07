import React, { useState } from 'react';
import { TikzChartElement } from '../../types/tikz-ast';
import { LatexLabel } from './LatexLabel';

export type ChartSubTarget =
  | { kind: 'title'; currentText: string }
  | { kind: 'xlabel'; currentText: string }
  | { kind: 'ylabel'; currentText: string }
  | { kind: 'subcaption'; currentText: string }
  | { kind: 'series_name'; seriesIndex: number; currentText: string };

interface PgfChartRendererProps {
  chart: TikzChartElement;
  cmToPx: number;
  originX: number;
  originY: number;
  zoom: number;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent, chartId: string) => void;
  onMoveLegend: (
    chartId: string,
    legendPos: { x: number; y: number },
    recordUndo?: boolean
  ) => void;
  onUpdateChart: (
    chartId: string,
    updates: Partial<TikzChartElement>,
    recordUndo?: boolean
  ) => void;
  onEditSubTarget: (chartId: string, target: ChartSubTarget) => void;
}

export const PgfChartRenderer: React.FC<PgfChartRendererProps> = ({
  chart,
  cmToPx,
  originX,
  originY,
  zoom,
  selected,
  onPointerDown,
  onMoveLegend,
  onUpdateChart,
  onEditSubTarget,
}) => {
  // Independent drag state for Legend, Legend Scale, Title, XLabel, YLabel, or Resize Handle
  const [subDrag, setSubDrag] = useState<{
    part:
      | 'legend'
      | 'legend_resize'
      | 'title'
      | 'xlabel'
      | 'ylabel'
      | 'resize_e'
      | 'resize_n'
      | 'resize_ne';
    startClientX: number;
    startClientY: number;
    initX: number;
    initY: number;
    initW: number;
    initH: number;
    initScale?: number;
    baseLegW?: number;
    baseLegH?: number;
  } | null>(null);

  const totalW = chart.width * cmToPx;
  const totalH = chart.height * cmToPx;
  const left = originX + chart.x * cmToPx;
  const top = originY - (chart.y + chart.height) * cmToPx;

  const padL = 44;
  const padR = 16;
  const padT = 28;
  const padB = 36;
  const plotW = Math.max(80, totalW - padL - padR);
  const plotH = Math.max(60, totalH - padT - padB);

  const titleOff = chart.titleOffset || { x: 0, y: 0 };
  const xlabelOff = chart.xlabelOffset || { x: 0, y: 0 };
  const ylabelOff = chart.ylabelOffset || { x: 0, y: 0 };

  // Compute Y range across series or boxplots
  let minY = 60;
  let maxY = 92;
  if (
    chart.chartType === 'boxplot' &&
    chart.boxplots &&
    chart.boxplots.length > 0
  ) {
    const lows = chart.boxplots.map((b) => b.lowerWhisker);
    const highs = chart.boxplots.map((b) => b.upperWhisker);
    minY = Math.floor(Math.min(...lows) - 3);
    maxY = Math.ceil(Math.max(...highs) + 3);
  } else if (chart.series.length > 0) {
    const allY: number[] = [];
    chart.series.forEach((s) =>
      s.points.forEach((p) => {
        allY.push(p.y - (p.error || 0));
        allY.push(p.y + (p.error || 0));
      })
    );
    if (allY.length > 0) {
      minY = Math.floor(Math.min(...allY) - 4);
      maxY = Math.ceil(Math.max(...allY) + 4);
    }
  }
  if (chart.chartType === 'bar') {
    minY = Math.max(0, minY - 10);
  }
  const spanY = Math.max(1, maxY - minY);
  const yToPx = (val: number) => padT + plotH - ((val - minY) / spanY) * plotH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) =>
    Math.round(minY + t * spanY)
  );

  const xLabels: string[] =
    chart.chartType === 'boxplot' && chart.boxplots
      ? chart.boxplots.map((b) => b.label)
      : chart.chartType === 'heatmap'
        ? chart.heatmapXLabels || ['K_1', 'K_2', 'K_3', 'K_4']
        : chart.series[0]?.points.map((p) => String(p.x)) || [
            '1',
            '2',
            '3',
            '4',
          ];

  const startPartDrag = (
    e: React.PointerEvent,
    part: NonNullable<typeof subDrag>['part'],
    initX: number,
    initY: number,
    extra?: { initScale?: number; baseLegW?: number; baseLegH?: number }
  ) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSubDrag({
      part,
      startClientX: e.clientX,
      startClientY: e.clientY,
      initX,
      initY,
      initW: chart.width,
      initH: chart.height,
      ...extra,
    });
  };

  const handlePartMove = (e: React.PointerEvent) => {
    if (!subDrag) return;
    e.stopPropagation();
    const dxPx = (e.clientX - subDrag.startClientX) / zoom;
    const dyPx = (e.clientY - subDrag.startClientY) / zoom;

    if (subDrag.part === 'legend') {
      const nextX = Math.max(
        -0.15,
        Math.min(1.08, subDrag.initX + dxPx / plotW)
      );
      const nextY = Math.max(
        0.05,
        Math.min(1.18, subDrag.initY - dyPx / plotH)
      );
      onMoveLegend(chart.id, { x: nextX, y: nextY }, false);
    } else if (subDrag.part === 'legend_resize') {
      const initScale = subDrag.initScale ?? 1.0;
      const baseW = Math.max(48, subDrag.baseLegW ?? 88);
      const baseH = Math.max(24, subDrag.baseLegH ?? 38);
      const deltaScale =
        Math.abs(dxPx) >= Math.abs(dyPx) ? dxPx / baseW : dyPx / baseH;
      const nextScale = Math.max(
        0.5,
        Math.min(2.0, Number((initScale + deltaScale).toFixed(2)))
      );
      onUpdateChart(chart.id, { legendScale: nextScale }, false);
    } else if (subDrag.part === 'title') {
      onUpdateChart(
        chart.id,
        { titleOffset: { x: subDrag.initX + dxPx, y: subDrag.initY + dyPx } },
        false
      );
    } else if (subDrag.part === 'xlabel') {
      onUpdateChart(
        chart.id,
        { xlabelOffset: { x: subDrag.initX + dxPx, y: subDrag.initY + dyPx } },
        false
      );
    } else if (subDrag.part === 'ylabel') {
      onUpdateChart(
        chart.id,
        { ylabelOffset: { x: subDrag.initX + dxPx, y: subDrag.initY + dyPx } },
        false
      );
    } else if (
      subDrag.part === 'resize_e' ||
      subDrag.part === 'resize_n' ||
      subDrag.part === 'resize_ne'
    ) {
      const nextW =
        subDrag.part === 'resize_n'
          ? subDrag.initW
          : Math.max(3.2, Number((subDrag.initW + dxPx / cmToPx).toFixed(2)));
      const nextH =
        subDrag.part === 'resize_e'
          ? subDrag.initH
          : Math.max(2.6, Number((subDrag.initH - dyPx / cmToPx).toFixed(2)));
      onUpdateChart(chart.id, { width: nextW, height: nextH }, false);
    }
  };

  const handlePartUp = (e: React.PointerEvent) => {
    if (!subDrag) return;
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);
    setSubDrag(null);
  };

  return (
    <g
      transform={`translate(${left}, ${top})`}
      onPointerDown={(e) => onPointerDown(e, chart.id)}
      className="cursor-move"
    >
      {/* Selection / Hover Frame for PGFPlots Axis (transparent background) */}
      <rect
        data-export-ignore="true"
        x={-6}
        y={-6}
        width={totalW + 12}
        height={totalH + (chart.subcaption ? 34 : 12)}
        rx={4}
        fill="none"
        stroke={selected ? '#2563EB' : 'none'}
        strokeWidth={selected ? 1.6 : 1}
        strokeDasharray={selected ? '4 2' : undefined}
      />

      {/* Draggable & Double-Click Editable Chart Title */}
      <g
        transform={`translate(${titleOff.x}, ${titleOff.y})`}
        onPointerDown={(e) => {
          if (!selected) return; // Let unselected click move the whole chart first
          startPartDrag(e, 'title', titleOff.x, titleOff.y);
        }}
        onPointerMove={handlePartMove}
        onPointerUp={handlePartUp}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onEditSubTarget(chart.id, {
            kind: 'title',
            currentText: chart.title,
          });
        }}
        className={
          selected
            ? 'cursor-grab active:cursor-grabbing group/title'
            : 'cursor-move group/title'
        }
      >
        <title data-export-ignore="true">拖拽可调整图表标题位置 · 双击直接编辑标题文字</title>
        <rect
          data-export-ignore="true"
          x={padL}
          y={2}
          width={plotW}
          height={22}
          rx={2}
          fill="none"
          className="group-hover/title:stroke-blue-400 group-hover/title:fill-blue-50/30"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
        <foreignObject
          x={padL}
          y={-1}
          width={plotW}
          height={26}
          style={{ overflow: 'visible' }}
        >
          <LatexLabel
            text={chart.title}
            fontSize={11.5}
            className="font-semibold text-slate-800"
          />
        </foreignObject>
      </g>

      {/* Plot Area Background & Grid */}
      <rect
        x={padL}
        y={padT}
        width={plotW}
        height={plotH}
        fill="#FFFFFF"
        stroke="#1E293B"
        strokeWidth={1.1}
      />

      {chart.showGrid &&
        chart.chartType !== 'heatmap' &&
        yTicks.map((tv, idx) => {
          const py = yToPx(tv);
          return (
            <g key={idx}>
              <line
                x1={padL}
                y1={py}
                x2={padL + plotW}
                y2={py}
                stroke="#CBD5E1"
                strokeWidth={0.75}
                strokeDasharray="3 2.5"
              />
              <text
                x={padL - 5}
                y={py + 3}
                textAnchor="end"
                fontSize={9.5}
                fill="#475569"
                fontFamily="serif"
              >
                {tv}
              </text>
            </g>
          );
        })}

      {/* 1. LINE CHART (+ Error Band) */}
      {chart.chartType === 'line' &&
        chart.series.map((s) => {
          const n = Math.max(1, s.points.length);
          const getX = (idx: number) =>
            padL + 14 + (idx / Math.max(1, n - 1)) * (plotW - 28);

          const hasErrors = s.points.some((p) => p.error !== undefined);
          let bandPath = '';
          if (hasErrors && s.points.length >= 2) {
            const upper = s.points.map(
              (p, i) =>
                `${i === 0 ? 'M' : 'L'} ${getX(i)} ${yToPx(p.y + (p.error || 0))}`
            );
            const lower = [...s.points].reverse().map((p, revIdx) => {
              const origIdx = s.points.length - 1 - revIdx;
              return `L ${getX(origIdx)} ${yToPx(p.y - (p.error || 0))}`;
            });
            bandPath = `${upper.join(' ')} ${lower.join(' ')} Z`;
          }

          const linePath = s.points
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${yToPx(p.y)}`)
            .join(' ');

          return (
            <g key={s.id}>
              {bandPath && (
                <path
                  d={bandPath}
                  fill={s.color}
                  fillOpacity={0.14}
                  stroke="none"
                />
              )}
              <path
                d={linePath}
                fill="none"
                stroke={s.color}
                strokeWidth={1.6}
                strokeDasharray={s.dashed ? '4 2.5' : undefined}
              />
              {s.points.map((p, i) => {
                const cx = getX(i);
                const cy = yToPx(p.y);
                return s.mark === 'square*' ? (
                  <rect
                    key={i}
                    x={cx - 2.6}
                    y={cy - 2.6}
                    width={5.2}
                    height={5.2}
                    fill={s.color}
                    stroke="#FFFFFF"
                    strokeWidth={0.7}
                  />
                ) : (
                  <circle
                    key={i}
                    cx={cx}
                    cy={cy}
                    r={2.8}
                    fill={s.color}
                    stroke="#FFFFFF"
                    strokeWidth={0.7}
                  />
                );
              })}
            </g>
          );
        })}

      {/* 2. GROUPED BAR CHART */}
      {chart.chartType === 'bar' &&
        (() => {
          const numGroups = Math.max(1, xLabels.length);
          const numSeries = Math.max(1, chart.series.length);
          const groupSlot = plotW / numGroups;
          const barW = Math.min(18, (groupSlot * 0.68) / numSeries);

          return chart.series.map((s, sIdx) => (
            <g key={s.id}>
              {s.points.map((pt, gIdx) => {
                const groupCenterX = padL + (gIdx + 0.5) * groupSlot;
                const startX =
                  groupCenterX - (numSeries * barW) / 2 + sIdx * barW;
                const barTop = yToPx(pt.y);
                const barH = Math.max(2, padT + plotH - barTop);
                return (
                  <rect
                    key={gIdx}
                    x={startX + 1}
                    y={barTop}
                    width={Math.max(4, barW - 2)}
                    height={barH}
                    fill={s.color}
                    fillOpacity={0.82}
                    stroke={s.color}
                    strokeWidth={0.9}
                  />
                );
              })}
            </g>
          ));
        })()}

      {/* 3. HEATMAP MATRIX */}
      {chart.chartType === 'heatmap' &&
        (() => {
          const mat = chart.heatmapMatrix || [
            [0.82, 0.1, 0.05, 0.03],
            [0.08, 0.77, 0.1, 0.05],
            [0.04, 0.11, 0.76, 0.09],
            [0.02, 0.05, 0.09, 0.84],
          ];
          const rows = mat.length;
          const cols = mat[0]?.length || 4;
          const cellW = plotW / cols;
          const cellH = plotH / rows;

          return mat.map((row, rIdx) =>
            row.map((val, cIdx) => {
              const alpha = Math.max(0.08, Math.min(0.95, val));
              return (
                <g key={`${rIdx}_${cIdx}`}>
                  <rect
                    x={padL + cIdx * cellW}
                    y={padT + rIdx * cellH}
                    width={cellW}
                    height={cellH}
                    fill="#2B5B84"
                    fillOpacity={alpha}
                    stroke="#FFFFFF"
                    strokeWidth={1}
                  />
                  <text
                    x={padL + (cIdx + 0.5) * cellW}
                    y={padT + (rIdx + 0.5) * cellH + 3.5}
                    textAnchor="middle"
                    fontSize={9.5}
                    fontWeight={val > 0.5 ? '600' : '400'}
                    fill={val > 0.52 ? '#FFFFFF' : '#1E293B'}
                  >
                    {val.toFixed(2)}
                  </text>
                </g>
              );
            })
          );
        })()}

      {/* 4. BOXPLOT */}
      {chart.chartType === 'boxplot' &&
        (chart.boxplots || []).map((bp, idx, arr) => {
          const slotW = plotW / Math.max(1, arr.length);
          const cx = padL + (idx + 0.5) * slotW;
          const boxW = Math.min(24, slotW * 0.48);
          const yMed = yToPx(bp.median);
          const yQ3 = yToPx(bp.upperQuartile);
          const yQ1 = yToPx(bp.lowerQuartile);
          const yHigh = yToPx(bp.upperWhisker);
          const yLow = yToPx(bp.lowerWhisker);
          const colors = ['#2B5B84', '#D97706', '#28664B', '#7C3AED'];
          const col = bp.color || colors[idx % colors.length];

          return (
            <g key={idx}>
              <line
                x1={cx}
                y1={yHigh}
                x2={cx}
                y2={yLow}
                stroke={col}
                strokeWidth={1.1}
                strokeDasharray="2.5 1.5"
              />
              <line
                x1={cx - boxW * 0.35}
                y1={yHigh}
                x2={cx + boxW * 0.35}
                y2={yHigh}
                stroke={col}
                strokeWidth={1.2}
              />
              <line
                x1={cx - boxW * 0.35}
                y1={yLow}
                x2={cx + boxW * 0.35}
                y2={yLow}
                stroke={col}
                strokeWidth={1.2}
              />
              <rect
                x={cx - boxW / 2}
                y={yQ3}
                width={boxW}
                height={Math.max(4, yQ1 - yQ3)}
                fill={col}
                fillOpacity={0.18}
                stroke={col}
                strokeWidth={1.2}
              />
              <line
                x1={cx - boxW / 2}
                y1={yMed}
                x2={cx + boxW / 2}
                y2={yMed}
                stroke="#B91C1C"
                strokeWidth={1.6}
              />
            </g>
          );
        })}

      {/* X-Axis Tick Labels */}
      {xLabels.map((lbl, idx) => {
        const n = Math.max(1, xLabels.length);
        const tx =
          chart.chartType === 'line'
            ? padL + 14 + (idx / Math.max(1, n - 1)) * (plotW - 28)
            : padL + (idx + 0.5) * (plotW / n);
        return (
          <text
            key={idx}
            x={tx}
            y={padT + plotH + 13}
            textAnchor="middle"
            fontSize={9.5}
            fill="#334155"
            fontFamily="serif"
          >
            {lbl}
          </text>
        );
      })}

      {/* Draggable & Double-Click Editable X-Axis Label */}
      <g
        transform={`translate(${xlabelOff.x}, ${xlabelOff.y})`}
        onPointerDown={(e) => {
          if (!selected) return;
          startPartDrag(e, 'xlabel', xlabelOff.x, xlabelOff.y);
        }}
        onPointerMove={handlePartMove}
        onPointerUp={handlePartUp}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onEditSubTarget(chart.id, {
            kind: 'xlabel',
            currentText: chart.xlabel,
          });
        }}
        className={
          selected
            ? 'cursor-grab active:cursor-grabbing group/xlabel'
            : 'cursor-move group/xlabel'
        }
      >
        <title data-export-ignore="true">拖拽可调整 X 轴标签位置 · 双击直接编辑 X 轴文字/公式</title>
        <rect
          data-export-ignore="true"
          x={padL}
          y={totalH - 19}
          width={plotW}
          height={18}
          rx={2}
          fill="none"
          className="group-hover/xlabel:stroke-blue-400 group-hover/xlabel:fill-blue-50/30"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
        <foreignObject
          x={padL}
          y={totalH - 23}
          width={plotW}
          height={26}
          style={{ overflow: 'visible' }}
        >
          <LatexLabel text={chart.xlabel} fontSize={10.5} color="#334155" />
        </foreignObject>
      </g>

      {/* Draggable & Double-Click Editable Y-Axis Label */}
      <g
        transform={`translate(${12 + ylabelOff.x}, ${
          padT + plotH / 2 + ylabelOff.y
        }) rotate(-90)`}
        onPointerDown={(e) => {
          if (!selected) return;
          startPartDrag(e, 'ylabel', ylabelOff.x, ylabelOff.y);
        }}
        onPointerMove={handlePartMove}
        onPointerUp={handlePartUp}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onEditSubTarget(chart.id, {
            kind: 'ylabel',
            currentText: chart.ylabel,
          });
        }}
        className={
          selected
            ? 'cursor-grab active:cursor-grabbing group/ylabel'
            : 'cursor-move group/ylabel'
        }
      >
        <title data-export-ignore="true">拖拽可调整 Y 轴标签位置 · 双击直接编辑 Y 轴文字/公式</title>
        <rect
          data-export-ignore="true"
          x={-plotH / 2}
          y={-9}
          width={plotH}
          height={18}
          rx={2}
          fill="none"
          className="group-hover/ylabel:stroke-blue-400 group-hover/ylabel:fill-blue-50/30"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
        <foreignObject
          x={-plotH / 2}
          y={-13}
          width={plotH}
          height={26}
          style={{ overflow: 'visible' }}
        >
          <LatexLabel text={chart.ylabel} fontSize={10.5} color="#334155" />
        </foreignObject>
      </g>

      {/* Optional Chart Subcaption below X-axis */}
      {chart.subcaption && (
        <g
          onDoubleClick={(e) => {
            e.stopPropagation();
            onEditSubTarget(chart.id, {
              kind: 'subcaption',
              currentText: chart.subcaption || '',
            });
          }}
          className="cursor-text group/subcap"
        >
          <rect
            data-export-ignore="true"
            x={8}
            y={totalH + 2}
            width={totalW - 16}
            height={20}
            rx={2}
            fill="none"
            className="group-hover/subcap:stroke-blue-400 group-hover/subcap:fill-blue-50/30"
            strokeDasharray="2 2"
          />
          <foreignObject
            x={8}
            y={totalH - 1}
            width={totalW - 16}
            height={26}
            style={{ overflow: 'visible' }}
          >
            <LatexLabel
              text={chart.subcaption}
              fontSize={11.5}
              color="#0F172A"
            />
          </foreignObject>
        </g>
      )}

      {/* Draggable, Resizable & Double-Click Editable Publication Legend Box */}
      {chart.showLegend &&
        chart.chartType !== 'heatmap' &&
        chart.chartType !== 'boxplot' &&
        (() => {
          const lx = chart.legendPos?.x ?? 0.04;
          const ly = chart.legendPos?.y ?? 0.94;
          const legScale = Math.max(
            0.5,
            Math.min(2.0, chart.legendScale ?? 1.0)
          );
          const legX = padL + lx * plotW;
          const legY = padT + (1 - ly) * plotH;

          // Compute natural tight width from longest series name so legend box hugs its contents
          const maxNameChars = chart.series.reduce(
            (max, s) => Math.max(max, (s.name || '').length),
            4
          );
          const baseLegW = Math.max(58, Math.min(148, maxNameChars * 5.2 + 28));
          const baseRowH = 14.5;
          const basePadY = 4;
          const baseLegH = chart.series.length * baseRowH + basePadY * 2;

          const legW = Math.max(
            42,
            Math.min(plotW - 6, Math.round(baseLegW * legScale))
          );
          const rowH = baseRowH * legScale;
          const padY = basePadY * legScale;
          const padX = 6 * legScale;
          const legH = Math.round(chart.series.length * rowH + padY * 2);
          const fontSize = Number((8.8 * legScale).toFixed(2));
          const sampleW = 13 * legScale;
          const markerR = 2.1 * legScale;
          const textX = Math.round(18 * legScale);
          const isLegendActive =
            subDrag?.part === 'legend' || subDrag?.part === 'legend_resize';

          return (
            <g
              transform={`translate(${legX}, ${legY})`}
              className="cursor-grab active:cursor-grabbing group/legend"
              onPointerDown={(e) => {
                if (!selected) return;
                startPartDrag(e, 'legend', lx, ly);
              }}
              onPointerMove={handlePartMove}
              onPointerUp={handlePartUp}
            >
              <title data-export-ignore="true">
                拖拽自由移动图例位置 · 拖拽图例右下角缩放点调节图例大小 · 双击图例项修改名称
              </title>
              <rect
                x={0}
                y={0}
                width={legW}
                height={legH}
                fill="#FFFFFF"
                fillOpacity={0.95}
                stroke={isLegendActive ? '#2563EB' : '#CBD5E1'}
                strokeWidth={isLegendActive ? 1.5 : 0.85}
                rx={Math.max(1.5, Number((2.5 * legScale).toFixed(1)))}
                className="group-hover/legend:stroke-blue-500 transition-colors"
              />
              {chart.series.map((s, idx) => (
                <g
                  key={s.id}
                  transform={`translate(${Number(padX.toFixed(1))}, ${Number(
                    (padY + rowH * (idx + 0.52)).toFixed(1)
                  )})`}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onEditSubTarget(chart.id, {
                      kind: 'series_name',
                      seriesIndex: idx,
                      currentText: s.name,
                    });
                  }}
                  className="cursor-pointer hover:opacity-75"
                >
                  <line
                    x1={0}
                    y1={0}
                    x2={Number(sampleW.toFixed(1))}
                    y2={0}
                    stroke={s.color}
                    strokeWidth={Number((1.6 * legScale).toFixed(2))}
                    strokeDasharray={s.dashed ? '3 2' : undefined}
                  />
                  <circle
                    cx={Number((sampleW / 2).toFixed(1))}
                    cy={0}
                    r={Number(markerR.toFixed(2))}
                    fill={s.color}
                  />
                  <text
                    x={textX}
                    y={Number((fontSize * 0.34).toFixed(2))}
                    fontSize={fontSize}
                    fill="#1E293B"
                  >
                    {s.name}
                  </text>
                </g>
              ))}

              {/* Dedicated Legend Corner Resize Handle when Chart is Selected */}
              {selected && (
                <rect
                  data-export-ignore="true"
                  x={legW - 3.5}
                  y={legH - 3.5}
                  width={7}
                  height={7}
                  rx={1.5}
                  fill="#F59E0B"
                  stroke="#FFFFFF"
                  strokeWidth={1.2}
                  className="cursor-nwse-resize opacity-85 group-hover/legend:opacity-100"
                  onPointerDown={(e) =>
                    startPartDrag(e, 'legend_resize', lx, ly, {
                      initScale: legScale,
                      baseLegW,
                      baseLegH,
                    })
                  }
                  onPointerMove={handlePartMove}
                  onPointerUp={handlePartUp}
                >
                  <title>拖拽此控点直接缩放图例框大小 ({Math.round(legScale * 100)}%)</title>
                </rect>
              )}
            </g>
          );
        })()}

      {/* Direct Canvas Resize Handles when Chart is Selected */}
      {selected && (
        <g data-export-ignore="true">
          {/* Right width resize handle */}
          <rect
            x={totalW + 2}
            y={totalH / 2 - 5}
            width={8}
            height={10}
            rx={2}
            fill="#FFFFFF"
            stroke="#2563EB"
            strokeWidth={1.5}
            className="cursor-ew-resize"
            onPointerDown={(e) => startPartDrag(e, 'resize_e', 0, 0)}
            onPointerMove={handlePartMove}
            onPointerUp={handlePartUp}
          >
            <title>拖拽调整图表宽度 (cm)</title>
          </rect>
          {/* Top height resize handle */}
          <rect
            x={totalW / 2 - 5}
            y={-10}
            width={10}
            height={8}
            rx={2}
            fill="#FFFFFF"
            stroke="#2563EB"
            strokeWidth={1.5}
            className="cursor-ns-resize"
            onPointerDown={(e) => startPartDrag(e, 'resize_n', 0, 0)}
            onPointerMove={handlePartMove}
            onPointerUp={handlePartUp}
          >
            <title>拖拽调整图表高度 (cm)</title>
          </rect>
          {/* Top-right corner resize handle */}
          <rect
            x={totalW + 2}
            y={-10}
            width={8}
            height={8}
            rx={2}
            fill="#2563EB"
            stroke="#FFFFFF"
            strokeWidth={1}
            className="cursor-nesw-resize"
            onPointerDown={(e) => startPartDrag(e, 'resize_ne', 0, 0)}
            onPointerMove={handlePartMove}
            onPointerUp={handlePartUp}
          >
            <title>拖拽同时调整图表宽高</title>
          </rect>
        </g>
      )}
    </g>
  );
};
