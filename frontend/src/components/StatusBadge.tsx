import type { MatterStatus } from '../lib/types';

const STATUS_CONFIG: Record<MatterStatus, { label: string; cls: string }> = {
  PENDING:     { label: 'Pending',     cls: 'bg-slate-700/50 text-slate-300 border-slate-600' },
  CALLING:     { label: 'Calling',     cls: 'bg-blue-900/40 text-blue-300 border-blue-700' },
  HEARING:     { label: 'Hearing',     cls: 'bg-emerald-900/40 text-emerald-300 border-emerald-700' },
  CONCLUDED:   { label: 'Concluded',   cls: 'bg-slate-700/30 text-slate-500 border-slate-600' },
  UNANSWERED:  { label: 'Unanswered',  cls: 'bg-amber-900/40 text-amber-300 border-amber-700' },
  ADJOURNED:   { label: 'Adjourned',   cls: 'bg-orange-900/30 text-orange-300 border-orange-700' },
  LET_STAND:   { label: 'Let Stand',   cls: 'bg-purple-900/30 text-purple-300 border-purple-700' },
  STOOD_DOWN:  { label: 'Stood Down',  cls: 'bg-slate-700/40 text-slate-400 border-slate-600' },
  NOT_BEFORE:  { label: 'Not Before',  cls: 'bg-sky-900/30 text-sky-300 border-sky-700' },
};

interface Props { status: MatterStatus; className?: string }

export function StatusBadge({ status, className = '' }: Props) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${cfg.cls} ${className}`}>
      {cfg.label}
    </span>
  );
}
