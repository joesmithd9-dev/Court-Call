import type { CourtCase } from '../../types';
import { TimeChip } from './TimeChip';
import { StatusBadge } from './StatusBadge';

interface Props {
  cases: CourtCase[];
  maxVisible?: number;
}

export function NextUpStrip({ cases, maxVisible = 3 }: Props) {
  const visible = cases.slice(0, maxVisible);

  if (visible.length === 0) return null;

  return (
    <div className="px-4 py-3 border-b border-court-border">
      <p className="text-xs text-court-text-dim font-semibold uppercase tracking-widest mb-2">
        Next Up
      </p>
      <div className="space-y-2">
        {visible.map((c, i) => (
          <div
            key={c.id}
            className="flex items-center gap-3 py-1.5"
          >
            <span className="text-sm font-mono text-court-text-dim w-5 text-right shrink-0">
              {i + 1}
            </span>
            <span className="text-sm text-white truncate flex-1">{c.caseName}</span>
            <StatusBadge status={c.status} />
            <TimeChip courtCase={c} showRelative />
          </div>
        ))}
      </div>
    </div>
  );
}
