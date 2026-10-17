import { describe, expect, it } from 'vitest';
import { buildAgentConfigPatch, scheduleFromCadence } from './agent-settings';

const paused = { enabled: false };
const running = { enabled: true };

describe('buildAgentConfigPatch', () => {
  it('applies an explicit nextRunAt', () => {
    // Regression: the "Run next cycle now" control sends only nextRunAt. It
    // used to be dropped, so the route returned 200 and the schedule never moved.
    const when = '2026-10-17T12:00:00.000Z';
    const result = buildAgentConfigPatch({ nextRunAt: when }, running);
    expect(result).toEqual({ ok: true, patch: { nextRunAt: when } });
  });

  it('normalizes a parseable timestamp to ISO', () => {
    const result = buildAgentConfigPatch({ nextRunAt: '2026-10-17T12:00:00Z' }, running);
    expect(result.ok && result.patch.nextRunAt).toBe('2026-10-17T12:00:00.000Z');
  });

  it('accepts null to clear the schedule while paused', () => {
    expect(buildAgentConfigPatch({ nextRunAt: null }, paused)).toEqual({ ok: true, patch: { nextRunAt: null } });
  });

  it('refuses to clear the schedule while autopilot stays enabled', () => {
    // The runner reads a missing schedule as due now, so this would have
    // started a cycle instead of clearing one.
    expect(buildAgentConfigPatch({ nextRunAt: null }, running).ok).toBe(false);
    expect(buildAgentConfigPatch({ enabled: true, nextRunAt: null }, paused).ok).toBe(false);
  });

  it('allows clearing the schedule as part of pausing', () => {
    expect(buildAgentConfigPatch({ enabled: false, nextRunAt: null }, running)).toEqual({
      ok: true,
      patch: { enabled: false, nextRunAt: null },
    });
  });

  it('rejects loose date strings that Date.parse would accept', () => {
    // "0" parses to 2000-01-01, which is in the past, so the runner would
    // fire immediately on a value the API contract calls an ISO timestamp.
    for (const value of ['0', '1', '2026', 'December 17, 2026', '2026-10-17T12:00:00', '2026-13-01T00:00:00Z']) {
      expect(buildAgentConfigPatch({ nextRunAt: value }, running).ok, value).toBe(false);
    }
  });

  it('accepts ISO instants with an explicit zone', () => {
    for (const value of ['2026-10-17T12:00:00.000Z', '2026-10-17T12:00:00Z', '2026-10-17T12:00+02:00']) {
      expect(buildAgentConfigPatch({ nextRunAt: value }, running).ok, value).toBe(true);
    }
  });

  it('schedules a run when enabling and re-timing in one request', () => {
    const result = buildAgentConfigPatch({ enabled: true, cadenceHours: 6 }, paused);
    expect(result.ok && result.patch.nextRunAt).toEqual(expect.any(String));
  });

  it('rejects a nextRunAt that is not a timestamp', () => {
    for (const value of ['tomorrow', '', 42, true, {}]) {
      const result = buildAgentConfigPatch({ nextRunAt: value }, running);
      expect(result.ok, JSON.stringify(value)).toBe(false);
    }
  });

  it('lets an explicit nextRunAt win over the one derived from enabled', () => {
    const when = '2026-10-17T12:00:00.000Z';
    const result = buildAgentConfigPatch({ enabled: true, nextRunAt: when }, paused);
    expect(result.ok && result.patch).toEqual({ enabled: true, nextRunAt: when });
  });

  it('rejects a request that would change nothing', () => {
    expect(buildAgentConfigPatch({}, running).ok).toBe(false);
    expect(buildAgentConfigPatch({ unrelated: 1 }, running).ok).toBe(false);
  });

  it('still validates enabled and cadenceHours', () => {
    expect(buildAgentConfigPatch({ enabled: 'yes' }, running).ok).toBe(false);
    expect(buildAgentConfigPatch({ cadenceHours: 5 }, running).ok).toBe(false);
    expect(buildAgentConfigPatch({ cadenceHours: 6 }, running).ok).toBe(true);
  });

  it('clears the schedule when autopilot is turned off', () => {
    expect(buildAgentConfigPatch({ enabled: false }, running)).toEqual({ ok: true, patch: { enabled: false, nextRunAt: null } });
  });
});

describe('scheduleFromCadence', () => {
  const now = Date.parse('2026-10-17T12:00:00.000Z');
  const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();

  it('re-times from the last run, not from now', () => {
    // Last scan 5h ago, cadence widened to 24h: the next one is due 19h from
    // now, which is 24h after the last scan. Previously this scanned instantly.
    expect(scheduleFromCadence(24, hoursAgo(5), now)).toBe('2026-10-18T07:00:00.000Z');
  });

  it('runs now when the new cadence makes the schedule overdue', () => {
    // Last scan 5h ago, cadence tightened to 1h: already 4h late.
    expect(scheduleFromCadence(1, hoursAgo(5), now)).toBe('2026-10-17T12:00:00.000Z');
  });

  it('treats a never-run autopilot as owed a scan', () => {
    expect(scheduleFromCadence(6, null, now)).toBe('2026-10-17T12:00:00.000Z');
    expect(scheduleFromCadence(6, undefined, now)).toBe('2026-10-17T12:00:00.000Z');
  });

  it('falls back to now when lastRunAt is unreadable', () => {
    expect(scheduleFromCadence(6, 'not-a-date', now)).toBe('2026-10-17T12:00:00.000Z');
  });

  it('never schedules further out than one interval', () => {
    // A lastRunAt in the future (clock skew or a hand-edited store) must not
    // push the next scan beyond one full cadence.
    const future = new Date(now + 100 * 3_600_000).toISOString();
    expect(scheduleFromCadence(6, future, now)).toBe('2026-10-17T18:00:00.000Z');
  });

  it('spans the whole cadence when a scan just finished', () => {
    expect(scheduleFromCadence(12, new Date(now).toISOString(), now)).toBe('2026-10-18T00:00:00.000Z');
  });
});

describe('buildAgentConfigPatch cadence scheduling', () => {
  it('uses the interval rule when cadence changes', () => {
    const lastRunAt = new Date(Date.now() - 5 * 3_600_000).toISOString();
    const result = buildAgentConfigPatch({ cadenceHours: 24 }, { enabled: true, lastRunAt });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const scheduled = Date.parse(result.patch.nextRunAt as string);
    // ~19h out, not now. Generous window so the assertion is not clock-flaky.
    expect(scheduled - Date.now()).toBeGreaterThan(18.5 * 3_600_000);
    expect(scheduled - Date.now()).toBeLessThan(19.5 * 3_600_000);
  });

  it('still clears the schedule when the cadence change also pauses', () => {
    const result = buildAgentConfigPatch({ enabled: false, cadenceHours: 24 }, { enabled: true, lastRunAt: null });
    expect(result).toEqual({ ok: true, patch: { enabled: false, cadenceHours: 24, nextRunAt: null } });
  });
});
