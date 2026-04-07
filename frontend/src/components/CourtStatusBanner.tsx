import type { CourtStatus } from '../lib/types';

const STATUS_MAP: Record<CourtStatus, { label: string; cls: string }> = {
  SETUP:      { label: 'Court Not Yet Sitting', cls: 'bg-slate-700/50 text-slate-300 border-slate-600' },
  LIVE:       { label: '● Court Sitting',       cls: 'bg-emerald-950/40 text-emerald-300 border-emerald-800' },
  JUDGE_ROSE: { label: '■ Judge Rose',          cls: 'bg-red-950/40 text-red-300 border-red-800' },
  AT_LUNCH:   { label: '◆ At Lunch',            cls: 'bg-amber-950/40 text-amber-300 border-amber-800' },
  PAUSED:     { label: '⏸ Court Paused',        cls: 'bg-orange-950/40 text-orange-300 border-orange-800' },
  CONCLUDED:  { label: '● Court Concluded',      cls: 'bg-slate-700/50 text-slate-400 border-slate-600' },
};

interface Props { status: CourtStatus }

export function CourtStatusBanner({ status }: Props) {
  const cfg = STATUS_MAP[status];
  return (
    <div className={`text-center py-2 text-[11px] font-bold uppercase tracking-widest font-serif border-b ${cfg.cls}`}>
      {cfg.label}
    </div>
  );
}
