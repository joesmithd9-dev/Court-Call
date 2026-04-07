import { useState } from 'react';
import { useCourtStore } from '../store/useCourtStore';
import { QueueRow } from './QueueRow';
import type { ViewRole } from '../lib/types';

const CHIPS = [5, 10, 15, 20, 30];

interface Props { variant: ViewRole }

export function GapFillerBar({ variant }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const gapFillerMatters = useCourtStore(s => s.gapFillerMatters);
  const matches = selected !== null ? gapFillerMatters(selected) : [];

  return (
    <div className="bg-amber-950/20 border-b border-amber-900/40 px-4 py-3">
      <div className="text-[10px] font-bold text-amber-400 uppercase tracking-widest font-serif mb-2">
        Gap Filler — I have time for:
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        {CHIPS.map(m => (
          <button
            key={m}
            onClick={() => setSelected(selected === m ? null : m)}
            className={`px-3 py-1.5 rounded text-xs font-semibold border transition-colors font-serif ${
              selected === m
                ? 'bg-amber-600 text-white border-amber-500'
                : 'bg-slate-800 text-slate-300 border-slate-600 hover:border-amber-600'
            }`}
          >
            {m} min
          </button>
        ))}
        {selected !== null && (
          <button
            onClick={() => setSelected(null)}
            className="text-[11px] text-slate-500 hover:text-slate-300 ml-1"
          >
            Clear
          </button>
        )}
      </div>
      {selected !== null && (
        <div className="mt-2 rounded border border-slate-700 bg-slate-800/50 overflow-hidden">
          {matches.length === 0 ? (
            <div className="p-3 text-xs text-red-400 font-semibold">
              No matters fit within {selected} minutes
            </div>
          ) : (
            matches.map(m => <QueueRow key={m.id} matter={m} variant={variant} compact />)
          )}
        </div>
      )}
    </div>
  );
}
