import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  useCourtDayStore,
  selectCurrentCase,
  selectUpcomingCases,
  selectAllCasesSorted,
} from '../stores/courtDayStore';
import { useCourtDayLoader } from '../hooks/useCourtDayLoader';
import {
  fetchRegistrarCourtDay,
  updateCourtDay,
  updateCase,
  startNextCase,
} from '../api/client';
import { CourtHeader } from '../components/common/CourtHeader';
import { StatusBanner } from '../components/common/StatusBanner';
import { CurrentCaseCard } from '../components/common/CurrentCaseCard';
import { NextUpStrip } from '../components/common/NextUpStrip';
import { ListItemRow } from '../components/common/ListItemRow';
import { QuickActionBar } from '../components/registrar/QuickActionBar';
import { GlobalControls } from '../components/registrar/GlobalControls';
import { AdjournSheet } from '../components/registrar/AdjournSheet';
import { NotBeforeSheet } from '../components/registrar/NotBeforeSheet';
import { NoteInput } from '../components/registrar/NoteInput';

type SheetType = 'adjourn' | 'not_before' | null;

export function RegistrarScreen() {
  const { courtDayId } = useParams<{ courtDayId: string }>();
  const { courtDay, loading, error, connected, setCourtDay } = useCourtDayStore();

  useCourtDayLoader({
    courtDayId: courtDayId!,
    fetchFn: fetchRegistrarCourtDay,
  });

  const [activeSheet, setActiveSheet] = useState<SheetType>(null);
  const [sheetCaseId, setSheetCaseId] = useState<string | null>(null);
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const id = courtDayId!;

  // ---- Current case actions ----
  const handleAddTime = useCallback(
    async (minutes: number) => {
      if (!courtDay?.currentCaseId) return;
      const c = courtDay.cases.find((c) => c.id === courtDay.currentCaseId);
      const newEst = (c?.estimatedMinutes ?? 0) + minutes;
      const result = await updateCase(id, courtDay.currentCaseId, {
        estimatedMinutes: newEst,
      });
      setCourtDay(result);
    },
    [courtDay, id, setCourtDay]
  );

  const handleDone = useCallback(async () => {
    if (!courtDay?.currentCaseId) return;
    const result = await updateCase(id, courtDay.currentCaseId, {
      status: 'concluded',
    });
    setCourtDay(result);
  }, [courtDay, id, setCourtDay]);

  const handleAdjournCurrent = useCallback(() => {
    if (!courtDay?.currentCaseId) return;
    setSheetCaseId(courtDay.currentCaseId);
    setActiveSheet('adjourn');
  }, [courtDay]);

  const handleLetStand = useCallback(async () => {
    if (!courtDay?.currentCaseId) return;
    const result = await updateCase(id, courtDay.currentCaseId, {
      status: 'stood_down',
    });
    setCourtDay(result);
  }, [courtDay, id, setCourtDay]);

  // ---- Sheet confirmations ----
  const handleAdjournConfirm = useCallback(
    async (time: string) => {
      if (!sheetCaseId) return;
      const result = await updateCase(id, sheetCaseId, {
        status: 'adjourned',
        adjournedToTime: time,
      });
      setCourtDay(result);
      setActiveSheet(null);
      setSheetCaseId(null);
    },
    [id, sheetCaseId, setCourtDay]
  );

  const handleNotBeforeConfirm = useCallback(
    async (time: string) => {
      if (!sheetCaseId) return;
      const result = await updateCase(id, sheetCaseId, {
        status: 'not_before',
        notBeforeTime: time,
      });
      setCourtDay(result);
      setActiveSheet(null);
      setSheetCaseId(null);
    },
    [id, sheetCaseId, setCourtDay]
  );

  // ---- Global controls ----
  const handleJudgeRose = useCallback(async () => {
    const result = await updateCourtDay(id, { status: 'judge_rose' });
    setCourtDay(result);
  }, [id, setCourtDay]);

  const handleResume = useCallback(async () => {
    const result = await updateCourtDay(id, { status: 'live' });
    setCourtDay(result);
  }, [id, setCourtDay]);

  const handleStartNext = useCallback(async () => {
    const result = await startNextCase(id);
    setCourtDay(result);
  }, [id, setCourtDay]);

  const handleEndDay = useCallback(async () => {
    const result = await updateCourtDay(id, { status: 'ended' });
    setCourtDay(result);
  }, [id, setCourtDay]);

  const handleAtLunch = useCallback(async () => {
    const result = await updateCourtDay(id, { status: 'at_lunch' });
    setCourtDay(result);
  }, [id, setCourtDay]);

  // ---- Inline case actions ----
  const handleInlineCaseAction = useCallback(
    async (caseId: string, action: string) => {
      switch (action) {
        case 'done': {
          const result = await updateCase(id, caseId, { status: 'concluded' });
          setCourtDay(result);
          break;
        }
        case 'adjourn': {
          setSheetCaseId(caseId);
          setActiveSheet('adjourn');
          break;
        }
        case 'not_before': {
          setSheetCaseId(caseId);
          setActiveSheet('not_before');
          break;
        }
        case 'let_stand': {
          const result = await updateCase(id, caseId, { status: 'stood_down' });
          setCourtDay(result);
          break;
        }
        case 'note': {
          setEditingNoteId(caseId);
          break;
        }
      }
      setExpandedCaseId(null);
    },
    [id, setCourtDay]
  );

  const handleSaveNote = useCallback(
    async (caseId: string, note: string) => {
      const result = await updateCase(id, caseId, { note });
      setCourtDay(result);
      setEditingNoteId(null);
    },
    [id, setCourtDay]
  );

  // ---- Render ----
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-court-text-dim animate-pulse">Loading registrar view...</div>
      </div>
    );
  }

  if (error || !courtDay) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-court-danger text-center px-4">
          <p className="text-lg font-semibold">Unable to load court day</p>
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

      <QuickActionBar
        currentCase={currentCase}
        onAddTime={handleAddTime}
        onDone={handleDone}
        onAdjourn={handleAdjournCurrent}
        onLetStand={handleLetStand}
      />

      <NextUpStrip cases={upcoming} maxVisible={3} />

      {/* Full list */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2 border-b border-court-border">
          <p className="text-xs text-court-text-dim font-semibold uppercase tracking-widest">
            All Cases ({allCases.length})
          </p>
        </div>
        {allCases.map((c, i) => (
          <div key={c.id}>
            <div
              onClick={() =>
                setExpandedCaseId(expandedCaseId === c.id ? null : c.id)
              }
              className="cursor-pointer"
            >
              <ListItemRow
                courtCase={c}
                position={i + 1}
                isCurrent={c.id === courtDay.currentCaseId}
              />
            </div>

            {/* Inline expanded actions */}
            {expandedCaseId === c.id && (
              <div className="px-4 py-2 bg-court-surface-2 border-b border-court-border flex flex-wrap gap-2">
                <InlineBtn label="Done" onClick={() => handleInlineCaseAction(c.id, 'done')} />
                <InlineBtn label="Adjourn" onClick={() => handleInlineCaseAction(c.id, 'adjourn')} />
                <InlineBtn label="Not Before" onClick={() => handleInlineCaseAction(c.id, 'not_before')} />
                <InlineBtn label="Let Stand" onClick={() => handleInlineCaseAction(c.id, 'let_stand')} />
                <InlineBtn label="Note" onClick={() => handleInlineCaseAction(c.id, 'note')} />
              </div>
            )}

            {/* Inline note editor */}
            {editingNoteId === c.id && (
              <div className="px-4 py-2 bg-court-surface-2 border-b border-court-border">
                <NoteInput
                  initialValue={c.note ?? ''}
                  onSave={(note) => handleSaveNote(c.id, note)}
                  onCancel={() => setEditingNoteId(null)}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <GlobalControls
        status={courtDay.status}
        judgeName={courtDay.judgeName}
        onJudgeRose={handleJudgeRose}
        onResume={handleResume}
        onStartNext={handleStartNext}
        onEndDay={handleEndDay}
        onAtLunch={handleAtLunch}
      />

      {/* Sheets */}
      {activeSheet === 'adjourn' && (
        <AdjournSheet
          onConfirm={handleAdjournConfirm}
          onCancel={() => {
            setActiveSheet(null);
            setSheetCaseId(null);
          }}
        />
      )}
      {activeSheet === 'not_before' && (
        <NotBeforeSheet
          onConfirm={handleNotBeforeConfirm}
          onCancel={() => {
            setActiveSheet(null);
            setSheetCaseId(null);
          }}
        />
      )}
    </div>
  );
}

function InlineBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg bg-court-surface text-court-text text-xs font-medium hover:bg-court-border transition-colors"
    >
      {label}
    </button>
  );
}
