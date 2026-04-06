import { formatTime, relativeMinutes } from '../../utils/time';
import type { CourtCase } from '../../types';

interface Props {
  courtCase: CourtCase;
  showRelative?: boolean;
}

export function TimeChip({ courtCase, showRelative = false }: Props) {
  const c = courtCase;

  if (c.status === 'adjourned' && c.adjournedToTime) {
    return <Chip label={`Adj. ${formatTime(c.adjournedToTime)}`} variant="danger" />;
  }

  if (c.status === 'not_before' && c.notBeforeTime) {
    return <Chip label={`Not before ${formatTime(c.notBeforeTime)}`} variant="dim" />;
  }

  if (c.predictedStartTime) {
    return (
      <Chip
        label={showRelative ? relativeMinutes(c.predictedStartTime) : formatTime(c.predictedStartTime)}
        variant="default"
      />
    );
  }

  if (c.scheduledTime) {
    return <Chip label={formatTime(c.scheduledTime)} variant="dim" />;
  }

  return null;
}

function Chip({ label, variant }: { label: string; variant: 'default' | 'dim' | 'danger' }) {
  const colors = {
    default: 'text-court-text-dim',
    dim: 'text-court-text-dim opacity-60',
    danger: 'text-court-danger',
  };
  return <span className={`text-xs font-medium ${colors[variant]}`}>{label}</span>;
}
