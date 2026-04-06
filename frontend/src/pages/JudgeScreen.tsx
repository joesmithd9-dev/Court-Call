import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCourtDayLoader } from '../hooks/useCourtDayLoader';
import { useCourtDayView } from '../viewModel/useCourtDayView';
import { fetchRegistrarCourtDay } from '../api/client';
import type {
  ActiveCaseView,
  QueueItemView,
  TimeBandGroup,
  MatterTypeGroup,
  CourtStatusView,
} from '../viewModel/courtDayViewModel';

type JudgeTab = 'list' | 'by_time' | 'by_type';

export function JudgeScreen() {
  const { courtDayId } = useParams<{ courtDayId: string }>();

  useCourtDayLoader({ courtDayId: courtDayId!, fetchFn: fetchRegistrarCourtDay });

  const vm = useCourtDayView('judge');
  const [activeTab, setActiveTab] = useState<JudgeTab>('list');
  const [gapMinutes, setGapMinutes] = useState<number | null>(null);

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

  const { meta, courtStatus, activeCase, nextUp, queue, concluded, timeBands, matterTypeGroups, getGapFillerMatters } = vm;
  const gapResults = gapMinutes != null ? getGapFillerMatters(gapMinutes) : null;

  return (
    <div className="flex flex-col min-h-dvh">
      {/* Header */}
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

      {meta.criticalError && (
        <div className="px-6 py-3 bg-court-danger text-white text-center font-bold">{meta.criticalError}</div>
      )}

      <StatusBanner status={courtStatus} />

      {/* Active case — always visible */}
      {activeCase ? (
        <ActiveCard c={activeCase} />
      ) : (
        <div className="px-6 py-8 text-center">
          <p className="text-court-text-dim text-lg">
            {courtStatus.isEnded ? 'Court has concluded for the day' : 'No case currently before the court'}
          </p>
        </div>
      )}

      {/* Gap Filler bar — always visible */}
      <GapFillerBar
        gapMinutes={gapMinutes}
        onSelect={setGapMinutes}
        resultCount={gapResults?.length ?? 0}
      />

      {/* Gap filler results overlay queue when active */}
      {gapResults ? (
        <div className="px-6 py-4 flex-1 overflow-y-auto">
          <h3 className="text-xs text-court-text-dim font-semibold uppercase tracking-widest mb-3">
            Fits in {gapMinutes} min ({gapResults.length} matters)
          </h3>
          <div className="space-y-2">
            {gapResults.map((item, i) => (
              <JudgeRow key={item.id} item={item} index={i + 1} />
            ))}
            {gapResults.length === 0 && (
              <p className="text-court-text-dim text-sm py-4 text-center">No matters fit within {gapMinutes} minutes</p>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="flex border-b border-court-border">
            {([['list', 'List'], ['by_time', 'By Time'], ['by_type', 'By Type']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-widest transition-colors ${
                  activeTab === key
                    ? 'text-white border-b-2 border-court-active'
                    : 'text-court-text-dim hover:text-court-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'list' && (
              <ListTab nextUp={nextUp} queue={queue} concluded={concluded} />
            )}
            {activeTab === 'by_time' && (
              <ByTimeTab bands={timeBands} />
            )}
            {activeTab === 'by_type' && (
              <ByTypeTab groups={matterTypeGroups} />
            )}
          </div>
        </>
      )}

      <footer className="px-6 py-3 text-center text-xs text-court-text-dim border-t border-court-border mt-auto">
        CourtCall — Judge View
      </footer>
    </div>
  );
}

// ---- Gap Filler Bar ----

function GapFillerBar({
  gapMinutes,
  onSelect,
  resultCount,
}: {
  gapMinutes: number | null;
  onSelect: (m: number | null) => void;
  resultCount: number;
}) {
  const options = [5, 10, 15, 20, 30];
  return (
    <div className="px-6 py-3 bg-court-surface-2 border-b border-court-border">
      <div className="flex items-center gap-2">
        <span className="text-xs text-court-text-dim font-semibold uppercase tracking-widest shrink-0">Gap?</span>
        {options.map((m) => (
          <button
            key={m}
            onClick={() => onSelect(gapMinutes === m ? null : m)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              gapMinutes === m
                ? 'bg-court-active/20 text-court-active'
                : 'bg-court-surface text-court-text-dim hover:bg-court-border'
            }`}
          >
            {m}m
          </button>
        ))}
        {gapMinutes != null && (
          <button
            onClick={() => onSelect(null)}
            className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium text-court-text-dim hover:text-white"
          >
            Clear ({resultCount})
          </button>
        )}
      </div>
    </div>
  );
}

// ---- List Tab (default) ----

function ListTab({
  nextUp,
  queue,
  concluded,
}: {
  nextUp: QueueItemView[];
  queue: QueueItemView[];
  concluded: { id: string; position: number; title: string; statusLabel: string }[];
}) {
  const remaining = queue.slice(nextUp.length);

  return (
    <>
      {nextUp.length > 0 && (
        <div className="px-6 py-4 border-b border-court-border">
          <h3 className="text-xs text-court-text-dim font-semibold uppercase tracking-widest mb-3">Next Up</h3>
          <div className="space-y-3">
            {nextUp.map((item, i) => (
              <JudgeRow key={item.id} item={item} index={i + 1} />
            ))}
          </div>
        </div>
      )}

      {remaining.length > 0 && (
        <div className="px-6 py-4 border-b border-court-border">
          <h3 className="text-xs text-court-text-dim font-semibold uppercase tracking-widest mb-3">
            Remaining ({remaining.length})
          </h3>
          <div className="space-y-1.5">
            {remaining.map((item) => (
              <JudgeRowCompact key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {concluded.length > 0 && (
        <div className="px-6 py-3">
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
    </>
  );
}

// ---- By Time Tab ----

function ByTimeTab({ bands }: { bands: TimeBandGroup[] }) {
  if (bands.length === 0) {
    return <p className="px-6 py-8 text-court-text-dim text-center">No pending matters</p>;
  }
  return (
    <div className="px-6 py-4 space-y-5">
      {bands.map((band) => (
        <div key={band.label}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-white">{band.label}</h3>
            <span className="text-xs text-court-text-dim">
              {band.items.length} matter{band.items.length !== 1 ? 's' : ''} — {band.totalMinutes}m total
            </span>
          </div>
          <div className="space-y-1.5">
            {band.items.map((item) => (
              <JudgeRowCompact key={item.id} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- By Type Tab ----

function ByTypeTab({ groups }: { groups: MatterTypeGroup[] }) {
  if (groups.length === 0) {
    return <p className="px-6 py-8 text-court-text-dim text-center">No pending matters</p>;
  }
  return (
    <div className="px-6 py-4 space-y-5">
      {groups.map((group) => (
        <div key={group.type}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-white">{group.label}</h3>
            <span className="text-xs text-court-text-dim">
              {group.items.length} — avg {group.averageMinutes}m — {group.totalMinutes}m total
            </span>
          </div>
          <div className="space-y-1.5">
            {group.items.map((item) => (
              <JudgeRowCompact key={item.id} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- Shared Judge Row Components ----

function JudgeRow({ item, index }: { item: QueueItemView; index: number }) {
  return (
    <div className={`flex items-center gap-4 py-2 ${item.isNotBefore ? 'pl-2 border-l-2 border-court-warning/50' : ''}`}>
      <span className="text-base font-mono text-court-text-dim w-6 text-right shrink-0">{index}</span>
      <div className="flex-1 min-w-0">
        <p className="text-base text-white truncate">{item.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {item.caseNumber && <span className="text-xs text-court-text-dim">{item.caseNumber}</span>}
          {item.matterTypeLabel && (
            <span className="text-xs text-court-text-dim bg-court-surface-2 px-1.5 py-0.5 rounded">{item.matterTypeLabel}</span>
          )}
        </div>
      </div>
      <DurationBadge minutes={item.estimatedMinutes} color={item.durationColor} label={item.durationLabel} />
      <Badge status={item.status} label={item.statusLabel} />
      {item.timeLabel && (
        <span className={`text-sm font-medium shrink-0 ${item.isNotBefore ? 'text-court-warning' : 'text-court-text-dim'}`}>
          {item.timeLabel}
        </span>
      )}
    </div>
  );
}

function JudgeRowCompact({ item }: { item: QueueItemView }) {
  return (
    <div className={`flex items-center gap-3 py-1.5 ${item.isNotBefore ? 'pl-2 border-l-2 border-court-warning/50' : ''}`}>
      <span className="text-sm font-mono text-court-text-dim w-6 text-right shrink-0">{item.position}</span>
      <span className="text-sm text-court-text truncate flex-1">{item.title}</span>
      {item.matterTypeLabel && (
        <span className="text-xs text-court-text-dim bg-court-surface-2 px-1.5 py-0.5 rounded shrink-0">{item.matterTypeLabel}</span>
      )}
      <DurationBadge minutes={item.estimatedMinutes} color={item.durationColor} label={item.durationLabel} />
      <Badge status={item.status} label={item.statusLabel} />
      {item.timeLabel && <span className="text-xs text-court-text-dim shrink-0">{item.timeLabel}</span>}
    </div>
  );
}

function DurationBadge({ minutes, color, label }: { minutes: number | undefined; color: string; label: string }) {
  if (minutes == null) return null;
  return (
    <span className={`text-xs font-bold tabular-nums shrink-0 ${color}`}>
      {label}
    </span>
  );
}

function ActiveCard({ c }: { c: ActiveCaseView }) {
  return (
    <div className="mx-6 my-4 p-5 rounded-xl bg-court-active-bg border border-court-active/30">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-court-active font-semibold uppercase tracking-widest mb-1.5">Current Matter</p>
          <h2 className="text-2xl font-bold text-white leading-tight">{c.title}</h2>
          <div className="flex items-center gap-2 mt-1">
            {c.caseNumber && <span className="text-sm text-court-text-dim">{c.caseNumber}</span>}
            {c.matterTypeLabel && (
              <span className="text-xs text-court-active/70 bg-court-active/10 px-1.5 py-0.5 rounded">{c.matterTypeLabel}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Badge status={c.status} label={c.statusLabel} large />
          {c.estimatedMinutes != null && (
            <span className={`text-sm font-bold ${c.durationColor}`}>{c.durationLabel}</span>
          )}
        </div>
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

function StatusBanner({ status }: { status: CourtStatusView }) {
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

function Badge({ status, label, large }: { status: string; label: string; large?: boolean }) {
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
    <span className={`inline-block px-2.5 py-0.5 rounded font-semibold uppercase tracking-wide shrink-0 ${
      large ? 'text-sm' : 'text-xs'
    } ${cls[status] ?? cls.pending}`}>
      {label}
    </span>
  );
}
