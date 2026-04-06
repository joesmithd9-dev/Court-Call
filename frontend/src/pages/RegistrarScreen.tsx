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
import type { UpdateCasePayload } from '../types';
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
  const { courtDay, loading, error, connected, lastAction, replaceSnapshot, setLastAction, clearLastAction } =
    useCourtDayStore();

  useCourtDayLoader({
    courtDayId: courtDayId!,
    fetchFn: fetchRegistrarCourtDay,
  });

  const [activeSheet, setActiveSheet] = useState<SheetType>(null);
  const [sheetCaseId, setSheetCaseId] = useState<string | null>(null);
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const id = courtDayId!;

  // 6.3: Record action for undo
  const recordAction = useCallback(
    (actionType: string, caseId: string, previousPayload: UpdateCasePayload) => {
      setLastAction({
        actionType,
        caseId,
        timestamp: Date.now(),
        previousPayload,
      });
    },
    [setLastAction]
  );

  // ---- Current case actions ----
  const handleAddTime = useCallback(
    async (minutes: number) => {
      if (!courtDay?.currentCaseId) return;
      const c = courtDay.cases.find((c) => c.id === courtDay.currentCaseId);
      const prevEst = c?.estimatedMinutes ?? 0;
      const newEst = prevEst + minutes;
      const result = await updateCase(id, courtDay.currentCaseId, {
        estimatedMinutes: newEst,
      });
      recordAction('add_time', courtDay.currentCaseId, { estimatedMinutes: prevEst });
      replaceSnapshot(result);
    },
    [courtDay, id, replaceSnapshot, recordAction]
  );

  const handleDone = useCallback(async () => {
    if (!courtDay?.currentCaseId) return;
    const c = courtDay.cases.find((c) => c.id === courtDay.currentCaseId);
    const result = await updateCase(id, courtDay.currentCaseId, {
      status: 'concluded',
    });
    recordAction('done', courtDay.currentCaseId, { status: c?.status });
    replaceSnapshot(result);
  }, [courtDay, id, replaceSnapshot, recordAction]);

  const handleAdjournCurrent = useCallback(() => {
    if (!courtDay?.currentCaseId) return;
    setSheetCaseId(courtDay.currentCaseId);
    setActiveSheet('adjourn');
  }, [courtDay]);

  const handleLetStand = useCallback(async () => {
    if (!courtDay?.currentCaseId) return;
    const c = courtDay.cases.find((c) => c.id === courtDay.currentCaseId);
    const result = await updateCase(id, courtDay.currentCaseId, {
      status: 'stood_down',
    });
    recordAction('let_stand', courtDay.currentCaseId, { status: c?.status });
    replaceSnapshot(result);
  }, [courtDay, id, replaceSnapshot, recordAction]);

  // ---- 6.3: Undo ----
  const handleUndo = useCallback(async () => {
    if (!lastAction) return;
    if (Date.now() - lastAction.timestamp > 10_000) return;
    const result = await undoAction(id, lastAction.actionType, lastAction.caseId, lastAction.previousPayload);
    clearLastAction();
    replaceSnapshot(result);
  }, [id, lastAction, clearLastAction, replaceSnapshot]);

  // ---- Sheet confirmations ----
  const handleAdjournConfirm = useCallback(
    async (time: string) => {
      if (!sheetCaseId) return;
      const c = courtDay?.cases.find((c) => c.id === sheetCaseId);
      const result = await updateCase(id, sheetCaseId, {
        status: 'adjourned',
        adjournedToTime: time,
      });
      recordAction('adjourn', sheetCaseId, { status: c?.status, adjournedToTime: c?.adjournedToTime });
      replaceSnapshot(result);
      setActiveSheet(null);
      setSheetCaseId(null);
    },
    [id, sheetCaseId, courtDay, replaceSnapshot, recordAction]
  );

  const handleNotBeforeConfirm = useCallback(
    async (time: string) => {
      if (!sheetCaseId) return;
      const c = courtDay?.cases.find((c) => c.id === sheetCaseId);
      const result = await updateCase(id, sheetCaseId, {
        status: 'not_before',
        notBeforeTime: time,
      });
      recordAction('not_before', sheetCaseId, { status: c?.status, notBeforeTime: c?.notBeforeTime });
      replaceSnapshot(result);
      setActiveSheet(null);
      setSheetCaseId(null);
    },
    [id, sheetCaseId, courtDay, replaceSnapshot, recordAction]
  );

  // ---- Global controls ----
  const handleJudgeRose = useCallback(async () => {
    const result = await updateCourtDay(id, { status: 'judge_rose' });
    replaceSnapshot(result);
  }, [id, replaceSnapshot]);

  const handleResume = useCallback(async () => {
    const result = await updateCourtDay(id, { status: 'live' });
    replaceSnapshot(result);
  }, [id, replaceSnapshot]);

  const handleStartNext = useCallback(async () => {
    const result = await startNextCase(id);
    replaceSnapshot(result);
  }, [id, replaceSnapshot]);

  const handleEndDay = useCallback(async () => {
    const result = await updateCourtDay(id, { status: 'ended' });
    replaceSnapshot(result);
  }, [id, replaceSnapshot]);

  const handleAtLunch = useCallback(async () => {
    const result = await updateCourtDay(id, { status: 'at_lunch' });
    replaceSnapshot(result);
  }, [id, replaceSnapshot]);

  // ---- Inline case actions ----
  const handleInlineCaseAction = useCallback(
    async (caseId: string, action: string) => {
      const c = courtDay?.cases.find((c) => c.id === caseId);
      switch (action) {
        case 'done': {
          const result = await updateCase(id, caseId, { status: 'concluded' });
          recordAction('done', caseId, { status: c?.status });
          replaceSnapshot(result);
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
          recordAction('let_stand', caseId, { status: c?.status });
          replaceSnapshot(result);
          break;
        }
        case 'note': {
          setEditingNoteId(caseId);
          break;
        }
      }
      setExpandedCaseId(null);
    },
    [id, courtDay, replaceSnapshot, recordAction]
  );

  const handleSaveNote = useCallback(
    async (caseId: string, note: string) => {
      const result = await updateCase(id, caseId, { note });
      replaceSnapshot(result);
      setEditingNoteId(null);
    },
    [id, replaceSnapshot]
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

      {/* 6.5: Registrar view uses caseTitleFull */}
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
    </div>
  );
}

// 6.4: Inline action buttons with tap protection
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
