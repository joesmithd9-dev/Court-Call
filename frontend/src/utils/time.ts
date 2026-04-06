export function formatTime(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function relativeMinutes(iso: string | undefined): string {
  if (!iso) return '';
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (diff <= 0) return 'Now';
  if (diff < 60) return `~${diff} min`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `~${h}h ${m}m`;
}

export function minutesFromNow(minutes: number): string {
  const d = new Date(Date.now() + minutes * 60000);
  return d.toISOString();
}
