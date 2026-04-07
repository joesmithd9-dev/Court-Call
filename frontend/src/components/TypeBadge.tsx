import type { MatterType } from '../lib/types';

const TYPE_COLORS: Record<MatterType, string> = {
  Mention:    'bg-slate-700/40 text-slate-300 border-slate-600',
  Bail:       'bg-amber-900/30 text-amber-300 border-amber-700',
  Consent:    'bg-teal-900/30 text-teal-300 border-teal-700',
  Directions: 'bg-sky-900/30 text-sky-300 border-sky-700',
  Hearing:    'bg-blue-900/30 text-blue-300 border-blue-700',
  Sentence:   'bg-red-900/30 text-red-300 border-red-700',
  Motion:     'bg-purple-900/30 text-purple-300 border-purple-700',
  Other:      'bg-slate-700/30 text-slate-400 border-slate-600',
};

interface Props { type: MatterType; className?: string }

export function TypeBadge({ type, className = '' }: Props) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${TYPE_COLORS[type]} ${className}`}>
      {type}
    </span>
  );
}
