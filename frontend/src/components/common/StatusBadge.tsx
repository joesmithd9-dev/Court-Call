import type { CaseStatus } from '../../types';

interface Props {
  status: CaseStatus;
  className?: string;
}

const BADGE_CONFIG: Record<CaseStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-court-surface-2 text-court-text-dim' },
  calling: { label: 'Calling', cls: 'bg-court-warning-bg text-court-warning' },
  hearing: { label: 'Hearing', cls: 'bg-court-active-bg text-court-active' },
  adjourned: { label: 'Adjourned', cls: 'bg-court-danger-bg text-court-danger' },
  stood_down: { label: 'Let Stand', cls: 'bg-court-warning-bg text-court-warning' },
  not_before: { label: 'Not Before', cls: 'bg-court-surface-2 text-court-text-dim' },
  concluded: { label: 'Concluded', cls: 'bg-court-concluded-bg text-court-concluded' },
  vacated: { label: 'Vacated', cls: 'bg-court-concluded-bg text-court-concluded' },
};

export function StatusBadge({ status, className = '' }: Props) {
  const cfg = BADGE_CONFIG[status] ?? BADGE_CONFIG.pending;
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${cfg.cls} ${className}`}
    >
      {cfg.label}
    </span>
  );
}
