import { useEffect, useRef, useState } from 'react';
import type { AcpAgentProvider, AgentChatMessage } from '../../types/acp';

export const isDesktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** `mm:ss` for a running timer. */
export function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

/** Compact wording for a finished run: `0.8 秒`, `18 秒`, `2 分 05 秒`. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0.1, ms / 1000).toFixed(1)} 秒`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${String(seconds % 60).padStart(2, '0')} 秒`;
}

/** "刚刚" / "12 分钟前" / "3 小时前" / "11月9日". */
export function formatRelative(epochMs: number | undefined, now = Date.now()): string {
  if (!epochMs) return '';
  const minutes = Math.floor((now - epochMs) / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} 小时前`;
  if (minutes < 60 * 24 * 7) return `${Math.floor(minutes / (60 * 24))} 天前`;
  const date = new Date(epochMs);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatCount(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

/** "Claude Code (ACP)" → "Claude Code"; the protocol is detail, not identity. */
export function shortAgentName(provider: Pick<AcpAgentProvider, 'id' | 'name'>): string {
  if (provider.id === 'pi') return '内置 Pi';
  return provider.name.replace(/\s*\(ACP\)\s*$/, '');
}

const TOOL_LABELS: Record<string, string> = {
  get_canvas_ast: '读取画布结构',
  get_canvas_source: '读取画布源码',
  get_selected_elements: '读取选中元素',
  get_component_library: '查阅组件库',
  get_diagram_design_skill: '查阅绘图规范',
  get_theme_palette: '读取配色主题',
  get_project_context: '读取项目信息',
  get_paper_diagnostics: '读取编译诊断',
  read_project_file: '读取项目文件',
  inspect_layout_diagnostics: '检查布局',
  render_canvas_preview: '渲染预览',
  propose_tikz_patch: '生成画布提案',
  propose_surgical_diff: '生成增量补丁',
  propose_layout_repair: '修复布局',
  propose_project_patch: '生成论文修改集',
  auto_repair_layout: '自动修复布局',
};

/** Strips MCP namespacing and returns a readable label plus the raw tool id for tooltips. */
export function describeTool(toolName: string): { label: string; raw: string } {
  const raw = toolName.replace(/^mcp__agen?tikz__/, '').replace(/^mcp__/, '');
  return { label: TOOL_LABELS[raw] ?? raw, raw };
}

/** Messages written before `kind` existed are still classified by their wording. */
export function messageKind(message: AgentChatMessage): AgentChatMessage['kind'] {
  if (message.role !== 'system') return undefined;
  if (message.kind) return message.kind;
  if (/^(?:Pi|ACP)\s*错误：/.test(message.content)) return 'error';
  if (message.content.startsWith('ACP 权限请求已拒绝：')) return 'warning';
  return 'notice';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Seconds since `startedAt`, ticking only while a run is active. */
export function useElapsedSeconds(startedAt: number | null): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (startedAt === null) { setSeconds(0); return; }
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return seconds;
}

/** Closes a popover on an outside press or Escape, without letting that Escape also deselect the canvas. */
export function useDismiss<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T | null>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) closeRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      closeRef.current();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);
  return ref;
}

/** Briefly true after an action, for "copied" style confirmations. */
export function useFlash(durationMs = 1400): [boolean, () => void] {
  const [active, setActive] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [active, () => {
    setActive(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setActive(false), durationMs);
  }];
}
