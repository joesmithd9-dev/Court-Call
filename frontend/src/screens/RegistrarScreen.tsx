import { useState } from 'react';
import { useCourtStore } from '../store/useCourtStore';
import { CourtStatusBanner } from '../components/CourtStatusBanner';
import { LiveMatterCard } from '../components/LiveMatterCard';
import { QueueRow } from '../components/QueueRow';
import { SectionHeader } from '../components/SectionHeader';
import { DurationBadge } from '../components/DurationBadge';
import { StatusBadge } from '../components/StatusBadge';
import { TypeBadge } from '../components/TypeBadge';
import { GapFillerBar } from '../components/GapFillerBar';

type Tab = 'live' | 'callover' | 'builder' | 'breakdown';
type BuilderSub = 'full' | 'callover' | 'runthrough';
type BreakdownSub = 'time' | 'type' | 'gap';

const DURATION_CHIPS = [5, 10, 15, 20, 30, 45, 60];

export function RegistrarScreen() {
  const [tab, setTab] = useState<Tab>('live');
  const [builderSub, setBuilderSub] = useState<BuilderSub>('full');
  const [breakdownSub, setBreakdownSub] = useState<BreakdownSub>('time');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);

  const store = useCourtStore();
  const court = store.court;
  const active = store.activeMatter();
  const pending = store.pendingMatters();
  const unanswered = store.unansweredMatters();
  const concluded = store.concludedMatters();
  const next = store.nextMatters();
  const byType = store.mattersByType();
  const byDuration = store.mattersByDuration();

  const allMatters = store.matters.sort((a, b) => a.position - b.position);
  const totalMinutes = allMatters.filter(m => m.status !== 'CONCLUDED' && m.status !== 'ADJOURNED' && m.status !== 'UNANSWERED').reduce((s, m) => s + m.estimatedMinutes, 0);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'live', label: 'Live' },
    { key: 'callover', label: 'Callover' },
    { key: 'builder', label: 'List Builder' },
    { key: 'breakdown', label: 'Breakdown' },
  ];

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Court Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-100 font-serif">{court.courtName}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{court.judgeName} · {court.date}</p>
      </div>
      <CourtStatusBanner status={court.status} />

      {/* Tabs */}
      <div className="flex bg-slate-800/80 border-b border-slate-700">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-colors font-serif ${
              tab === t.key ? 'text-amber-400 border-amber-400 bg-slate-800' : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto bg-slate-900">
        {/* ═══ LIVE TAB ═══ */}
        {tab === 'live' && (
          <>
            {active ? (
              <>
                <LiveMatterCard matter={active} />
                {/* Primary Actions */}
                <div className="px-4 py-2 flex flex-wrap gap-2 bg-slate-800/50 border-b border-slate-700/50">
                  <button onClick={() => store.addTime(active.id, 5)} className="px-3 py-1.5 rounded text-xs font-semibold bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600 font-serif">+5 min</button>
                  <button onClick={() => store.addTime(active.id, 10)} className="px-3 py-1.5 rounded text-xs font-semibold bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600 font-serif">+10 min</button>
                  <button onClick={() => store.concludeMatter(active.id)} className="px-3 py-1.5 rounded text-xs font-semibold bg-emerald-900/40 text-emerald-300 border border-emerald-700 hover:bg-emerald-900/60 font-serif">Concluded</button>
                  <button onClick={() => store.adjournMatter(active.id)} className="px-3 py-1.5 rounded text-xs font-semibold bg-red-900/30 text-red-300 border border-red-700 hover:bg-red-900/50 font-serif">Adjourn</button>
                  <button onClick={() => store.letStandMatter(active.id)} className="px-3 py-1.5 rounded text-xs font-semibold bg-amber-900/30 text-amber-300 border border-amber-700 hover:bg-amber-900/50 font-serif">Let Stand</button>
                </div>
              </>
            ) : (
              <div className="mx-4 my-3 p-4 bg-slate-800/50 border border-slate-700 rounded text-center text-sm text-slate-400 font-serif">
                No matter currently before the court
              </div>
            )}

            {/* Next Up */}
            <SectionHeader label="Next up" count={next.length} />
            {next.map(m => (
              <div key={m.id}>
                <QueueRow matter={m} variant="registrar" onClick={() => setExpandedId(expandedId === m.id ? null : m.id)} />
                {expandedId === m.id && (
                  <div className="flex flex-wrap gap-2 px-4 py-2 bg-slate-800/70 border-b border-slate-700/50 pl-12">
                    <button onClick={() => store.startMatter(m.id)} className="px-3 py-1.5 rounded text-xs font-semibold bg-emerald-900/40 text-emerald-300 border border-emerald-700 font-serif">Start</button>
                    <button onClick={() => store.callMatter(m.id)} className="px-3 py-1.5 rounded text-xs font-semibold bg-blue-900/30 text-blue-300 border border-blue-700 font-serif">Call</button>
                    <button onClick={() => store.markUnanswered(m.id)} className="px-3 py-1.5 rounded text-xs font-semibold bg-amber-900/30 text-amber-300 border border-amber-700 font-serif">Unanswered</button>
                  </div>
                )}
              </div>
            ))}
            {next.length > 0 && (
              <div className="px-4 py-3">
                <button onClick={() => store.startNext()} className="w-full py-2.5 rounded text-sm font-semibold bg-slate-700 text-slate-100 border border-slate-600 hover:bg-slate-600 font-serif transition-colors">
                  Start Next Case
                </button>
              </div>
            )}

            {/* Unanswered */}
            {unanswered.length > 0 && (
              <>
                <SectionHeader label="Unanswered" count={unanswered.length} />
                {unanswered.map(m => <QueueRow key={m.id} matter={m} variant="registrar" />)}
              </>
            )}

            {/* Concluded */}
            {concluded.length > 0 && (
              <>
                <SectionHeader label="Concluded" count={concluded.length} />
                {concluded.map(m => <QueueRow key={m.id} matter={m} variant="registrar" />)}
              </>
            )}
          </>
        )}

        {/* ═══ CALLOVER TAB ═══ */}
        {tab === 'callover' && (
          <>
            <SectionHeader label="Callover" count={pending.length + unanswered.length} />
            {[...pending, ...unanswered].map(m => (
              <div key={m.id}>
                <QueueRow matter={m} variant="registrar" onClick={() => setExpandedId(expandedId === m.id ? null : m.id)} />
                {expandedId === m.id && (
                  <div className="px-4 py-3 bg-slate-800/70 border-b border-slate-700/50 pl-10 space-y-3">
                    {/* Duration chips */}
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 font-serif">Duration</div>
                      <div className="flex flex-wrap gap-1.5">
                        {DURATION_CHIPS.map(d => (
                          <button
                            key={d}
                            onClick={() => store.setDuration(m.id, d)}
                            className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors font-serif ${
                              m.estimatedMinutes === d
                                ? 'bg-amber-600 text-white border-amber-500'
                                : 'bg-slate-700 text-slate-300 border-slate-600 hover:border-amber-600'
                            }`}
                          >
                            {d}m
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Toggles */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => store.setReady(m.id, !m.isReady)}
                        className={`px-3 py-1.5 rounded text-xs font-semibold border font-serif ${
                          m.isReady ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700' : 'bg-slate-700 text-slate-400 border-slate-600'
                        }`}
                      >
                        {m.isReady ? '✓ Ready' : 'Ready'}
                      </button>
                      <button
                        onClick={() => store.setPresent(m.id, !m.isPresent)}
                        className={`px-3 py-1.5 rounded text-xs font-semibold border font-serif ${
                          m.isPresent ? 'bg-sky-900/40 text-sky-300 border-sky-700' : 'bg-slate-700 text-slate-400 border-slate-600'
                        }`}
                      >
                        {m.isPresent ? '✓ Present' : 'Present'}
                      </button>
                      <button
                        onClick={() => store.markUnanswered(m.id)}
                        className="px-3 py-1.5 rounded text-xs font-semibold bg-amber-900/30 text-amber-300 border border-amber-700 font-serif"
                      >
                        Unanswered
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* ═══ LIST BUILDER TAB ═══ */}
        {tab === 'builder' && (
          <>
            <div className="flex bg-slate-800/60 border-b border-slate-700">
              {([['full', 'Full List'], ['callover', 'Callover'], ['runthrough', 'Run-through']] as const).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setBuilderSub(k)}
                  className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 font-serif ${
                    builderSub === k ? 'text-sky-400 border-sky-400' : 'text-slate-500 border-transparent'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            {builderSub === 'full' && (
              <>
                <div className="px-4 py-2 flex justify-between items-center border-b border-slate-700/50">
                  <span className="text-xs text-slate-400">{allMatters.length} matters · {totalMinutes}m total</span>
                  <button
                    onClick={() => setReorderMode(!reorderMode)}
                    className={`px-3 py-1 rounded text-xs font-semibold border font-serif ${
                      reorderMode ? 'bg-sky-900/40 text-sky-300 border-sky-700' : 'bg-slate-700 text-slate-400 border-slate-600'
                    }`}
                  >
                    {reorderMode ? '✓ Reorder On' : 'Reorder'}
                  </button>
                </div>
                {allMatters.map(m => (
                  <div key={m.id} className="flex items-center">
                    {reorderMode && (
                      <div className="flex flex-col pl-2 gap-0.5">
                        <button onClick={() => m.position > 1 && store.reorderMatter(m.id, m.position - 1)} className="text-slate-500 hover:text-slate-300 text-xs">▲</button>
                        <button onClick={() => store.reorderMatter(m.id, m.position + 1)} className="text-slate-500 hover:text-slate-300 text-xs">▼</button>
                      </div>
                    )}
                    <div className="flex-1">
                      <QueueRow matter={m} variant="registrar" onClick={() => setExpandedId(expandedId === m.id ? null : m.id)} />
                    </div>
                  </div>
                ))}
              </>
            )}
            {builderSub === 'callover' && (
              <>
                <SectionHeader label="Callover matters" count={pending.length} />
                {pending.map(m => (
                  <div key={m.id}>
                    <QueueRow matter={m} variant="registrar" onClick={() => setExpandedId(expandedId === m.id ? null : m.id)} />
                    {expandedId === m.id && (
                      <div className="flex flex-wrap gap-1.5 px-4 py-2 bg-slate-800/70 border-b border-slate-700/50 pl-10">
                        {DURATION_CHIPS.map(d => (
                          <button key={d} onClick={() => store.setDuration(m.id, d)}
                            className={`px-2.5 py-1 rounded text-xs font-semibold border font-serif ${m.estimatedMinutes === d ? 'bg-amber-600 text-white border-amber-500' : 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                            {d}m
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
            {builderSub === 'runthrough' && (
              <>
                <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-700/50">
                  <div className="text-xs text-slate-400 font-serif">Projected schedule · {totalMinutes}m total</div>
                </div>
                {pending.map((m, i) => {
                  const cumulative = pending.slice(0, i).reduce((s, x) => s + x.estimatedMinutes, 0);
                  return (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-700/50">
                      <span className="text-xs font-mono text-slate-500 w-12 text-right shrink-0">+{cumulative}m</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-100 font-serif truncate">{m.title}</div>
                        <div className="text-[11px] text-slate-400">{m.caseReference}</div>
                      </div>
                      <DurationBadge minutes={m.estimatedMinutes} />
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* ═══ BREAKDOWN TAB ═══ */}
        {tab === 'breakdown' && (
          <>
            <div className="flex bg-slate-800/60 border-b border-slate-700">
              {([['time', 'By Time'], ['type', 'By Type'], ['gap', 'Gap Fillers']] as const).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setBreakdownSub(k)}
                  className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 font-serif ${
                    breakdownSub === k ? 'text-sky-400 border-sky-400' : 'text-slate-500 border-transparent'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            {breakdownSub === 'time' && (
              <>
                {Object.entries(byDuration).map(([bucket, items]) => items.length > 0 && (
                  <div key={bucket}>
                    <SectionHeader label={bucket} count={items.length} />
                    {items.map(m => <QueueRow key={m.id} matter={m} variant="registrar" />)}
                  </div>
                ))}
                {unanswered.length > 0 && (
                  <>
                    <SectionHeader label="Unanswered" count={unanswered.length} />
                    {unanswered.map(m => <QueueRow key={m.id} matter={m} variant="registrar" />)}
                  </>
                )}
              </>
            )}
            {breakdownSub === 'type' && (
              <>
                {Object.entries(byType).map(([type, items]) => (
                  <div key={type}>
                    <SectionHeader label={type} count={items.length} />
                    {items.map(m => <QueueRow key={m.id} matter={m} variant="registrar" />)}
                  </div>
                ))}
                {unanswered.length > 0 && (
                  <>
                    <SectionHeader label="Unanswered" count={unanswered.length} />
                    {unanswered.map(m => <QueueRow key={m.id} matter={m} variant="registrar" />)}
                  </>
                )}
              </>
            )}
            {breakdownSub === 'gap' && <GapFillerBar variant="registrar" />}
          </>
        )}
      </div>

      {/* Global Controls */}
      <div className="px-4 py-3 bg-slate-800 border-t-2 border-slate-600 shrink-0">
        <div className="flex flex-wrap gap-2">
          {court.status === 'LIVE' && (
            <>
              <button onClick={() => store.judgeRose()} className="flex-1 min-w-[80px] py-2 rounded text-xs font-semibold bg-red-900/30 text-red-300 border border-red-700 hover:bg-red-900/50 font-serif">Judge Rose</button>
              <button onClick={() => store.atLunch()} className="flex-1 min-w-[80px] py-2 rounded text-xs font-semibold bg-amber-900/30 text-amber-300 border border-amber-700 hover:bg-amber-900/50 font-serif">At Lunch</button>
              <button onClick={() => store.concludeDay()} className="flex-1 min-w-[80px] py-2 rounded text-xs font-semibold bg-slate-700 text-slate-400 border border-slate-600 hover:bg-slate-600 font-serif">End Day</button>
              <button onClick={() => store.emergencyRecess()} className="flex-1 min-w-[80px] py-2 rounded text-xs font-semibold bg-orange-900/30 text-orange-300 border border-orange-700 hover:bg-orange-900/50 font-serif">Emergency Recess</button>
            </>
          )}
          {(court.status === 'JUDGE_ROSE' || court.status === 'AT_LUNCH' || court.status === 'PAUSED') && (
            <button onClick={() => store.resumeCourt()} className="flex-1 py-2 rounded text-xs font-semibold bg-emerald-900/40 text-emerald-300 border border-emerald-700 hover:bg-emerald-900/60 font-serif">Resume Court</button>
          )}
          {court.status === 'SETUP' && (
            <button onClick={() => store.updateCourtStatus('LIVE')} className="flex-1 py-2 rounded text-xs font-semibold bg-emerald-900/40 text-emerald-300 border border-emerald-700 hover:bg-emerald-900/60 font-serif">Go Live</button>
          )}
        </div>
      </div>
    </div>
  );
}
