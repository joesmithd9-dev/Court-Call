import type { Matter } from '../lib/types';
import { DurationBadge } from './DurationBadge';
import { TypeBadge } from './TypeBadge';

interface Props {
  matter: Matter;
  variant?: 'registrar' | 'judge';
}

export function LiveMatterCard({ matter, variant = 'registrar' }: Props) {
  const startTime = matter.actualStartTime ? new Date(matter.actualStartTime) : null;
  const elapsed = startTime ? Math.round((Date.now() - startTime.getTime()) / 60000) : 0;
  const remaining = Math.max(0, matter.estimatedMinutes - elapsed);
  const isOverrun = elapsed > matter.estimatedMinutes;

  const borderColor = variant === 'judge' ? 'border-l-sky-400' : 'border-l-emerald-400';
  const bgColor = variant === 'judge' ? 'bg-sky-950/30' : 'bg-emerald-950/30';
  const labelColor = variant === 'judge' ? 'text-sky-400' : 'text-emerald-400';

  return (
    <div className={`mx-4 my-3 ${bgColor} border border-slate-700 ${borderColor} border-l-4 rounded-md p-4`}>
      <div className={`text-[10px] font-bold ${labelColor} uppercase tracking-widest font-serif mb-1.5`}>
        Current matter before the court
      </div>
      <h3 className="text-lg font-semibold text-slate-100 font-serif">{matter.title}</h3>
      <div className="text-xs text-slate-400 mt-1">
        {matter.caseReference} {matter.publicNote && `· ${matter.publicNote}`}
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
        <TypeBadge type={matter.matterType} />
        <DurationBadge minutes={matter.estimatedMinutes} />
        {matter.calledAt && <span>Started {matter.calledAt}</span>}
        <span className={isOverrun ? 'text-red-400 font-bold' : ''}>
          {isOverrun ? `+${elapsed - matter.estimatedMinutes}m overrun` : `~${remaining}m remaining`}
        </span>
      </div>
    </div>
  );
}
