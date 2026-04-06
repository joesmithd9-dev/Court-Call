interface Props {
  message: string | null;
}

export function CriticalErrorBanner({ message }: Props) {
  if (!message) return null;

  return (
    <div className="px-4 py-3 bg-court-danger text-white text-center text-sm font-bold tracking-wide">
      {message}
    </div>
  );
}
