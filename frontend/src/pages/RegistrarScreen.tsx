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
  undoAction,
} from '../api/client';
import { CourtHeader } from '../components/common/CourtHeader';
import { StatusBanner } from '../components/common/StatusBanner';
import { CurrentCaseCard } from '../components/common/CurrentCaseCard';
import { NextUpStrip } from '../components/common/NextUpStrip';
import { ListItemRow } from '../components/common/ListItemRow';
import { Toast } from '../components/common/Toast';
import { CriticalErrorBanner } from '../components/common/CriticalErrorBanner';
import { QuickActionBar } from '../components/registrar/QuickActionBar';
import { GlobalControls } from '../components/registrar/GlobalControls';
import { AdjournSheet } from '../components/registrar/AdjournSheet';
import { NotBeforeSheet } from '../components/registrar/NotBeforeSheet';
import { NoteInput } from '../components/registrar/NoteInput';

type SheetType = 'adjourn' | 'not_before' | null;

export function RegistrarScreen() {
  const { courtDayId } = useParams<{ courtDayId: string }>();
  const {
    courtDay,
    loading,
    error,
    connected,
    lastAction,
    criticalError,
    toast,
    replaceSnapshot,
    setLastAction,
    clearLastAction,
    showToast,
  } = useCourtDayStore();

  useCourtDayLoader({
    courtDayId: courtDayId!,
    fetchFn: fetchRegistrarCourtDay,
  });

  const [activeSheet, setActiveSheet] = useState<SheetType>(null);
  const [sheetCaseId, setSheetCaseId] = useState<string | null>(null);
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const id = courtDayId!;

  // (B) Record action for event-based undo.
  // The API response includes the event ID of the action just performed.
  // We store that so undo can target the exact event.
  const recordAction = useCallback(
    (eventId: string, actionType: string, caseId: string) => {
      setLastAction({
        eventId,
        actionType,
        caseId,
        timestamp: Date.now(),
      });
    },
    [setLastAction]
  );

  // Helper: extract eventId from API response snapshot.
  // The backend's response snapshot includes lastSequence which corresponds
  // to the event just created. We use the response to get the event reference.
  // Convention: API responses include a `lastEventId` field for undo targeting.
  const getEventId = (result: { lastEventId?: string; lastSequence?: number }): string => {
    return (result as Record<string, unknown>).lastEventId as string ?? `seq-${(result as Record<string, unknown>).lastSequence ?? Date.now()}`;
  };

  // ---- Current case actions ----
  const handleAddTime = useCallback(
    async (minutes: number) => {
      if (!courtDay?.currentCaseId) return;
      const c = courtDay.cases.find((c) => c.id === courtDay.currentCaseId);
      const newEst = (c?.estimatedMinutes ?? 0) + minutes;
      const result = await updateCase(id, courtDay.currentCaseId, {
        estimatedMinutes: newEst,
      });
      recordAction(getEventId(result), 'add_time', courtDay.currentCaseId);
      replaceSnapshot(result);
      showToast(`+${minutes} min applied`);
    },
    [courtDay, id, replaceSnapshot, recordAction, showToast]
  );

  const handleDone = useCallback(async () => {
    if (!courtDay?.currentCaseId) return;
    const result = await updateCase(id, courtDay.currentCaseId, {
      status: 'concluded',
    });
    recordAction(getEventId(result), 'done', courtDay.currentCaseId);
    replaceSnapshot(result);
    showToast('Case concluded');
  }, [courtDay, id, replaceSnapshot, recordAction, showToast]);

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
    recordAction(getEventId(result), 'let_stand', courtDay.currentCaseId);
    replaceSnapshot(result);
    showToast('Case stood down');
  }, [courtDay, id, replaceSnapshot, recordAction, showToast]);

  // (B) Undo — sends targetEventId to backend for compensating event
  const handleUndo = useCallback(async () => {
    if (!lastAction) return;
    if (Date.now() - lastAction.timestamp > 10_000) return;
    const result = await undoAction(id, lastAction.eventId);
    clearLastAction();
    replaceSnapshot(result);
    showToast('Action undone');
  }, [id, lastAction, clearLastAction, replaceSnapshot, showToast]);

  // ---- Sheet confirmations ----
  const handleAdjournConfirm = useCallback(
    async (time: string) => {
      if (!sheetCaseId) return;
      const result = await updateCase(id, sheetCaseId, {
        status: 'adjourned',
        adjournedToTime: time,
      });
      recordAction(getEventId(result), 'adjourn', sheetCaseId);
      replaceSnapshot(result);
      setActiveSheet(null);
      setSheetCaseId(null);
      const timeStr = new Date(time).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
      showToast(`Adjourned to ${timeStr}`);
    },
    [id, sheetCaseId, replaceSnapshot, recordAction, showToast]
  );

  const handleNotBeforeConfirm = useCallback(
    async (time: string) => {
      if (!sheetCaseId) return;
      const result = await updateCase(id, sheetCaseId, {
        status: 'not_before',
        notBeforeTime: time,
      });
      recordAction(getEventId(result), 'not_before', sheetCaseId);
      replaceSnapshot(result);
      setActiveSheet(null);
      setSheetCaseId(null);
      const timeStr = new Date(time).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
      showToast(`Not before ${timeStr}`);
    },
    [id, sheetCaseId, replaceSnapshot, recordAction, showToast]
  );

  // ---- Global controls ----
  const handleJudgeRose = useCallback(async () => {
    const result = await updateCourtDay(id, { status: 'judge_rose' });
    replaceSnapshot(result);
    showToast('Judge rose');
  }, [id, replaceSnapshot, showToast]);

  const handleResume = useCallback(async () => {
    const result = await updateCourtDay(id, { status: 'live' });
    replaceSnapshot(result);
    showToast('Court resumed');
  }, [id, replaceSnapshot, showToast]);

  const handleStartNext = useCallback(async () => {
    const result = await startNextCase(id);
    replaceSnapshot(result);
    showToast('Next case started');
  }, [id, replaceSnapshot, showToast]);

  const handleEndDay = useCallback(async () => {
    const result = await updateCourtDay(id, { status: 'ended' });
    replaceSnapshot(result);
    showToast('Day ended');
  }, [id, replaceSnapshot, showToast]);

  const handleAtLunch = useCallback(async () => {
    const result = await updateCourtDay(id, { status: 'at_lunch' });
    replaceSnapshot(result);
    showToast('At lunch');
  }, [id, replaceSnapshot, showToast]);

  // ---- Inline case actions ----
  const handleInlineCaseAction = useCallback(
    async (caseId: string, action: string) => {
      switch (action) {
        case 'done': {
          const result = await updateCase(id, caseId, { status: 'concluded' });
          recordAction(getEventId(result), 'done', caseId);
          replaceSnapshot(result);
          showToast('Case concluded');
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
          recordAction(getEventId(result), 'let_stand', caseId);
          replaceSnapshot(result);
          showToast('Case stood down');
          break;
        }
        case 'note': {
          setEditingNoteId(caseId);
          break;
        }
      }
      setExpandedCaseId(null);
    },
    [id, replaceSnapshot, recordAction, showToast]
  );

  const handleSaveNote = useCallback(
    async (caseId: string, note: string) => {
      const result = await updateCase(id, caseId, { note });
      replaceSnapshot(result);
      setEditingNoteId(null);
      showToast('Note saved');
    },
    [id, replaceSnapshot, showToast]
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

      {/* Multiple-active-case guardrail */}
      <CriticalErrorBanner message={criticalError} />

      <StatusBanner
        status={courtDay.status}
        statusMessage={courtDay.statusMessage}
        judgeName={courtDay.judgeName}
        resumeTime={courtDay.resumeTime}
      />

      {currentCase && <CurrentCaseCard courtCase={currentCase} view="registrar" />}

      <QuickActionBar
        currentCase={currentCase}
        lastAction={lastAction}
        onAddTime={handleAddTime}
        onDone={handleDone}
        onAdjourn={handleAdjournCurrent}
        onLetStand={handleLetStand}
        onUndo={handleUndo}
      />

      <NextUpStrip cases={upcoming} maxVisible={3} view="registrar" />

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
                view="registrar"
              />
            </div>

            {expandedCaseId === c.id && (
              <InlineActions
                caseId={c.id}
                onAction={handleInlineCaseAction}
              />
            )}

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

      {/* Micro-toast confirmation */}
      <Toast message={toast} />
    </div>
  );
}

function InlineActions({
  caseId,
  onAction,
}: {
  caseId: string;
  onAction: (caseId: string, action: string) => Promise<void>;
}) {
  const [locked, setLocked] = useState(false);

  const handleTap = async (action: string) => {
    if (locked) return;
    setLocked(true);
    try {
      await onAction(caseId, action);
    } finally {
      setTimeout(() => setLocked(false), 500);
    }
  };

  return (
    <div className={`px-4 py-2 bg-court-surface-2 border-b border-court-border flex flex-wrap gap-2 ${locked ? 'opacity-50 pointer-events-none' : ''}`}>
      <InlineBtn label="Done" onClick={() => handleTap('done')} />
      <InlineBtn label="Adjourn" onClick={() => handleTap('adjourn')} />
      <InlineBtn label="Not Before" onClick={() => handleTap('not_before')} />
      <InlineBtn label="Let Stand" onClick={() => handleTap('let_stand')} />
      <InlineBtn label="Note" onClick={() => handleTap('note')} />
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
