import { useState } from 'react';

interface Props {
  onConfirm: (time: string) => void;
  onCancel: () => void;
}

export function NotBeforeSheet({ onConfirm, onCancel }: Props) {
  const [time, setTime] = useState('');

  const quickTimes = ['11:00', '12:00', '14:00', '14:30', '15:00'];

  const handleQuick = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    onConfirm(d.toISOString());
  };

  const handleCustom = () => {
    if (!time) return;
    handleQuick(time);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 bg-court-surface border-t border-court-border p-4 rounded-t-2xl z-50 animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Not Before</h3>
        <button onClick={onCancel} className="text-court-text-dim text-sm px-2 py-1">
          Cancel
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {quickTimes.map((t) => (
          <button
            key={t}
            onClick={() => handleQuick(t)}
            className="px-3 py-2 rounded-lg bg-court-surface-2 text-court-text text-sm font-medium hover:bg-court-border"
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="flex-1 bg-court-surface-2 text-white rounded-lg px-3 py-2 text-sm border border-court-border focus:border-court-active outline-none"
        />
        <button
          onClick={handleCustom}
          disabled={!time}
          className="px-4 py-2 rounded-lg bg-court-surface-2 text-white text-sm font-semibold disabled:opacity-40"
        >
          Set
        </button>
      </div>
    </div>
  );
}
