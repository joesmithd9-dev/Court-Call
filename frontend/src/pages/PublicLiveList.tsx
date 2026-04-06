import { useParams } from 'react-router-dom';
import { useCourtDayStore, selectCurrentCase, selectUpcomingCases, selectAllCasesSorted } from '../stores/courtDayStore';
import { useCourtDayLoader } from '../hooks/useCourtDayLoader';
import { fetchCourtDay } from '../api/client';
import { CourtHeader } from '../components/common/CourtHeader';
import { StatusBanner } from '../components/common/StatusBanner';
import { CurrentCaseCard } from '../components/common/CurrentCaseCard';
import { NextUpStrip } from '../components/common/NextUpStrip';
import { ListItemRow } from '../components/common/ListItemRow';

export function PublicLiveList() {
  const { courtDayId } = useParams<{ courtDayId: string }>();
  const { courtDay, loading, error, connected } = useCourtDayStore();

  useCourtDayLoader({
    courtDayId: courtDayId!,
    fetchFn: fetchCourtDay,
  });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-court-text-dim animate-pulse">Loading court list...</div>
      </div>
    );
  }

  if (error || !courtDay) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-court-danger text-center px-4">
          <p className="text-lg font-semibold">Unable to load court list</p>
          <p className="text-sm text-court-text-dim mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const currentCase = selectCurrentCase(courtDay);
  const upcoming = selectUpcomingCases(courtDay);
  const allCases = selectAllCasesSorted(courtDay);

  return (
    <div className="flex flex-col min-h-dvh">
      <CourtHeader courtDay={courtDay} connected={connected} />
      <StatusBanner
        status={courtDay.status}
        statusMessage={courtDay.statusMessage}
        judgeName={courtDay.judgeName}
        resumeTime={courtDay.resumeTime}
      />

      {currentCase && <CurrentCaseCard courtCase={currentCase} />}

      <NextUpStrip cases={upcoming} maxVisible={5} />

      {/* Full list */}
      <div className="flex-1">
        <div className="px-4 py-2 border-b border-court-border">
          <p className="text-xs text-court-text-dim font-semibold uppercase tracking-widest">
            All Cases ({allCases.length})
          </p>
        </div>
        {allCases.map((c, i) => (
          <ListItemRow
            key={c.id}
            courtCase={c}
            position={i + 1}
            isCurrent={c.id === courtDay.currentCaseId}
          />
        ))}
      </div>

      {/* Footer */}
      <footer className="px-4 py-3 text-center text-xs text-court-text-dim border-t border-court-border">
        CourtCall — Live List
      </footer>
    </div>
  );
}
