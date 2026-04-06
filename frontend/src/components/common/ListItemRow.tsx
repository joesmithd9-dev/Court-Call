import type { CourtCase } from '../../types';
import { getCaseTitle } from '../../stores/courtDayStore';
import { StatusBadge } from './StatusBadge';
import { TimeChip } from './TimeChip';

interface Props {
  courtCase: CourtCase;
  position: number;
  isCurrent: boolean;
  view: 'public' | 'registrar';
  children?: React.ReactNode;
}

export function ListItemRow({ courtCase: c, position, isCurrent, view, children }: Props) {
  // 6.5: Use view-appropriate title
  const title = getCaseTitle(c, view);

  return (
    <div
      className={`px-4 py-2.5 border-b border-court-border flex items-center gap-3 ${
        isCurrent
          ? 'bg-court-active-bg/50'
          : c.status === 'concluded' || c.status === 'vacated'
            ? 'opacity-50'
            : ''
      }`}
    >
      <span className="text-sm font-mono text-court-text-dim w-6 text-right shrink-0">
        {position}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${isCurrent ? 'text-white font-semibold' : 'text-court-text'}`}>
          {title}
        </p>
        {c.note && (
          <p className="text-xs text-court-text-dim truncate italic">{c.note}</p>
        )}
      </div>
      <StatusBadge status={c.status} />
      <TimeChip courtCase={c} />
      {children}
    </div>
  );
}
