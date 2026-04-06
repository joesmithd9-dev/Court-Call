import { useState } from 'react';

interface Props {
  onConfirm: (time: string) => void;
  onCancel: () => void;
}

export function AdjournSheet({ onConfirm, onCancel }: Props) {
  const [time, setTime] = useState('');

  const quickTimes = ['+15 min', '+30 min', '+1 hr', 'Tomorrow'];

  const handleQuick = (label: string) => {
    const now = new Date();
    switch (label) {
      case '+15 min':
        now.setMinutes(now.getMinutes() + 15);
        break;
      case '+30 min':
        now.setMinutes(now.getMinutes() + 30);
        break;
      case '+1 hr':
        now.setHours(now.getHours() + 1);
        break;
      case 'Tomorrow':
        now.setDate(now.getDate() + 1);
        now.setHours(10, 0, 0, 0);
        break;
    }
    onConfirm(now.toISOString());
  };

  const handleCustom = () => {
    if (!time) return;
    const [h, m] = time.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    onConfirm(d.toISOString());
  };

  return (
    <div className="fixed inset-x-0 bottom-0 bg-court-surface border-t border-court-border p-4 rounded-t-2xl z-50 animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Adjourn To</h3>
        <button onClick={onCancel} className="text-court-text-dim text-sm px-2 py-1">
          Cancel
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {quickTimes.map((label) => (
          <button
            key={label}
            onClick={() => handleQuick(label)}
            className="px-3 py-2 rounded-lg bg-court-surface-2 text-court-text text-sm font-medium hover:bg-court-border"
          >
            {label}
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
          className="px-4 py-2 rounded-lg bg-court-danger/20 text-court-danger text-sm font-semibold disabled:opacity-40"
        >
          Adjourn
        </button>
      </div>
    </div>
  );
}
