import React from 'react';

export const SettingsPageTitle: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}> = ({ title, subtitle, action }) => (
  <div className="mb-5 flex items-start justify-between gap-4">
    <div>
      <h2 className="text-[16px] font-bold tracking-tight text-slate-900">{title}</h2>
      {subtitle && (
        <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{subtitle}</p>
      )}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export const SettingsSectionLabel: React.FC<{
  title: string;
  description?: string;
  right?: React.ReactNode;
}> = ({ title, description, right }) => (
  <div className="mb-2 px-0.5 flex items-end justify-between gap-2">
    <div>
      <h3 className="text-[12px] font-semibold tracking-tight text-slate-700">{title}</h3>
      {description && (
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{description}</p>
      )}
    </div>
    {right && <div className="shrink-0">{right}</div>}
  </div>
);

export const SettingsGroup: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div
    className={`mb-5 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] ${className}`}
  >
    {children}
  </div>
);

export const SettingsRow: React.FC<{
  label: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  children?: React.ReactNode;
  alignTop?: boolean;
}> = ({ label, description, badge, children, alignTop = false }) => (
  <div
    className={`flex justify-between gap-4 px-4 py-3 ${
      alignTop ? 'items-start' : 'items-center'
    }`}
  >
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-medium text-slate-800">{label}</span>
        {badge}
      </div>
      {description && (
        <div className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
          {description}
        </div>
      )}
    </div>
    {children && <div className="shrink-0 flex items-center gap-2">{children}</div>}
  </div>
);

export type BadgeTone = 'emerald' | 'amber' | 'blue' | 'rose' | 'purple' | 'slate';

const TONE_CLASSES: Record<BadgeTone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
};

export const StatusBadge: React.FC<{
  tone?: BadgeTone;
  children: React.ReactNode;
  title?: string;
}> = ({ tone = 'slate', children, title }) => (
  <span
    title={title}
    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight ${TONE_CLASSES[tone]}`}
  >
    {children}
  </span>
);

export const SettingsToggle: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}> = ({ checked, onChange, disabled, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 focus:outline-none ${
      checked ? 'bg-blue-600' : 'bg-slate-200'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    <span
      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-150 ${
        checked ? 'translate-x-4' : 'translate-x-0'
      }`}
    />
  </button>
);
