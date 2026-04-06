import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useCourtDayStore } from '../stores/courtDayStore';
import { useCourtDayLoader } from '../hooks/useCourtDayLoader';
import { useCourtDayView } from '../viewModel/useCourtDayView';
import {
  fetchRegistrarCourtDay,
  updateCourtDay,
  updateCase,
  startNextCase,
  undoAction,
} from '../api/client';
import type { ActiveCaseView } from '../viewModel/courtDayViewModel';
import { Toast } from '../components/common/Toast';
import { AdjournSheet } from '../components/registrar/AdjournSheet';
import { NotBeforeSheet } from '../components/registrar/NotBeforeSheet';
import { NoteInput } from '../components/registrar/NoteInput';

type SheetType = 'adjourn' | 'not_before' | null;

export function RegistrarScreen() {
  const { courtDayId } = useParams<{ courtDayId: string }>();
  const { replaceSnapshot, setLastAction, clearLastAction, showToast } = useCourtDayStore();

  useCourtDayLoader({ courtDayId: courtDayId!, fetchFn: fetchRegistrarCourtDay });

  const vm = useCourtDayView('registrar');

  const [activeSheet, setActiveSheet] = useState<SheetType>(null);
  const [sheetCaseId, setSheetCaseId] = useState<string | null>(null);
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const id = courtDayId!;

  const getEventId = (result: Record<string, unknown>): string =>
    (result.lastEventId as string) ?? `seq-${result.lastSequence ?? Date.now()}`;

  const recordAction = useCallback(
    (eventId: string, actionType: string, caseId: string) => {
      setLastAction({ eventId, actionType, caseId, timestamp: Date.now() });
    },
    [setLastAction]
  );

  // ---- Action handlers (thin — dispatch to backend, replace snapshot) ----

  const handleAddTime = useCallback(async (minutes: number) => {
    if (!vm.ready || !vm.activeCase) return;
    const c = vm.courtDay.cases.find((c) => c.id === vm.activeCase!.id);
    const result = await updateCase(id, vm.activeCase.id, {
      estimatedMinutes: (c?.estimatedMinutes ?? 0) + minutes,
    });
    recordAction(getEventId(result as any), 'add_time', vm.activeCase.id);
    replaceSnapshot(result);
    showToast(`+${minutes} min`);
  }, [vm, id, replaceSnapshot, recordAction, showToast]);

  const handleDone = useCallback(async () => {
    if (!vm.ready || !vm.activeCase) return;
    const result = await updateCase(id, vm.activeCase.id, { status: 'concluded' });
    recordAction(getEventId(result as any), 'done', vm.activeCase.id);
    replaceSnapshot(result);
    showToast('Case concluded');
  }, [vm, id, replaceSnapshot, recordAction, showToast]);

  const handleLetStand = useCallback(async () => {
    if (!vm.ready || !vm.activeCase) return;
    const result = await updateCase(id, vm.activeCase.id, { status: 'stood_down' });
    recordAction(getEventId(result as any), 'let_stand', vm.activeCase.id);
    replaceSnapshot(result);
    showToast('Stood down');
  }, [vm, id, replaceSnapshot, recordAction, showToast]);

  const handleAdjournCurrent = useCallback(() => {
    if (!vm.ready || !vm.activeCase) return;
    setSheetCaseId(vm.activeCase.id);
    setActiveSheet('adjourn');
  }, [vm]);

  const handleUndo = useCallback(async () => {
    const action = useCourtDayStore.getState().lastAction;
    if (!action || Date.now() - action.timestamp > 10_000) return;
    const result = await undoAction(id, action.eventId);
    clearLastAction();
    replaceSnapshot(result);
    showToast('Undone');
  }, [id, clearLastAction, replaceSnapshot, showToast]);

  const handleAdjournConfirm = useCallback(async (time: string) => {
    if (!sheetCaseId) return;
    const result = await updateCase(id, sheetCaseId, { status: 'adjourned', adjournedToTime: time });
    recordAction(getEventId(result as any), 'adjourn', sheetCaseId);
    replaceSnapshot(result);
    setActiveSheet(null);
    setSheetCaseId(null);
    showToast(`Adjourned to ${fmtTime(time)}`);
  }, [id, sheetCaseId, replaceSnapshot, recordAction, showToast]);

  const handleNotBeforeConfirm = useCallback(async (time: string) => {
    if (!sheetCaseId) return;
    const result = await updateCase(id, sheetCaseId, { status: 'not_before', notBeforeTime: time });
    recordAction(getEventId(result as any), 'not_before', sheetCaseId);
    replaceSnapshot(result);
    setActiveSheet(null);
    setSheetCaseId(null);
    showToast(`Not before ${fmtTime(time)}`);
  }, [id, sheetCaseId, replaceSnapshot, recordAction, showToast]);

  const handleStartNext = useCallback(async () => {
    const result = await startNextCase(id);
    replaceSnapshot(result);
    showToast('Next case started');
  }, [id, replaceSnapshot, showToast]);

  const handleJudgeRose = useCallback(async () => {
    const result = await updateCourtDay(id, { status: 'judge_rose' });
    replaceSnapshot(result);
    showToast('Judge rose');
  }, [id, replaceSnapshot, showToast]);

  const handleResume = useCallback(async () => {
    const result = await updateCourtDay(id, { status: 'live' });
    replaceSnapshot(result);
    showToast('Resumed');
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

  const handleInlineAction = useCallback(async (caseId: string, action: string) => {
    switch (action) {
      case 'done': {
        const r = await updateCase(id, caseId, { status: 'concluded' });
        recordAction(getEventId(r as any), 'done', caseId);
        replaceSnapshot(r);
        showToast('Concluded');
        break;
      }
      case 'let_stand': {
        const r = await updateCase(id, caseId, { status: 'stood_down' });
        recordAction(getEventId(r as any), 'let_stand', caseId);
        replaceSnapshot(r);
        showToast('Stood down');
        break;
      }
      case 'adjourn':
        setSheetCaseId(caseId);
        setActiveSheet('adjourn');
        break;
      case 'not_before':
        setSheetCaseId(caseId);
        setActiveSheet('not_before');
        break;
      case 'note':
        setEditingNoteId(caseId);
        break;
    }
    setExpandedCaseId(null);
  }, [id, replaceSnapshot, recordAction, showToast]);

  const handleSaveNote = useCallback(async (caseId: string, note: string) => {
    const r = await updateCase(id, caseId, { note });
    replaceSnapshot(r);
    setEditingNoteId(null);
    showToast('Note saved');
  }, [id, replaceSnapshot, showToast]);

  // ---- Render ----

  if (!vm.ready) {
    return (
      <div className="flex-1 flex items-center justify-center">
        {vm.loading ? (
          <span className="text-court-text-dim animate-pulse">Loading...</span>
        ) : (
          <div className="text-court-danger text-center px-4">
            <p className="font-semibold">Unable to load court day</p>
            <p className="text-sm text-court-text-dim mt-1">{vm.error}</p>
          </div>
        )}
      </div>
    );
  }

  const { meta, courtStatus, activeCase, nextUp, fullList, undo, toast } = vm;

  return (
    <div className="flex flex-col min-h-dvh">
      {/* Header */}
      <header className="px-4 py-3 bg-court-surface border-b border-court-border">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-white truncate">
              {meta.courtName}
              {meta.courtRoom && <span className="text-court-text-dim font-normal"> — {meta.courtRoom}</span>}
            </h1>
            <p className="text-sm text-court-text-dim">{meta.dateLabel}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <span className="text-sm text-court-text-dim">{meta.judgeName}</span>
            <span className={`w-2 h-2 rounded-full ${meta.connected ? 'bg-court-active' : 'bg-court-danger'}`} />
          </div>
        </div>
      </header>

      {/* Critical error banner */}
      {meta.criticalError && (
        <div className="px-4 py-3 bg-court-danger text-white text-center text-sm font-bold">
          {meta.criticalError}
        </div>
      )}

      {/* Status banner */}
      <StatusBar status={courtStatus} />

      {/* Active case card */}
      {activeCase && <ActiveCard c={activeCase} />}

      {/* Quick actions for active case */}
      <div className="px-4 py-3 flex flex-wrap gap-2 border-b border-court-border">
        {activeCase && (
          <>
            <TapBtn label="+5" onAction={() => handleAddTime(5)} variant="default" />
            <TapBtn label="+10" onAction={() => handleAddTime(10)} variant="default" />
            <TapBtn label="Done" onAction={handleDone} variant="active" />
            <TapBtn label="Adjourn" onAction={handleAdjournCurrent} variant="danger" />
            <TapBtn label="Let Stand" onAction={handleLetStand} variant="warning" />
          </>
        )}
        {undo.available && (
          <TapBtn label={undo.label} onAction={handleUndo} variant="undo" />
        )}
      </div>

      {/* Next up strip */}
      {nextUp.length > 0 && (
        <div className="px-4 py-3 border-b border-court-border">
          <p className="text-xs text-court-text-dim font-semibold uppercase tracking-widest mb-2">Next Up</p>
          <div className="space-y-2">
            {nextUp.map((item, i) => (
              <div key={item.id} className="flex items-center gap-3 py-1">
                <span className="text-sm font-mono text-court-text-dim w-5 text-right shrink-0">{i + 1}</span>
                <span className="text-sm text-white truncate flex-1">{item.title}</span>
                <Badge status={item.status} label={item.statusLabel} />
                {item.timeLabel && <span className="text-xs text-court-text-dim">{item.timeLabel}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full list */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2 border-b border-court-border">
          <p className="text-xs text-court-text-dim font-semibold uppercase tracking-widest">
            All Cases ({fullList.length})
          </p>
        </div>
        {fullList.map((item) => (
          <div key={item.id}>
            <div
              onClick={() => setExpandedCaseId(expandedCaseId === item.id ? null : item.id)}
              className={`px-4 py-2.5 border-b border-court-border flex items-center gap-3 cursor-pointer ${
                activeCase?.id === item.id
                  ? 'bg-court-active-bg/50'
                  : item.status === 'concluded' || item.status === 'vacated'
                    ? 'opacity-50'
                    : ''
              }`}
            >
              <span className="text-sm font-mono text-court-text-dim w-6 text-right shrink-0">{item.position}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${activeCase?.id === item.id ? 'text-white font-semibold' : 'text-court-text'}`}>
                  {item.title}
                </p>
                {item.note && <p className="text-xs text-court-text-dim truncate italic">{item.note}</p>}
              </div>
              <Badge status={item.status} label={item.statusLabel} />
              {item.timeLabel && <span className="text-xs text-court-text-dim">{item.timeLabel}</span>}
            </div>

            {expandedCaseId === item.id && (
              <InlineActions caseId={item.id} onAction={handleInlineAction} />
            )}
            {editingNoteId === item.id && (
              <div className="px-4 py-2 bg-court-surface-2 border-b border-court-border">
                <NoteInput
                  initialValue={item.note ?? ''}
                  onSave={(note) => handleSaveNote(item.id, note)}
                  onCancel={() => setEditingNoteId(null)}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Global controls */}
      <div className="px-4 py-3 bg-court-surface border-t border-court-border mt-auto">
        <div className="flex flex-wrap gap-2">
          {courtStatus.isLive && (
            <>
              <TapBtn label="Start Next" onAction={handleStartNext} variant="active" wide />
              <TapBtn label={`${meta.judgeName.split(' ').pop()} Rose`} onAction={handleJudgeRose} variant="danger" wide />
              <TapBtn label="At Lunch" onAction={handleAtLunch} variant="warning" wide />
            </>
          )}
          {courtStatus.isPaused && (
            <TapBtn label="Resume" onAction={handleResume} variant="active" wide />
          )}
          <TapBtn label="End Day" onAction={handleEndDay} variant="dim" wide />
        </div>
      </div>

      {/* Sheets */}
      {activeSheet === 'adjourn' && (
        <AdjournSheet onConfirm={handleAdjournConfirm} onCancel={() => { setActiveSheet(null); setSheetCaseId(null); }} />
      )}
      {activeSheet === 'not_before' && (
        <NotBeforeSheet onConfirm={handleNotBeforeConfirm} onCancel={() => { setActiveSheet(null); setSheetCaseId(null); }} />
      )}

      <Toast message={toast} />
    </div>
  );
}

// ---- Sub-components (inline, not shared) ----

function StatusBar({ status }: { status: ReturnType<typeof import('../viewModel/courtDayViewModel').deriveCourtStatus> }) {
  const colorMap: Record<string, string> = {
    live: 'text-court-active bg-court-active-bg',
    judge_rose: 'text-court-danger bg-court-danger-bg',
    at_lunch: 'text-court-warning bg-court-warning-bg',
    adjourned: 'text-court-warning bg-court-warning-bg',
    ended: 'text-court-concluded bg-court-concluded-bg',
    scheduled: 'text-court-text-dim bg-court-surface-2',
  };
  const cls = colorMap[status.status] ?? colorMap.scheduled;
  return (
    <div className={`px-4 py-2.5 text-center border-b border-court-border ${cls}`}>
      <span className="font-bold text-sm tracking-widest uppercase">{status.label}</span>
      {status.message && <span className="ml-2 text-sm opacity-80">{status.message}</span>}
    </div>
  );
}

function ActiveCard({ c }: { c: ActiveCaseView }) {
  return (
    <div className="mx-4 my-3 p-4 rounded-xl bg-court-active-bg border border-court-active/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-court-active font-semibold uppercase tracking-widest mb-1">Current Case</p>
          <h2 className="text-xl font-bold text-white truncate">{c.title}</h2>
          {c.caseNumber && <p className="text-sm text-court-text-dim mt-0.5">{c.caseNumber}</p>}
        </div>
        <Badge status={c.status} label={c.statusLabel} />
      </div>
      <div className="mt-3 flex items-center gap-4 text-sm text-court-text-dim">
        {c.startedAt && <span>Started {c.startedAt}</span>}
        {c.estimatedMinutes != null && <span>~{c.estimatedMinutes} min remaining</span>}
      </div>
      {c.note && (
        <p className="mt-2 text-sm text-court-text-dim italic border-t border-court-active/20 pt-2">{c.note}</p>
      )}
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
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${cls[status] ?? cls.pending}`}>
      {label}
    </span>
  );
}

function TapBtn({
  label, onAction, variant, wide,
}: {
  label: string;
  onAction: () => Promise<void> | void;
  variant: 'default' | 'active' | 'danger' | 'warning' | 'undo' | 'dim';
  wide?: boolean;
}) {
  const [locked, setLocked] = useState(false);
  const colors: Record<string, string> = {
    default: 'bg-court-surface-2 text-court-text hover:bg-court-border',
    active: 'bg-court-active/20 text-court-active hover:bg-court-active/30',
    danger: 'bg-court-danger/20 text-court-danger hover:bg-court-danger/30',
    warning: 'bg-court-warning/20 text-court-warning hover:bg-court-warning/30',
    undo: 'bg-court-surface-2 text-court-warning border border-court-warning/40',
    dim: 'bg-court-surface-2 text-court-text-dim',
  };
  return (
    <button
      disabled={locked}
      onClick={async () => {
        if (locked) return;
        setLocked(true);
        try { await onAction(); } finally { setTimeout(() => setLocked(false), 500); }
      }}
      className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${colors[variant]} ${
        wide ? 'flex-1 min-w-[100px]' : 'min-w-[60px]'
      } ${locked ? 'opacity-50 pointer-events-none' : ''}`}
    >
      {label}
    </button>
  );
}

function InlineActions({ caseId, onAction }: { caseId: string; onAction: (id: string, action: string) => Promise<void> }) {
  const [locked, setLocked] = useState(false);
  const tap = async (action: string) => {
    if (locked) return;
    setLocked(true);
    try { await onAction(caseId, action); } finally { setTimeout(() => setLocked(false), 500); }
  };
  return (
    <div className={`px-4 py-2 bg-court-surface-2 border-b border-court-border flex flex-wrap gap-2 ${locked ? 'opacity-50 pointer-events-none' : ''}`}>
      {['Done', 'Adjourn', 'Not Before', 'Let Stand', 'Note'].map((label) => (
        <button
          key={label}
          onClick={() => tap(label.toLowerCase().replace(' ', '_'))}
          className="px-3 py-1.5 rounded-lg bg-court-surface text-court-text text-xs font-medium hover:bg-court-border transition-colors"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
}
