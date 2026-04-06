import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCourtDayLoader } from '../hooks/useCourtDayLoader';
import { useCourtDayView } from '../viewModel/useCourtDayView';
import { fetchRegistrarCourtDay } from '../api/client';
import type {
  QueueItemView,
  CourtStatusView,
} from '../viewModel/courtDayViewModel';

type JudgeView = 'list' | 'by_time' | 'by_type';

export function JudgeScreen() {
  const { courtDayId } = useParams<{ courtDayId: string }>();

  useCourtDayLoader({ courtDayId: courtDayId!, fetchFn: fetchRegistrarCourtDay });

  const vm = useCourtDayView('judge');
  const [view, setView] = useState<JudgeView>('list');
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

  const { meta, courtStatus, activeCase, fullList, timeBands, matterTypeGroups, getGapFillerMatters } = vm;
  const gapResults = gapMinutes != null ? getGapFillerMatters(gapMinutes) : null;
  const pendingCount = fullList.filter(i => i.status !== 'concluded' && i.status !== 'vacated').length;
  const totalEstMin = fullList
    .filter(i => i.status !== 'concluded' && i.status !== 'vacated')
    .reduce((s, i) => s + (i.estimatedMinutes ?? 0), 0);

  return (
    <div className="flex flex-col min-h-dvh">
      {/* Header */}
      <header className="px-6 py-3 bg-court-surface border-b border-court-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">
              {meta.courtName}
              {meta.courtRoom && <span className="text-court-text-dim font-normal"> — {meta.courtRoom}</span>}
            </h1>
            <p className="text-sm text-court-text-dim">{meta.judgeName} — {meta.dateLabel}</p>
          </div>
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${meta.connected ? 'bg-court-active' : 'bg-court-danger'}`} />
        </div>
      </header>

      {meta.criticalError && (
        <div className="px-6 py-2 bg-court-danger text-white text-center text-sm font-bold">{meta.criticalError}</div>
      )}

      <StatusBanner status={courtStatus} />

      {/* Active case — compact prominent strip */}
      {activeCase ? (
        <div className="px-6 py-3 bg-court-active-bg/40 border-b border-court-active/20">
          <div className="flex items-center gap-3">
            <span className="text-xs text-court-active font-bold uppercase tracking-widest shrink-0">Now</span>
            <span className="text-base text-white font-semibold truncate flex-1">{activeCase.title}</span>
            {activeCase.matterTypeLabel && (
              <span className="text-xs text-court-active/70 bg-court-active/10 px-1.5 py-0.5 rounded shrink-0">{activeCase.matterTypeLabel}</span>
            )}
            {activeCase.estimatedMinutes != null && (
              <span className={`text-sm font-bold tabular-nums ${activeCase.durationColor}`}>{activeCase.durationLabel}</span>
            )}
            <Badge status={activeCase.status} label={activeCase.statusLabel} />
          </div>
          <div className="flex items-center gap-4 mt-1 ml-10 text-xs text-court-text-dim">
            {activeCase.startedAt && <span>Started {activeCase.startedAt}</span>}
            {activeCase.caseNumber && <span>{activeCase.caseNumber}</span>}
            {activeCase.note && <span className="italic">{activeCase.note}</span>}
          </div>
        </div>
      ) : (
        !courtStatus.isEnded && (
          <div className="px-6 py-4 text-center text-court-text-dim">No case currently before the court</div>
        )
      )}

      {/* Summary + view toggle + gap filler */}
      <div className="px-6 py-2 bg-court-surface-2 border-b border-court-border">
        <div className="flex items-center gap-2">
          <span className="text-xs text-court-text-dim">{fullList.length} matters</span>
          <span className="text-xs text-court-active">{pendingCount} remaining</span>
          {totalEstMin > 0 && <span className="text-xs text-court-text-dim">~{totalEstMin}m</span>}

          <div className="ml-auto flex items-center gap-1">
            {/* View tabs */}
            {(['list', 'by_time', 'by_type'] as const).map((v) => (
              <button
                key={v}
                onClick={() => { setView(v); setGapMinutes(null); }}
                className={`px-2 py-1 rounded text-[10px] font-semibold uppercase ${
                  view === v && gapMinutes == null ? 'bg-court-active/20 text-court-active' : 'text-court-text-dim hover:text-white'
                }`}
              >
                {v === 'list' ? 'List' : v === 'by_time' ? 'Time' : 'Type'}
              </button>
            ))}
            <span className="text-court-border mx-1">|</span>
            {/* Gap filler */}
            {[5, 10, 15, 20].map((m) => (
              <button
                key={m}
                onClick={() => setGapMinutes(gapMinutes === m ? null : m)}
                className={`px-1.5 py-1 rounded text-[10px] font-semibold ${
                  gapMinutes === m ? 'bg-court-warning/20 text-court-warning' : 'text-court-text-dim hover:text-white'
                }`}
              >
                {m}m
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto">
        {gapResults ? (
          <div className="px-6 py-4">
            <h3 className="text-xs text-court-warning font-semibold uppercase tracking-widest mb-3">
              Fits in {gapMinutes}m — {gapResults.length} matter{gapResults.length !== 1 ? 's' : ''}
            </h3>
            {gapResults.length === 0 ? (
              <p className="text-court-text-dim text-sm py-4 text-center">Nothing fits</p>
            ) : (
              <div className="space-y-1">
                {gapResults.map((item, i) => (
                  <JudgeRow key={item.id} item={item} index={i + 1} isCurrent={activeCase?.id === item.id} />
                ))}
              </div>
            )}
          </div>
        ) : view === 'list' ? (
          /* Full callover list — THE primary view */
          <div className="px-6 py-3">
            <div className="space-y-0.5">
              {fullList.map((item) => (
                <JudgeRow
                  key={item.id}
                  item={item}
                  index={item.position}
                  isCurrent={activeCase?.id === item.id}
                />
              ))}
            </div>
          </div>
        ) : view === 'by_time' ? (
          <div className="px-6 py-4 space-y-5">
            {timeBands.length === 0 ? (
              <p className="text-court-text-dim text-center">No pending matters</p>
            ) : timeBands.map((band) => (
              <div key={band.label}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-white">{band.label}</h3>
                  <span className="text-xs text-court-text-dim">{band.items.length} — {band.totalMinutes}m total</span>
                </div>
                <div className="space-y-0.5">
                  {band.items.map((item) => (
                    <JudgeRow key={item.id} item={item} index={item.position} isCurrent={activeCase?.id === item.id} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-4 space-y-5">
            {matterTypeGroups.length === 0 ? (
              <p className="text-court-text-dim text-center">No pending matters</p>
            ) : matterTypeGroups.map((group) => (
              <div key={group.type}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-white">{group.label}</h3>
                  <span className="text-xs text-court-text-dim">
                    {group.items.length} — avg {group.averageMinutes}m — {group.totalMinutes}m total
                  </span>
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <JudgeRow key={item.id} item={item} index={item.position} isCurrent={activeCase?.id === item.id} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="px-6 py-2 text-center text-xs text-court-text-dim border-t border-court-border">
        CourtCall — Judge View
      </footer>
    </div>
  );
}

// ---- Shared Judge Row ----

function JudgeRow({ item, index, isCurrent }: { item: QueueItemView; index: number; isCurrent: boolean }) {
  const isDone = item.status === 'concluded' || item.status === 'vacated';
  return (
    <div className={`flex items-center gap-3 py-2 px-2 rounded ${
      isCurrent ? 'bg-court-active-bg/30' :
      isDone ? 'opacity-40' :
      item.isNotBefore ? 'border-l-2 border-l-court-warning/50' :
      ''
    }`}>
      <span className="text-sm font-mono text-court-text-dim w-6 text-right shrink-0">{index}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${isCurrent ? 'text-white font-semibold' : isDone ? 'text-court-text-dim line-through' : 'text-white'}`}>
          {item.title}
        </p>
        {(item.caseNumber || item.note) && (
          <p className="text-[10px] text-court-text-dim truncate">
            {item.caseNumber}{item.caseNumber && item.note ? ' — ' : ''}{item.note && <span className="italic">{item.note}</span>}
          </p>
        )}
      </div>
      {item.matterTypeLabel && (
        <span className="text-[10px] text-court-text-dim bg-court-surface-2 px-1 py-0.5 rounded shrink-0">{item.matterTypeLabel}</span>
      )}
      {item.durationLabel && (
        <span className={`text-xs font-bold tabular-nums shrink-0 ${item.durationColor}`}>{item.durationLabel}</span>
      )}
      <Badge status={item.status} label={item.statusLabel} />
      {item.timeLabel && (
        <span className={`text-[10px] shrink-0 ${item.isNotBefore ? 'text-court-warning font-medium' : 'text-court-text-dim'}`}>
          {item.timeLabel}
        </span>
      )}
    </div>
  );
}

// ---- Sub-components ----

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
    <div className={`px-6 py-2 text-center border-b border-court-border ${colorMap[status.status] ?? colorMap.scheduled}`}>
      <span className="font-bold text-sm tracking-widest uppercase">{status.label}</span>
      {status.message && <span className="ml-3 text-sm opacity-80">{status.message}</span>}
    </div>
  );
}

function Badge({ status, label }: { status: string; label: string }) {
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
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide shrink-0 ${cls[status] ?? cls.pending}`}>
      {label}
    </span>
  );
}
