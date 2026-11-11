import { useEffect, useState } from 'react';
import { BadgeCheck, Cpu, HardDriveDownload, Languages, Loader2 } from 'lucide-react';
import { SettingsGroup, SettingsRow, SettingsSectionLabel, StatusBadge } from './SettingsLayout';

interface EngineInfo {
  id: string;
  label: string;
  available: boolean;
  note: string;
}

interface RuntimeStatus {
  ready: boolean;
  version: string | null;
  engines: EngineInfo[];
  cjkFont: string | null;
  offlinePackages: boolean;
  message: string;
}

const isDesktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** TeX is bundled with the app, so this pane reports it instead of asking for paths. */
export function TexRuntimePane() {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktop()) {
      setError('浏览器模式不加载 TeX 引擎；桌面版已内置，无需安装 TeX Live。');
      return;
    }
    let active = true;
    void import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke<RuntimeStatus>('tex_engine_status'))
      .then((result) => active && setStatus(result))
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : String(reason)));
    return () => { active = false; };
  }, []);

  return (
    <>
      <SettingsSectionLabel
        title="内置 TeX 引擎"
        description="AgenTikZ 自带 TeX 引擎，无需安装 TeX Live、MiKTeX 或 MacTeX，也不读取系统 PATH。"
      />
      <SettingsGroup>
        {!status && !error && (
          <SettingsRow label="正在检测内置引擎" description="读取随应用分发的 TeX 运行时">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          </SettingsRow>
        )}
        {error && (
          <SettingsRow label="内置引擎不可用" description={error}>
            <StatusBadge tone="rose">不可用</StatusBadge>
          </SettingsRow>
        )}
        {status && (
          <>
            <SettingsRow
              label="TeX 引擎"
              description={status.version ? `${status.version} · ${status.message}` : status.message}
            >
              <StatusBadge tone={status.ready ? 'emerald' : 'rose'}>
                {status.ready ? '就绪' : '缺失'}
              </StatusBadge>
            </SettingsRow>
            <SettingsRow
              label="可用编译器"
              description="默认 XeLaTeX。LuaLaTeX 与 pdfLaTeX 需要 TeX Live 的专用二进制，当前版本未内置。"
            >
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {status.engines.map((engine) => (
                  <span
                    key={engine.id}
                    title={engine.note}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium ${
                      engine.available
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-slate-50 text-slate-400'
                    }`}
                  >
                    <Cpu className="h-3 w-3" />
                    {engine.label}
                  </span>
                ))}
              </div>
            </SettingsRow>
            <SettingsRow
              label="中文字体"
              description="图表内固定使用内置开源无衬线中文字体，不在图中混排系统 .ttc 字体。"
            >
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-700">
                <Languages className="h-3.5 w-3.5 text-slate-400" />
                {status.cjkFont ?? '未内置'}
              </span>
            </SettingsRow>
            <SettingsRow
              label="宏包"
              description="TikZ、PGFPlots、amsmath、ctex 等常用宏包已预置于安装包内，可直接离线编译；冷门宏包在首次使用时自动下载并缓存到本机。"
            >
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-700">
                {status.offlinePackages
                  ? <><BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />已预置</>
                  : <><HardDriveDownload className="h-3.5 w-3.5 text-blue-600" />首次使用时下载</>}
              </span>
            </SettingsRow>
          </>
        )}
      </SettingsGroup>
    </>
  );
}
