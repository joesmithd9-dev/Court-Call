import { useParams } from 'react-router-dom';
import { useCourtDayLoader } from '../hooks/useCourtDayLoader';
import { useCourtDayView } from '../viewModel/useCourtDayView';
import { fetchRegistrarCourtDay } from '../api/client';
import type { ActiveCaseView, QueueItemView } from '../viewModel/courtDayViewModel';

/**
 * Judge UI — Read-first, calm, glanceable.
 * Uses full (registrar-level) titles. No public privacy filter.
 * Minimal controls — primarily an information display.
 */
export function JudgeScreen() {
  const { courtDayId } = useParams<{ courtDayId: string }>();

  useCourtDayLoader({ courtDayId: courtDayId!, fetchFn: fetchRegistrarCourtDay });

  const vm = useCourtDayView('judge');

  if (!vm.ready) {
    return (
      <div className="flex-1 flex items-center justify-center">
        {vm.loading ? (
          <span className="text-court-text-dim animate-pulse text-lg">Loading...</span>
        ) : (
          <div className="text-court-danger text-center px-4">
            <p className="text-lg font-semibold">Unable to load court day</p>
            <p className="text-sm text-court-text-dim mt-1">{vm.error}</p>
          </div>
        )}
      </div>
    );
  }

  const { meta, courtStatus, activeCase, nextUp, queue, concluded } = vm;

  return (
    <div className="flex flex-col min-h-dvh">
      {/* Header — clean, large */}
      <header className="px-6 py-4 bg-court-surface border-b border-court-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">
              {meta.courtName}
              {meta.courtRoom && <span className="text-court-text-dim font-normal"> — {meta.courtRoom}</span>}
            </h1>
            <p className="text-sm text-court-text-dim mt-0.5">{meta.judgeName} — {meta.dateLabel}</p>
          </div>
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${meta.connected ? 'bg-court-active' : 'bg-court-danger'}`} />
        </div>
      </header>

      {/* Critical error */}
      {meta.criticalError && (
        <div className="px-6 py-3 bg-court-danger text-white text-center font-bold">
          {meta.criticalError}
        </div>
      )}

      {/* Status banner — prominent */}
      <JudgeStatusBanner status={courtStatus} />

      {/* Active case — dominant */}
      {activeCase ? (
        <JudgeActiveCard c={activeCase} />
      ) : (
        <div className="px-6 py-8 text-center">
          <p className="text-court-text-dim text-lg">
            {courtStatus.isEnded ? 'Court has concluded for the day' : 'No case currently before the court'}
          </p>
        </div>
      )}

      {/* Next up — visible at a glance */}
      {nextUp.length > 0 && (
        <div className="px-6 py-4 border-t border-court-border">
          <h3 className="text-xs text-court-text-dim font-semibold uppercase tracking-widest mb-3">Next Up</h3>
          <div className="space-y-3">
            {nextUp.map((item, i) => (
              <JudgeQueueRow key={item.id} item={item} index={i + 1} />
            ))}
          </div>
        </div>
      )}

      {/* Remaining queue */}
      {queue.length > nextUp.length && (
        <div className="px-6 py-4 border-t border-court-border flex-1">
          <h3 className="text-xs text-court-text-dim font-semibold uppercase tracking-widest mb-3">
            Remaining ({queue.length - nextUp.length})
          </h3>
          <div className="space-y-1.5">
            {queue.slice(nextUp.length).map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-1">
                <span className="text-sm font-mono text-court-text-dim w-6 text-right shrink-0">{item.position}</span>
                <span className="text-sm text-court-text truncate flex-1">{item.title}</span>
                <JudgeBadge status={item.status} label={item.statusLabel} />
                {item.timeLabel && <span className="text-xs text-court-text-dim">{item.timeLabel}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Concluded — compact, low emphasis */}
      {concluded.length > 0 && (
        <div className="px-6 py-3 border-t border-court-border">
          <h3 className="text-xs text-court-text-dim font-semibold uppercase tracking-widest mb-2">
            Concluded ({concluded.length})
          </h3>
          <div className="space-y-1">
            {concluded.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-0.5 opacity-50">
                <span className="text-xs font-mono text-court-text-dim w-6 text-right shrink-0">{item.position}</span>
                <span className="text-xs text-court-text-dim truncate flex-1">{item.title}</span>
                <span className="text-xs text-court-concluded">{item.statusLabel}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="px-6 py-3 text-center text-xs text-court-text-dim border-t border-court-border mt-auto">
        CourtCall — Judge View
      </footer>
    </div>
  );
}

// ---- Judge-specific sub-components ----

function JudgeStatusBanner({ status }: { status: ReturnType<typeof import('../viewModel/courtDayViewModel').deriveCourtStatus> }) {
  const colorMap: Record<string, string> = {
    live: 'text-court-active bg-court-active-bg',
    judge_rose: 'text-court-danger bg-court-danger-bg',
    at_lunch: 'text-court-warning bg-court-warning-bg',
    adjourned: 'text-court-warning bg-court-warning-bg',
    ended: 'text-court-concluded bg-court-concluded-bg',
    scheduled: 'text-court-text-dim bg-court-surface-2',
  };
  return (
    <div className={`px-6 py-3 text-center border-b border-court-border ${colorMap[status.status] ?? colorMap.scheduled}`}>
      <span className="font-bold text-base tracking-widest uppercase">{status.label}</span>
      {status.message && <span className="ml-3 text-sm opacity-80">{status.message}</span>}
    </div>
  );
}

function JudgeActiveCard({ c }: { c: ActiveCaseView }) {
  return (
    <div className="mx-6 my-4 p-5 rounded-xl bg-court-active-bg border border-court-active/30">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-court-active font-semibold uppercase tracking-widest mb-1.5">
            Current Matter
          </p>
          <h2 className="text-2xl font-bold text-white leading-tight">{c.title}</h2>
          {c.caseNumber && <p className="text-sm text-court-text-dim mt-1">{c.caseNumber}</p>}
        </div>
        <JudgeBadge status={c.status} label={c.statusLabel} large />
      </div>
      <div className="mt-4 flex items-center gap-6 text-sm text-court-text-dim">
        {c.startedAt && <span>Started {c.startedAt}</span>}
        {c.estimatedMinutes != null && <span>~{c.estimatedMinutes} min remaining</span>}
      </div>
      {c.note && (
        <p className="mt-3 text-sm text-court-text-dim italic border-t border-court-active/20 pt-3">{c.note}</p>
      )}
    </div>
  );
}

function JudgeQueueRow({ item, index }: { item: QueueItemView; index: number }) {
  return (
    <div className={`flex items-center gap-4 py-2 ${item.isNotBefore ? 'pl-2 border-l-2 border-court-warning/50' : ''}`}>
      <span className="text-base font-mono text-court-text-dim w-6 text-right shrink-0">{index}</span>
      <div className="flex-1 min-w-0">
        <p className="text-base text-white truncate">{item.title}</p>
        {item.caseNumber && <p className="text-xs text-court-text-dim">{item.caseNumber}</p>}
      </div>
      <JudgeBadge status={item.status} label={item.statusLabel} />
      {item.timeLabel && (
        <span className={`text-sm font-medium ${item.isNotBefore ? 'text-court-warning' : 'text-court-text-dim'}`}>
          {item.timeLabel}
        </span>
      )}
    </div>
  );
}

function JudgeBadge({ status, label, large }: { status: string; label: string; large?: boolean }) {
  const cls: Record<string, string> = {
    pending: 'bg-court-surface-2 text-court-text-dim',
    calling: 'bg-court-warning-bg text-court-warning',
    hearing: 'bg-court-active-bg text-court-active',
    adjourned: 'bg-court-danger-bg text-court-danger',
    stood_down: 'bg-court-warning-bg text-court-warning',
    not_before: 'bg-court-surface-2 text-court-text-dim',
    concluded: 'bg-court-concluded-bg text-court-concluded',
    vacated: 'bg-court-concluded-bg text-court-concluded',
  };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded font-semibold uppercase tracking-wide ${
      large ? 'text-sm' : 'text-xs'
    } ${cls[status] ?? cls.pending}`}>
      {label}
    </span>
  );
}
