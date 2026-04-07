import { useState } from 'react';

interface Props {
  initialValue?: string;
  onSave: (note: string) => void;
  onCancel: () => void;
}

export function NoteInput({ initialValue = '', onSave, onCancel }: Props) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="flex gap-2 mt-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add note..."
        autoFocus
        className="flex-1 bg-court-surface-2 text-white rounded-lg px-3 py-1.5 text-sm border border-court-border focus:border-court-active outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave(value);
          if (e.key === 'Escape') onCancel();
        }}
      />
      <button
        onClick={() => onSave(value)}
        className="px-3 py-1.5 rounded-lg bg-court-active/20 text-court-active text-xs font-semibold"
      >
        Save
      </button>
      <button
        onClick={onCancel}
        className="px-3 py-1.5 rounded-lg bg-court-surface-2 text-court-text-dim text-xs"
      >
        Cancel
      </button>
    </div>
  );
}
