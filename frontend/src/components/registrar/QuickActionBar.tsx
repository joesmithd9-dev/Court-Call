import type { CourtCase } from '../../types';

interface Props {
  currentCase: CourtCase | undefined;
  onAddTime: (minutes: number) => void;
  onDone: () => void;
  onAdjourn: () => void;
  onLetStand: () => void;
}

export function QuickActionBar({ currentCase, onAddTime, onDone, onAdjourn, onLetStand }: Props) {
  if (!currentCase) return null;

  return (
    <div className="px-4 py-3 flex flex-wrap gap-2 border-b border-court-border">
      <ActionBtn label="+5" onClick={() => onAddTime(5)} variant="default" />
      <ActionBtn label="+10" onClick={() => onAddTime(10)} variant="default" />
      <ActionBtn label="Done" onClick={onDone} variant="active" />
      <ActionBtn label="Adjourn" onClick={onAdjourn} variant="danger" />
      <ActionBtn label="Let Stand" onClick={onLetStand} variant="warning" />
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  variant,
}: {
  label: string;
  onClick: () => void;
  variant: 'default' | 'active' | 'danger' | 'warning';
}) {
  const colors = {
    default: 'bg-court-surface-2 text-court-text hover:bg-court-border active:bg-court-border',
    active: 'bg-court-active/20 text-court-active hover:bg-court-active/30 active:bg-court-active/40',
    danger: 'bg-court-danger/20 text-court-danger hover:bg-court-danger/30 active:bg-court-danger/40',
    warning: 'bg-court-warning/20 text-court-warning hover:bg-court-warning/30 active:bg-court-warning/40',
  };

  return (
    <button
      className={`px-4 py-2.5 rounded-lg text-sm font-semibold min-w-[60px] transition-colors ${colors[variant]}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
