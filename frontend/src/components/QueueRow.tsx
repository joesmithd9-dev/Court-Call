import type { Matter, ViewRole } from '../lib/types';
import { DurationBadge } from './DurationBadge';
import { StatusBadge } from './StatusBadge';
import { TypeBadge } from './TypeBadge';

interface Props {
  matter: Matter;
  variant: ViewRole;
  onClick?: () => void;
  compact?: boolean;
}

export function QueueRow({ matter, variant, onClick, compact }: Props) {
  const isDone = matter.status === 'CONCLUDED' || matter.status === 'ADJOURNED';
  const isActive = matter.status === 'HEARING' || matter.status === 'CALLING';
  const isUnanswered = matter.status === 'UNANSWERED';

  const displayTitle = variant === 'public' ? matter.titlePublic : matter.title;

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-2.5 border-b border-slate-700/50 transition-colors ${
        isActive ? 'bg-emerald-950/30 border-l-2 border-l-emerald-500' :
        isDone ? 'opacity-40' :
        isUnanswered ? 'bg-amber-950/20' :
        'hover:bg-slate-800/50'
      } ${onClick ? 'cursor-pointer' : ''}`}
    >
      {/* Position */}
      <span className="text-xs font-mono text-slate-500 w-5 text-right shrink-0">
        {matter.position}
      </span>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-100 font-serif truncate">{displayTitle}</div>
        {!compact && (
          <div className="text-[11px] text-slate-400 truncate mt-0.5">
            {matter.caseReference}
            {matter.predictedStart && ` · ~${matter.predictedStart}`}
            {matter.publicNote && ` · ${matter.publicNote}`}
          </div>
        )}
      </div>

      {/* Badges */}
      <div className="flex items-center gap-1.5 shrink-0">
        {variant !== 'public' && <TypeBadge type={matter.matterType} />}
        <DurationBadge minutes={matter.estimatedMinutes} />
        <StatusBadge status={matter.status} />
      </div>
    </div>
  );
}
