interface Props { minutes: number; className?: string }

export function DurationBadge({ minutes, className = '' }: Props) {
  const band =
    minutes <= 5 ? 'bg-emerald-900/30 text-emerald-300 border-emerald-700' :
    minutes <= 10 ? 'bg-lime-900/30 text-lime-300 border-lime-700' :
    minutes <= 20 ? 'bg-amber-900/30 text-amber-300 border-amber-700' :
    minutes <= 30 ? 'bg-orange-900/30 text-orange-300 border-orange-700' :
    'bg-red-900/30 text-red-300 border-red-700';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border tabular-nums ${band} ${className}`}>
      {minutes}m
    </span>
  );
}
