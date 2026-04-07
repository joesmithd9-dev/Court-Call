/** Audit trail logger — all state changes logged to console */
export function auditLog(action: string, detail: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  console.log(`[AUDIT ${ts}] ${action}`, detail);
}
