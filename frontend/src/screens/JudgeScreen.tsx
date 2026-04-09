import { useState } from 'react';
import { useCourtStore } from '../store/useCourtStore';
import { CourtStatusBanner } from '../components/CourtStatusBanner';
import { LiveMatterCard } from '../components/LiveMatterCard';
import { GapFillerBar } from '../components/GapFillerBar';
import { QueueRow } from '../components/QueueRow';
import { SectionHeader } from '../components/SectionHeader';

type Tab = 'list' | 'time' | 'type';

export function JudgeScreen() {
  const [tab, setTab] = useState<Tab>('list');
  const court = useCourtStore(s => s.court);
  const active = useCourtStore(s => s.activeMatter());
  const pending = useCourtStore(s => s.pendingMatters());
  const unanswered = useCourtStore(s => s.unansweredMatters());
  const byType = useCourtStore(s => s.mattersByType());
  const byDuration = useCourtStore(s => s.mattersByDuration());

  const tabs: { key: Tab; label: string }[] = [
    { key: 'list', label: 'List' },
    { key: 'time', label: 'By Time' },
    { key: 'type', label: 'By Type' },
  ];

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-100 font-serif">{court.judgeName} — {court.courtName.split('—')[0].trim()}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{court.date}</p>
      </div>
      <CourtStatusBanner status={court.status} />

      {active && <LiveMatterCard matter={active} variant="judge" />}
      <GapFillerBar variant="judge" />

      <div className="flex bg-slate-800/60 border-b border-slate-700">
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

      <div className="flex-1 overflow-y-auto bg-slate-900">
        {tab === 'list' && (
          <>
            <SectionHeader label="Next matters" count={pending.length} />
            {pending.map(m => <QueueRow key={m.id} matter={m} variant="judge" />)}
            {unanswered.length > 0 && (
              <>
                <SectionHeader label="Unanswered" count={unanswered.length} />
                {unanswered.map(m => <QueueRow key={m.id} matter={m} variant="judge" />)}
              </>
            )}
          </>
        )}

        {tab === 'time' && (
          <>
            {Object.entries(byDuration).map(([bucket, items]) => items.length > 0 && (
              <div key={bucket}>
                <SectionHeader label={bucket} count={items.length} />
                {items.map(m => <QueueRow key={m.id} matter={m} variant="judge" />)}
              </div>
            ))}
            {unanswered.length > 0 && (
              <>
                <SectionHeader label="Unanswered" count={unanswered.length} />
                {unanswered.map(m => <QueueRow key={m.id} matter={m} variant="judge" />)}
              </>
            )}
          </>
        )}

        {tab === 'type' && (
          <>
            {Object.entries(byType).map(([type, items]) => (
              <div key={type}>
                <SectionHeader label={type} count={items.length} />
                {items.map(m => <QueueRow key={m.id} matter={m} variant="judge" />)}
              </div>
            ))}
            {unanswered.length > 0 && (
              <>
                <SectionHeader label="Unanswered" count={unanswered.length} />
                {unanswered.map(m => <QueueRow key={m.id} matter={m} variant="judge" />)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
