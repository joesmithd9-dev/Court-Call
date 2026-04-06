import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useCourtDayLoader } from '../hooks/useCourtDayLoader';
import { useCourtDayView } from '../viewModel/useCourtDayView';
import { fetchRegistrarCourtDay } from '../api/client';
import type { QueueItemView, CourtStatusView } from '../viewModel/courtDayViewModel';

type JudgeView = 'current' | 'short' | 'stood' | 'list';

const RISE_PRESETS = ['12:00', '13:00', '14:00', '15:00', '15:30', '16:00', '16:30'];

export function JudgeScreen() {
  const { courtDayId } = useParams<{ courtDayId: string }>();

  useCourtDayLoader({ courtDayId: courtDayId!, fetchFn: fetchRegistrarCourtDay });

  const vm = useCourtDayView('judge');
  const [view, setView] = useState<JudgeView>('current');
  const [riseTime, setRiseTime] = useState<string | null>(null);
  const [showRisePicker, setShowRisePicker] = useState(false);
  const [customRiseTime, setCustomRiseTime] = useState('');

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

  const { meta, courtStatus, activeCase, fullList, timeBands, matterTypeGroups } = vm;

  // Derived data
  const stoodDownItems = fullList.filter(i => i.status === 'stood_down');
  const pendingItems = fullList.filter(i => i.status !== 'concluded' && i.status !== 'vacated');
  const totalEstMin = pendingItems.reduce((s, i) => s + (i.estimatedMinutes ?? 0), 0);
  const nextItems = fullList.filter(
    i => i.id !== activeCase?.id && i.status !== 'concluded' && i.status !== 'vacated'
  ).slice(0, 5);

  // Rise time calculation
  const riseTimeInfo = useMemo(() => {
    if (!riseTime) return null;
    const [h, m] = riseTime.split(':').map(Number);
    const riseDate = new Date();
    riseDate.setHours(h, m, 0, 0);
    const now = new Date();
    const remainingMinutes = Math.max(0, Math.round((riseDate.getTime() - now.getTime()) / 60000));
    const overrun = totalEstMin > remainingMinutes;
    return { time: riseTime, remainingMinutes, overrun, totalEstMin };
  }, [riseTime, totalEstMin]);

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
          <div className="flex items-center gap-3 shrink-0">
            {/* Rise time display / toggle */}
            <button
              onClick={() => setShowRisePicker(!showRisePicker)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                riseTime
                  ? riseTimeInfo?.overrun
                    ? 'bg-court-danger/20 text-court-danger'
                    : 'bg-court-surface-2 text-court-text'
                  : 'bg-court-surface-2 text-court-text-dim'
              }`}
            >
              {riseTime ? `Rise ${riseTime}` : 'Set rise'}
            </button>
            <span className={`w-2.5 h-2.5 rounded-full ${meta.connected ? 'bg-court-active' : 'bg-court-danger'}`} />
          </div>
        </div>
      </header>

      {meta.criticalError && (
        <div className="px-6 py-2 bg-court-danger text-white text-center text-sm font-bold">{meta.criticalError}</div>
      )}

      <StatusBanner status={courtStatus} />

      {/* Rise time picker */}
      {showRisePicker && (
        <div className="px-6 py-3 bg-court-surface-2 border-b border-court-border">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-court-text-dim font-semibold shrink-0">Rise at:</span>
            {RISE_PRESETS.map((t) => (
              <button
                key={t}
                onClick={() => { setRiseTime(t); setShowRisePicker(false); }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                  riseTime === t ? 'bg-court-active/20 text-court-active' : 'bg-court-surface text-court-text-dim hover:bg-court-border'
                }`}
              >
                {t}
              </button>
            ))}
            <input
              type="time"
              value={customRiseTime}
              onChange={(e) => setCustomRiseTime(e.target.value)}
              className="bg-court-surface text-white rounded-lg px-2 py-1.5 text-xs border border-court-border focus:border-court-active outline-none w-20"
            />
            {customRiseTime && (
              <button
                onClick={() => { setRiseTime(customRiseTime); setShowRisePicker(false); }}
                className="px-2 py-1.5 rounded-lg text-xs font-semibold bg-court-active/20 text-court-active"
              >
                Set
              </button>
            )}
            {riseTime && (
              <button
                onClick={() => { setRiseTime(null); setShowRisePicker(false); }}
                className="px-2 py-1.5 rounded-lg text-xs text-court-text-dim hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Rise time allocation bar */}
      {riseTimeInfo && (
        <div className={`px-6 py-2 border-b border-court-border text-xs font-medium ${
          riseTimeInfo.overrun ? 'bg-court-danger-bg text-court-danger' : 'bg-court-surface-2 text-court-text-dim'
        }`}>
          <div className="flex items-center justify-between">
            <span>Rise {riseTimeInfo.time} — {riseTimeInfo.remainingMinutes}m available</span>
            <span>
              {riseTimeInfo.totalEstMin}m estimated
              {riseTimeInfo.overrun && ` — ${riseTimeInfo.totalEstMin - riseTimeInfo.remainingMinutes}m over`}
            </span>
          </div>
        </div>
      )}

      {/* View tabs */}
      <div className="flex border-b border-court-border">
        {([
          ['current', 'Current'],
          ['short', 'Short / Type'],
          ['stood', `Let Stand (${stoodDownItems.length})`],
          ['list', 'Full List'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex-1 py-2.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
              view === key ? 'text-white border-b-2 border-court-active' : 'text-court-text-dim hover:text-court-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* View content */}
      <div className="flex-1 overflow-y-auto">
        {view === 'current' && (
          <CurrentView activeCase={activeCase ? fullList.find(i => i.id === activeCase.id) : undefined} nextItems={nextItems} />
        )}
        {view === 'short' && (
          <ShortAndTypeView timeBands={timeBands} matterTypeGroups={matterTypeGroups} activeCase={activeCase} />
        )}
        {view === 'stood' && (
          <StoodDownView items={stoodDownItems} />
        )}
        {view === 'list' && (
          <FullListView items={fullList} activeCaseId={activeCase?.id} />
        )}
      </div>

      <footer className="px-6 py-2 text-center text-xs text-court-text-dim border-t border-court-border">
        CourtCall — Judge View
      </footer>
    </div>
  );
}

// ---- Current + Next view ----

function CurrentView({
  activeCase,
  nextItems,
}: {
  activeCase: QueueItemView | undefined;
  nextItems: QueueItemView[];
}) {
  return (
    <div className="px-6 py-4">
      {activeCase ? (
        <div className="mb-6">
          <p className="text-xs text-court-active font-bold uppercase tracking-widest mb-2">Current Matter</p>
          <div className="p-4 rounded-xl bg-court-active-bg border border-court-active/30">
            <h2 className="text-2xl font-bold text-white leading-tight">{activeCase.title}</h2>
            <div className="flex items-center gap-3 mt-2">
              {activeCase.caseNumber && <span className="text-sm text-court-text-dim">{activeCase.caseNumber}</span>}
              {activeCase.matterTypeLabel && (
                <span className="text-xs text-court-active/70 bg-court-active/10 px-1.5 py-0.5 rounded">{activeCase.matterTypeLabel}</span>
              )}
              {activeCase.durationLabel && (
                <span className={`text-sm font-bold ${activeCase.durationColor}`}>{activeCase.durationLabel}</span>
              )}
              <Badge status={activeCase.status} label={activeCase.statusLabel} />
            </div>
            {activeCase.note && (
              <p className="mt-3 text-sm text-court-text-dim italic border-t border-court-active/20 pt-2">{activeCase.note}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="py-8 text-center">
          <p className="text-court-text-dim text-lg">No case currently before the court</p>
        </div>
      )}

      {nextItems.length > 0 && (
        <div>
          <p className="text-xs text-court-text-dim font-bold uppercase tracking-widest mb-3">Next Up</p>
          <div className="space-y-2">
            {nextItems.map((item, i) => (
              <JudgeRow key={item.id} item={item} index={i + 1} highlight={i === 0} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Short Matters + By Type ----

function ShortAndTypeView({
  timeBands,
  matterTypeGroups,
  activeCase,
}: {
  timeBands: { label: string; items: QueueItemView[]; totalMinutes: number }[];
  matterTypeGroups: { label: string; items: QueueItemView[]; totalMinutes: number; averageMinutes: number }[];
  activeCase: { id: string } | null;
}) {
  return (
    <div className="px-6 py-4 space-y-6">
      {/* Short matters first */}
      <div>
        <p className="text-xs text-court-text-dim font-bold uppercase tracking-widest mb-3">By Duration</p>
        {timeBands.length === 0 ? (
          <p className="text-court-text-dim text-sm">No pending matters</p>
        ) : (
          <div className="space-y-4">
            {timeBands.map((band) => (
              <div key={band.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-sm font-semibold text-white">{band.label}</h3>
                  <span className="text-xs text-court-text-dim">{band.items.length} — {band.totalMinutes}m</span>
                </div>
                <div className="space-y-0.5">
                  {band.items.map(item => (
                    <JudgeRow key={item.id} item={item} index={item.position} highlight={activeCase?.id === item.id} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* By type */}
      <div>
        <p className="text-xs text-court-text-dim font-bold uppercase tracking-widest mb-3">By Type</p>
        {matterTypeGroups.length === 0 ? (
          <p className="text-court-text-dim text-sm">No pending matters</p>
        ) : (
          <div className="space-y-4">
            {matterTypeGroups.map((group) => (
              <div key={group.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-sm font-semibold text-white">{group.label}</h3>
                  <span className="text-xs text-court-text-dim">
                    {group.items.length} — avg {group.averageMinutes}m — {group.totalMinutes}m
                  </span>
                </div>
                <div className="space-y-0.5">
                  {group.items.map(item => (
                    <JudgeRow key={item.id} item={item} index={item.position} highlight={activeCase?.id === item.id} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Let Stand ----

function StoodDownView({ items }: { items: QueueItemView[] }) {
  return (
    <div className="px-6 py-4">
      <p className="text-xs text-court-text-dim font-bold uppercase tracking-widest mb-3">Let Stand</p>
      {items.length === 0 ? (
        <p className="text-court-text-dim text-sm py-4 text-center">None let stand</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <JudgeRow key={item.id} item={item} index={item.position} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Full List ----

function FullListView({ items, activeCaseId }: { items: QueueItemView[]; activeCaseId: string | undefined }) {
  return (
    <div className="px-6 py-3">
      <div className="space-y-0.5">
        {items.map((item) => (
          <JudgeRow key={item.id} item={item} index={item.position} highlight={item.id === activeCaseId} />
        ))}
      </div>
    </div>
  );
}

// ---- Shared Judge Row ----

function JudgeRow({ item, index, highlight }: { item: QueueItemView; index: number; highlight?: boolean }) {
  const isDone = item.status === 'concluded' || item.status === 'vacated';
  return (
    <div className={`flex items-center gap-3 py-2 px-2 rounded ${
      highlight ? 'bg-court-active-bg/30' :
      isDone ? 'opacity-40' :
      item.isNotBefore ? 'border-l-2 border-l-court-warning/50' :
      ''
    }`}>
      <span className="text-sm font-mono text-court-text-dim w-6 text-right shrink-0">{index}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${highlight ? 'text-white font-semibold' : isDone ? 'text-court-text-dim line-through' : 'text-white'}`}>
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
