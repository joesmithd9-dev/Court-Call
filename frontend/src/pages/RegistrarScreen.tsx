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
  reorderCase,
  undoAction,
} from '../api/client';
import type { CourtStatusView, QueueItemView } from '../viewModel/courtDayViewModel';
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
  const [durationPickerId, setDurationPickerId] = useState<string | null>(null);

  const id = courtDayId!;

  const getEventId = (result: Record<string, unknown>): string =>
    (result.lastEventId as string) ?? `seq-${result.lastSequence ?? Date.now()}`;

  const recordAction = useCallback(
    (eventId: string, actionType: string, caseId: string) => {
      setLastAction({ eventId, actionType, caseId, timestamp: Date.now() });
    },
    [setLastAction]
  );

  // ---- Action handlers ----

  const act = useCallback(async (caseId: string, action: string, extra?: Record<string, unknown>) => {
    switch (action) {
      case 'done': {
        const r = await updateCase(id, caseId, { status: 'concluded' });
        recordAction(getEventId(r as any), 'done', caseId);
        replaceSnapshot(r);
        showToast('Concluded');
        break;
      }
      case 'calling': {
        const r = await updateCase(id, caseId, { status: 'calling' });
        recordAction(getEventId(r as any), 'calling', caseId);
        replaceSnapshot(r);
        showToast('Calling');
        break;
      }
      case 'hearing': {
        const r = await updateCase(id, caseId, { status: 'hearing' });
        recordAction(getEventId(r as any), 'hearing', caseId);
        replaceSnapshot(r);
        showToast('Now hearing');
        break;
      }
      case 'stood_down': {
        const r = await updateCase(id, caseId, { status: 'stood_down' });
        recordAction(getEventId(r as any), 'stood_down', caseId);
        replaceSnapshot(r);
        showToast('Stood down');
        break;
      }
      case 'liberty_to_mention': {
        const r = await updateCase(id, caseId, { status: 'concluded', note: 'Liberty to mention' });
        recordAction(getEventId(r as any), 'liberty_to_mention', caseId);
        replaceSnapshot(r);
        showToast('Liberty to mention');
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
      case 'set_duration': {
        const mins = extra?.minutes as number;
        if (mins == null) break;
        const r = await updateCase(id, caseId, { estimatedMinutes: mins });
        recordAction(getEventId(r as any), 'set_duration', caseId);
        replaceSnapshot(r);
        showToast(`${mins}m`);
        setDurationPickerId(null);
        break;
      }
      case 'take_next': {
        // Move this case to position 2 (right after current)
        const r = await reorderCase(id, { caseId, newPosition: 1 });
        replaceSnapshot(r);
        showToast('Moved to next');
        break;
      }
      case 'move_up': {
        const item = vm.ready ? vm.fullList.find(i => i.id === caseId) : null;
        if (!item || item.position <= 1) break;
        const r = await reorderCase(id, { caseId, newPosition: item.position - 1 });
        replaceSnapshot(r);
        showToast('Moved up');
        break;
      }
      case 'move_down': {
        const item = vm.ready ? vm.fullList.find(i => i.id === caseId) : null;
        if (!item) break;
        const r = await reorderCase(id, { caseId, newPosition: item.position + 1 });
        replaceSnapshot(r);
        showToast('Moved down');
        break;
      }
    }
    setExpandedCaseId(null);
  }, [id, vm, replaceSnapshot, recordAction, showToast]);

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

  const handleUndo = useCallback(async () => {
    const action = useCourtDayStore.getState().lastAction;
    if (!action || Date.now() - action.timestamp > 10_000) return;
    const result = await undoAction(id, action.eventId);
    clearLastAction();
    replaceSnapshot(result);
    showToast('Undone');
  }, [id, clearLastAction, replaceSnapshot, showToast]);

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

  const { meta, courtStatus, activeCase, fullList, undo, toast, concluded } = vm;
  const pendingCount = fullList.filter((i) => i.status === 'pending' || i.status === 'calling').length;
  const totalEstMin = fullList
    .filter(i => i.status !== 'concluded' && i.status !== 'vacated')
    .reduce((s, i) => s + (i.estimatedMinutes ?? 0), 0);

  return (
    <div className="flex flex-col min-h-dvh">
      {/* Header */}
      <header className="px-4 py-2.5 bg-court-surface border-b border-court-border">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-white truncate">
              {meta.courtName}
              {meta.courtRoom && <span className="text-court-text-dim font-normal"> — {meta.courtRoom}</span>}
            </h1>
            <p className="text-xs text-court-text-dim">{meta.judgeName} — {meta.dateLabel}</p>
          </div>
          <span className={`w-2 h-2 rounded-full shrink-0 ${meta.connected ? 'bg-court-active' : 'bg-court-danger'}`} />
        </div>
      </header>

      {meta.criticalError && (
        <div className="px-4 py-2 bg-court-danger text-white text-center text-xs font-bold">{meta.criticalError}</div>
      )}

      <StatusBar status={courtStatus} />

      {/* Active case — compact, always visible */}
      {activeCase && (
        <div className="px-4 py-2.5 bg-court-active-bg/40 border-b border-court-active/20">
          <div className="flex items-center gap-3">
            <span className="text-xs text-court-active font-bold uppercase tracking-widest shrink-0">Now</span>
            <span className="text-sm text-white font-semibold truncate flex-1">{activeCase.title}</span>
            {activeCase.estimatedMinutes != null && (
              <span className={`text-xs font-bold tabular-nums ${activeCase.durationColor}`}>{activeCase.durationLabel}</span>
            )}
            <Badge status={activeCase.status} label={activeCase.statusLabel} />
          </div>
          {/* Quick actions for active case */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Chip label="+5" onClick={() => { if (!activeCase) return; act(activeCase.id, 'set_duration', { minutes: (activeCase.estimatedMinutes ?? 0) + 5 }); }} />
            <Chip label="+10" onClick={() => { if (!activeCase) return; act(activeCase.id, 'set_duration', { minutes: (activeCase.estimatedMinutes ?? 0) + 10 }); }} />
            <Chip label="Done" onClick={() => act(activeCase.id, 'done')} variant="active" />
            <Chip label="Stand" onClick={() => act(activeCase.id, 'stood_down')} variant="warning" />
            <Chip label="Adjourn" onClick={() => { setSheetCaseId(activeCase.id); setActiveSheet('adjourn'); }} variant="danger" />
            {undo.available && <Chip label={undo.label} onClick={handleUndo} variant="undo" />}
          </div>
        </div>
      )}

      {/* Summary bar */}
      <div className="px-4 py-1.5 bg-court-surface-2 border-b border-court-border flex items-center gap-3 text-xs text-court-text-dim">
        <span>{fullList.length} matters</span>
        <span className="text-court-active">{pendingCount} pending</span>
        <span>{concluded.length} done</span>
        {totalEstMin > 0 && <span className="ml-auto">~{totalEstMin}m remaining</span>}
      </div>

      {/* ===== CALLOVER LIST — the primary view ===== */}
      <div className="flex-1 overflow-y-auto">
        {fullList.map((item) => {
          const isCurrent = activeCase?.id === item.id;
          const isDone = item.status === 'concluded' || item.status === 'vacated';
          const isExpanded = expandedCaseId === item.id;

          return (
            <div key={item.id}>
              <div
                onClick={() => setExpandedCaseId(isExpanded ? null : item.id)}
                className={`px-4 py-2 border-b border-court-border cursor-pointer ${
                  isCurrent ? 'bg-court-active-bg/30' :
                  isDone ? 'opacity-40' :
                  item.isNotBefore ? 'border-l-2 border-l-court-warning/60' :
                  ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-court-text-dim w-5 text-right shrink-0">{item.position}</span>
                  <span className={`text-sm truncate flex-1 ${isCurrent ? 'text-white font-semibold' : isDone ? 'text-court-text-dim line-through' : 'text-white'}`}>
                    {item.title}
                  </span>
                  {item.matterTypeLabel && (
                    <span className="text-[10px] text-court-text-dim bg-court-surface-2 px-1 py-0.5 rounded shrink-0">{item.matterTypeLabel}</span>
                  )}
                  {/* Duration — tappable to change */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setDurationPickerId(durationPickerId === item.id ? null : item.id); }}
                    className={`text-xs font-bold tabular-nums shrink-0 px-1.5 py-0.5 rounded ${item.durationLabel ? item.durationColor : 'text-court-text-dim'} hover:bg-court-surface-2`}
                  >
                    {item.durationLabel || '—'}
                  </button>
                  <Badge status={item.status} label={item.statusLabel} />
                  {item.timeLabel && (
                    <span className={`text-[10px] shrink-0 ${item.isNotBefore ? 'text-court-warning font-medium' : 'text-court-text-dim'}`}>
                      {item.timeLabel}
                    </span>
                  )}
                </div>

                {/* Row 2: note if present */}
                {item.note && (
                  <p className="text-[10px] text-court-text-dim italic ml-7 mt-0.5 truncate">{item.note}</p>
                )}
              </div>

              {/* Duration picker */}
              {durationPickerId === item.id && (
                <div className="px-4 py-1.5 bg-court-surface border-b border-court-border flex items-center gap-1.5 ml-7">
                  <span className="text-[10px] text-court-text-dim mr-1">Est:</span>
                  {[3, 5, 10, 15, 20, 30, 45, 60].map((m) => (
                    <button
                      key={m}
                      onClick={() => act(item.id, 'set_duration', { minutes: m })}
                      className={`px-2 py-1 rounded text-[10px] font-semibold ${
                        item.estimatedMinutes === m
                          ? 'bg-court-active/20 text-court-active'
                          : 'bg-court-surface-2 text-court-text-dim hover:bg-court-border'
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              )}

              {/* Expanded actions */}
              {isExpanded && !isDone && (
                <RowActions
                  item={item}
                  isCurrent={isCurrent}
                  onAction={act}
                  onNote={() => setEditingNoteId(item.id)}
                />
              )}

              {/* Note editor */}
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
          );
        })}
      </div>

      {/* Bottom controls */}
      <div className="px-4 py-2.5 bg-court-surface border-t border-court-border">
        <div className="flex flex-wrap gap-2">
          <TapBtn label="Start Next" onAction={handleStartNext} variant="active" wide />
          {courtStatus.isLive && (
            <>
              <TapBtn label={`${meta.judgeName.split(' ').pop()} Rose`} onAction={handleJudgeRose} variant="danger" wide />
              <TapBtn label="Lunch" onAction={handleAtLunch} variant="warning" wide />
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

// ---- Row Actions ----

function RowActions({
  item,
  isCurrent,
  onAction,
  onNote,
}: {
  item: QueueItemView;
  isCurrent: boolean;
  onAction: (caseId: string, action: string, extra?: Record<string, unknown>) => Promise<void>;
  onNote: () => void;
}) {
  const [locked, setLocked] = useState(false);
  const tap = async (action: string, extra?: Record<string, unknown>) => {
    if (locked) return;
    setLocked(true);
    try { await onAction(item.id, action, extra); } finally { setTimeout(() => setLocked(false), 500); }
  };

  return (
    <div className={`px-4 py-2 bg-court-surface-2 border-b border-court-border ${locked ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Primary actions */}
      <div className="flex flex-wrap gap-1.5">
        {item.status === 'pending' && (
          <Chip label="Calling" onClick={() => tap('calling')} variant="warning" />
        )}
        {(item.status === 'pending' || item.status === 'calling') && (
          <Chip label="Hear Now" onClick={() => tap('hearing')} variant="active" />
        )}
        {!isCurrent && item.status !== 'concluded' && (
          <Chip label="Done" onClick={() => tap('done')} />
        )}
        <Chip label="Stand" onClick={() => tap('stood_down')} />
        <Chip label="Adjourn" onClick={() => tap('adjourn')} variant="danger" />
        <Chip label="Not Before" onClick={() => tap('not_before')} />
        <Chip label="Note" onClick={onNote} />
      </div>
      {/* Queue + other actions */}
      <div className="flex flex-wrap gap-1.5 mt-1.5 pt-1.5 border-t border-court-border/50">
        <Chip label="Take Next" onClick={() => tap('take_next')} variant="active" />
        <Chip label="Move Up" onClick={() => tap('move_up')} />
        <Chip label="Move Down" onClick={() => tap('move_down')} />
        <Chip label="Liberty to Mention" onClick={() => tap('liberty_to_mention')} />
      </div>
    </div>
  );
}

// ---- Sub-components ----

function StatusBar({ status }: { status: CourtStatusView }) {
  const colorMap: Record<string, string> = {
    live: 'text-court-active bg-court-active-bg',
    judge_rose: 'text-court-danger bg-court-danger-bg',
    at_lunch: 'text-court-warning bg-court-warning-bg',
    adjourned: 'text-court-warning bg-court-warning-bg',
    ended: 'text-court-concluded bg-court-concluded-bg',
    scheduled: 'text-court-text-dim bg-court-surface-2',
  };
  return (
    <div className={`px-4 py-2 text-center border-b border-court-border ${colorMap[status.status] ?? colorMap.scheduled}`}>
      <span className="font-bold text-xs tracking-widest uppercase">{status.label}</span>
      {status.message && <span className="ml-2 text-xs opacity-80">{status.message}</span>}
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

function Chip({
  label, onClick, variant = 'default',
}: {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'active' | 'danger' | 'warning' | 'undo';
}) {
  const cls: Record<string, string> = {
    default: 'bg-court-surface text-court-text hover:bg-court-border',
    active: 'bg-court-active/20 text-court-active hover:bg-court-active/30',
    danger: 'bg-court-danger/20 text-court-danger hover:bg-court-danger/30',
    warning: 'bg-court-warning/20 text-court-warning hover:bg-court-warning/30',
    undo: 'bg-court-surface text-court-warning border border-court-warning/30',
  };
  return (
    <button onClick={onClick} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${cls[variant]}`}>
      {label}
    </button>
  );
}

function TapBtn({
  label, onAction, variant, wide,
}: {
  label: string;
  onAction: () => Promise<void> | void;
  variant: 'active' | 'danger' | 'warning' | 'dim';
  wide?: boolean;
}) {
  const [locked, setLocked] = useState(false);
  const colors: Record<string, string> = {
    active: 'bg-court-active/20 text-court-active hover:bg-court-active/30',
    danger: 'bg-court-danger/20 text-court-danger hover:bg-court-danger/30',
    warning: 'bg-court-warning/20 text-court-warning hover:bg-court-warning/30',
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
      className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${colors[variant]} ${
        wide ? 'flex-1 min-w-[80px]' : ''
      } ${locked ? 'opacity-50 pointer-events-none' : ''}`}
    >
      {label}
    </button>
  );
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
}
