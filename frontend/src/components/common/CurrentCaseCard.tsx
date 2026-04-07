import type { CourtCase } from '../../types';
import { getCaseTitle } from '../../stores/courtDayStore';
import { StatusBadge } from './StatusBadge';
import { formatTime } from '../../utils/time';

interface Props {
  courtCase: CourtCase;
  view: 'public' | 'registrar';
}

export function CurrentCaseCard({ courtCase: c, view }: Props) {
  // 6.5: Use view-appropriate title
  const title = getCaseTitle(c, view);

  return (
    <div className="mx-4 my-3 p-4 rounded-xl bg-court-active-bg border border-court-active/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-court-active font-semibold uppercase tracking-widest mb-1">
            Current Case
          </p>
          <h2 className="text-xl font-bold text-white truncate">{title}</h2>
          {c.caseNumber && (
            <p className="text-sm text-court-text-dim mt-0.5">{c.caseNumber}</p>
          )}
        </div>
        <StatusBadge status={c.status} />
      </div>

      <div className="mt-3 flex items-center gap-4 text-sm text-court-text-dim">
        {c.startedAt && (
          <span>Started {formatTime(c.startedAt)}</span>
        )}
        {c.estimatedMinutes != null && (
          <span>~{c.estimatedMinutes} min remaining</span>
        )}
      </div>

      {c.note && (
        <p className="mt-2 text-sm text-court-text-dim italic border-t border-court-active/20 pt-2">
          {c.note}
        </p>
      )}
    </div>
  );
}
