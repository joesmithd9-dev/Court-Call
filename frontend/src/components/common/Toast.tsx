interface Props {
  message: string | null;
}

export function Toast({ message }: Props) {
  if (!message) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-court-surface-2 border border-court-border text-sm text-white font-medium shadow-lg animate-fade-in">
      {message}
    </div>
  );
}
