import type { CourtDayStatus } from '../../types';

interface Props {
  status: CourtDayStatus;
  statusMessage?: string;
  judgeName: string;
  resumeTime?: string;
}

const STATUS_CONFIG: Record<CourtDayStatus, { label: string; color: string; bg: string }> = {
  scheduled: { label: 'SCHEDULED', color: 'text-court-text-dim', bg: 'bg-court-surface-2' },
  live: { label: 'LIVE', color: 'text-court-active', bg: 'bg-court-active-bg' },
  judge_rose: { label: 'JUDGE ROSE', color: 'text-court-danger', bg: 'bg-court-danger-bg' },
  at_lunch: { label: 'AT LUNCH', color: 'text-court-warning', bg: 'bg-court-warning-bg' },
  adjourned: { label: 'ADJOURNED', color: 'text-court-warning', bg: 'bg-court-warning-bg' },
  ended: { label: 'DAY ENDED', color: 'text-court-concluded', bg: 'bg-court-concluded-bg' },
};

export function StatusBanner({ status, statusMessage, judgeName, resumeTime }: Props) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.scheduled;

  const displayMessage =
    statusMessage ??
    (status === 'judge_rose'
      ? `${judgeName} — ${resumeTime ? `Back at ${formatShortTime(resumeTime)}` : 'Rose'}`
      : status === 'at_lunch' && resumeTime
        ? `At Lunch — Back at ${formatShortTime(resumeTime)}`
        : undefined);

  return (
    <div className={`${cfg.bg} px-4 py-2.5 text-center border-b border-court-border`}>
      <span className={`font-bold text-sm tracking-widest uppercase ${cfg.color}`}>
        {cfg.label}
      </span>
      {displayMessage && (
        <span className={`ml-2 text-sm ${cfg.color} opacity-80`}>{displayMessage}</span>
      )}
    </div>
  );
}

function formatShortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
