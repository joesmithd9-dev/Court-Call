interface Props {
  label: string;
  count?: number;
  className?: string;
}

export function SectionHeader({ label, count, className = '' }: Props) {
  return (
    <div className={`flex items-center gap-2 px-4 py-2 bg-slate-800/50 border-b border-slate-700/50 ${className}`}>
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-serif">{label}</span>
      {count !== undefined && (
        <span className="text-[10px] text-slate-500 bg-slate-700/50 border border-slate-600 rounded-full px-2 py-px font-semibold tabular-nums">
          {count}
        </span>
      )}
      <div className="flex-1 h-px bg-slate-700/50" />
    </div>
  );
}
