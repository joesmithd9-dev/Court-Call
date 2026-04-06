import type { CourtDay } from '../../types';

interface Props {
  courtDay: CourtDay;
  connected: boolean;
}

export function CourtHeader({ courtDay, connected }: Props) {
  const dateStr = new Date(courtDay.date).toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <header className="px-4 py-3 bg-court-surface border-b border-court-border">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-white truncate">
            {courtDay.courtName}
            {courtDay.courtRoom && (
              <span className="text-court-text-dim font-normal"> — {courtDay.courtRoom}</span>
            )}
          </h1>
          <p className="text-sm text-court-text-dim">{dateStr}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <span className="text-sm text-court-text-dim">{courtDay.judgeName}</span>
          <span
            className={`w-2 h-2 rounded-full ${connected ? 'bg-court-active' : 'bg-court-danger'}`}
            title={connected ? 'Connected' : 'Disconnected'}
          />
        </div>
      </div>
    </header>
  );
}
