import { useState, useEffect, useCallback } from 'react';
import type { CourtCase, LastAction } from '../../types';

interface Props {
  currentCase: CourtCase | undefined;
  lastAction: LastAction | null;
  onAddTime: (minutes: number) => Promise<void>;
  onDone: () => Promise<void>;
  onAdjourn: () => void;
  onLetStand: () => Promise<void>;
  onUndo: () => Promise<void>;
}

const UNDO_WINDOW_MS = 10_000;

export function QuickActionBar({
  currentCase,
  lastAction,
  onAddTime,
  onDone,
  onAdjourn,
  onLetStand,
  onUndo,
}: Props) {
  const [undoRemaining, setUndoRemaining] = useState(0);

  useEffect(() => {
    if (!lastAction) {
      setUndoRemaining(0);
      return;
    }

    const updateRemaining = () => {
      const elapsed = Date.now() - lastAction.timestamp;
      const remaining = Math.max(0, UNDO_WINDOW_MS - elapsed);
      setUndoRemaining(remaining);
      if (remaining <= 0) clearInterval(timer);
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 100);
    return () => clearInterval(timer);
  }, [lastAction]);

  const undoValid = undoRemaining > 0;

  return (
    <div className="px-4 py-3 flex flex-wrap gap-2 border-b border-court-border">
      {currentCase && (
        <>
          <TapBtn label="+5" onAction={() => onAddTime(5)} variant="default" />
          <TapBtn label="+10" onAction={() => onAddTime(10)} variant="default" />
          <TapBtn label="Done" onAction={onDone} variant="active" />
          <TapBtn label="Adjourn" onAction={async () => onAdjourn()} variant="danger" />
          <TapBtn label="Let Stand" onAction={onLetStand} variant="warning" />
        </>
      )}
      {undoValid && (
        <TapBtn
          label={`Undo (${Math.ceil(undoRemaining / 1000)}s)`}
          onAction={onUndo}
          variant="undo"
        />
      )}
    </div>
  );
}

function TapBtn({
  label,
  onAction,
  variant,
}: {
  label: string;
  onAction: () => Promise<void>;
  variant: 'default' | 'active' | 'danger' | 'warning' | 'undo';
}) {
  const [locked, setLocked] = useState(false);

  const handleTap = useCallback(async () => {
    if (locked) return;
    setLocked(true);
    try {
      await onAction();
    } finally {
      setTimeout(() => setLocked(false), 500);
    }
  }, [locked, onAction]);

  const colors = {
    default: 'bg-court-surface-2 text-court-text hover:bg-court-border active:bg-court-border',
    active: 'bg-court-active/20 text-court-active hover:bg-court-active/30 active:bg-court-active/40',
    danger: 'bg-court-danger/20 text-court-danger hover:bg-court-danger/30 active:bg-court-danger/40',
    warning: 'bg-court-warning/20 text-court-warning hover:bg-court-warning/30 active:bg-court-warning/40',
    undo: 'bg-court-surface-2 text-court-warning border border-court-warning/40 hover:bg-court-warning/10',
  };

  return (
    <button
      className={`px-4 py-2.5 rounded-lg text-sm font-semibold min-w-[60px] transition-colors ${colors[variant]} ${
        locked ? 'opacity-50 pointer-events-none' : ''
      }`}
      onClick={handleTap}
      disabled={locked}
    >
      {label}
    </button>
  );
}
