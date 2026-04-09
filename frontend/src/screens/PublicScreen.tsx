import { useCourtStore } from '../store/useCourtStore';
import { CourtStatusBanner } from '../components/CourtStatusBanner';
import { SectionHeader } from '../components/SectionHeader';
import { DurationBadge } from '../components/DurationBadge';
import { StatusBadge } from '../components/StatusBadge';

export function PublicScreen() {
  const court = useCourtStore(s => s.court);
  const active = useCourtStore(s => s.activeMatter());
  const allMatters = useCourtStore(s => s.matters);

  // Privacy filter: sealed matters hidden entirely, restricted show generic title
  const visibleMatters = allMatters
    .filter(m => m.privacyLevel !== 'sealed')
    .sort((a, b) => a.position - b.position);

  const pendingVisible = visibleMatters.filter(m =>
    m.status === 'PENDING' || m.status === 'NOT_BEFORE' || m.status === 'LET_STAND' || m.status === 'CALLING'
  );

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-100 font-serif">{court.courtName}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{court.date}</p>
      </div>
      <CourtStatusBanner status={court.status} />

      {/* Current Matter */}
      {active && active.privacyLevel !== 'sealed' && (
        <div className="mx-4 my-3 p-4 bg-emerald-950/30 border border-emerald-800 border-l-4 border-l-emerald-400 rounded-md">
          <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest font-serif mb-1.5">
            Now before the court
          </div>
          <div className="text-lg font-semibold text-slate-100 font-serif">
            {active.privacyLevel === 'restricted' ? 'In Camera — Details Restricted' : active.titlePublic}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {active.privacyLevel === 'public' && active.caseReference}
            {active.publicNote && active.privacyLevel === 'public' && ` · ${active.publicNote}`}
          </div>
          <div className="flex items-center gap-3 mt-2">
            {active.privacyLevel === 'public' && <DurationBadge minutes={active.estimatedMinutes} />}
            <StatusBadge status={active.status} />
          </div>
        </div>
      )}

      {/* Coming Up */}
      <SectionHeader label="Coming up" count={pendingVisible.length} />
      {pendingVisible.slice(0, 5).map((m, i) => (
        <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-700/50 bg-slate-900">
          <div className="w-5 h-5 rounded-full bg-slate-700 text-slate-300 text-[10px] font-bold flex items-center justify-center shrink-0">
            {i + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-slate-100 font-serif truncate">
              {m.privacyLevel === 'restricted' ? 'In Camera' : m.titlePublic}
            </div>
            <div className="text-[11px] text-slate-400">
              {m.predictedStart && `~${m.predictedStart}`}
              {m.privacyLevel === 'public' && m.publicNote && ` · ${m.publicNote}`}
            </div>
          </div>
          {m.privacyLevel === 'public' && <DurationBadge minutes={m.estimatedMinutes} />}
          <StatusBadge status={m.status} />
        </div>
      ))}

      {/* Full List */}
      <SectionHeader label="Full list" count={visibleMatters.length} />
      {visibleMatters.map(m => (
        <div key={m.id} className={`flex items-center gap-3 px-4 py-2.5 border-b border-slate-700/50 ${
          m.status === 'HEARING' || m.status === 'CALLING' ? 'bg-emerald-950/20 border-l-2 border-l-emerald-500' :
          m.status === 'CONCLUDED' || m.status === 'ADJOURNED' ? 'opacity-40' : ''
        }`}>
          <span className="text-xs font-mono text-slate-500 w-5 text-right shrink-0">{m.position}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-slate-100 font-serif truncate">
              {m.privacyLevel === 'restricted' ? 'In Camera — Details Restricted' : m.titlePublic}
            </div>
            {m.privacyLevel === 'public' && m.publicNote && (
              <div className="text-[11px] text-slate-400 italic truncate mt-0.5">{m.publicNote}</div>
            )}
          </div>
          {m.privacyLevel === 'public' && <DurationBadge minutes={m.estimatedMinutes} />}
          <StatusBadge status={m.status} />
        </div>
      ))}

      {/* Footer */}
      <div className="py-3 text-center text-[11px] text-slate-500 font-serif border-t border-slate-700 bg-slate-800/50">
        Courts Service Ireland — CourtCall · Live Court List System
      </div>
    </div>
  );
}
