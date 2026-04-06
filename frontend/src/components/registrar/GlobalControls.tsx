import type { CourtDayStatus } from '../../types';

interface Props {
  status: CourtDayStatus;
  judgeName: string;
  onJudgeRose: () => void;
  onResume: () => void;
  onStartNext: () => void;
  onEndDay: () => void;
  onAtLunch: () => void;
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
            <ControlBtn label="Start Next" onClick={onStartNext} variant="active" />
            <ControlBtn label={`${judgeName.split(' ').pop()} Rose`} onClick={onJudgeRose} variant="danger" />
            <ControlBtn label="At Lunch" onClick={onAtLunch} variant="warning" />
          </>
        )}
        {isPaused && (
          <ControlBtn label="Resume" onClick={onResume} variant="active" />
        )}
        <ControlBtn label="End Day" onClick={onEndDay} variant="dim" />
      </div>
    </div>
  );
}

function ControlBtn({
  label,
  onClick,
  variant,
}: {
  label: string;
  onClick: () => void;
  variant: 'active' | 'danger' | 'warning' | 'dim';
}) {
  const colors = {
    active: 'bg-court-active/20 text-court-active',
    danger: 'bg-court-danger/20 text-court-danger',
    warning: 'bg-court-warning/20 text-court-warning',
    dim: 'bg-court-surface-2 text-court-text-dim',
  };

  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 rounded-lg text-sm font-semibold flex-1 min-w-[100px] transition-colors ${colors[variant]}`}
    >
      {label}
    </button>
  );
}
