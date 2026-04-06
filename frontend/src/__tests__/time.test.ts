import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatTime, relativeMinutes, minutesFromNow } from '../utils/time';

describe('formatTime', () => {
  it('returns empty string for undefined', () => {
    expect(formatTime(undefined)).toBe('');
  });

  it('formats ISO string to HH:MM', () => {
    // Use a fixed timezone-safe assertion
    const result = formatTime('2026-04-06T14:30:00Z');
    expect(result).toMatch(/\d{2}:\d{2}/);
  });
});

describe('relativeMinutes', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty for undefined', () => {
    expect(relativeMinutes(undefined)).toBe('');
  });

  it('returns "Now" for past time', () => {
    const past = new Date(Date.now() - 60000).toISOString();
    expect(relativeMinutes(past)).toBe('Now');
  });

  it('returns "~N min" for short future', () => {
    const future = new Date(Date.now() + 25 * 60000).toISOString();
    const result = relativeMinutes(future);
    expect(result).toMatch(/^~\d+ min$/);
  });

  it('returns hours and minutes for > 60 min', () => {
    const future = new Date(Date.now() + 90 * 60000).toISOString();
    const result = relativeMinutes(future);
    expect(result).toMatch(/^~1h 30m$/);
  });
});

describe('minutesFromNow', () => {
  it('returns valid ISO string', () => {
    const result = minutesFromNow(10);
    expect(() => new Date(result)).not.toThrow();
    const d = new Date(result);
    const diff = Math.round((d.getTime() - Date.now()) / 60000);
    expect(diff).toBeGreaterThanOrEqual(9);
    expect(diff).toBeLessThanOrEqual(11);
  });
});
