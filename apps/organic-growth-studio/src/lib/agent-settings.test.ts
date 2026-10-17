import { describe, expect, it } from 'vitest';
import { buildAgentConfigPatch } from './agent-settings';

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

  it('accepts null to clear the schedule', () => {
    expect(buildAgentConfigPatch({ nextRunAt: null }, running)).toEqual({ ok: true, patch: { nextRunAt: null } });
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
