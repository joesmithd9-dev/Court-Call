import { useState, useCallback } from 'react';
import type { CourtDayStatus } from '../../types';

interface Props {
  status: CourtDayStatus;
  judgeName: string;
  onJudgeRose: () => Promise<void>;
  onResume: () => Promise<void>;
  onStartNext: () => Promise<void>;
  onEndDay: () => Promise<void>;
  onAtLunch: () => Promise<void>;
}

export function GlobalControls({
  status,
  judgeName,
  onJudgeRose,
  onResume,
  onStartNext,
  onEndDay,
  onAtLunch,
}: Props) {
  const isLive = status === 'live';
  const isPaused = status === 'judge_rose' || status === 'at_lunch' || status === 'adjourned';

  return (
    <div className="px-4 py-3 bg-court-surface border-t border-court-border mt-auto">
      <div className="flex flex-wrap gap-2">
        {isLive && (
          <>
            <ControlBtn label="Start Next" onAction={onStartNext} variant="active" />
            <ControlBtn label={`${judgeName.split(' ').pop()} Rose`} onAction={onJudgeRose} variant="danger" />
            <ControlBtn label="At Lunch" onAction={onAtLunch} variant="warning" />
          </>
        )}
        {isPaused && (
          <ControlBtn label="Resume" onAction={onResume} variant="active" />
        )}
        <ControlBtn label="End Day" onAction={onEndDay} variant="dim" />
      </div>
    </div>
  );
}

// 6.4: Tap-protected control button
function ControlBtn({
  label,
  onAction,
  variant,
}: {
  label: string;
  onAction: () => Promise<void>;
  variant: 'active' | 'danger' | 'warning' | 'dim';
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
    active: 'bg-court-active/20 text-court-active',
    danger: 'bg-court-danger/20 text-court-danger',
    warning: 'bg-court-warning/20 text-court-warning',
    dim: 'bg-court-surface-2 text-court-text-dim',
  };

  return (
    <button
      onClick={handleTap}
      disabled={locked}
      className={`px-4 py-2.5 rounded-lg text-sm font-semibold flex-1 min-w-[100px] transition-colors ${colors[variant]} ${
        locked ? 'opacity-50 pointer-events-none' : ''
      }`}
    >
      {label}
    </button>
  );
}
