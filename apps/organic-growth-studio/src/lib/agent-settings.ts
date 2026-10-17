// Pure settings validation for PATCH /api/agent, kept out of the route so it
// can be tested without the filesystem-backed store.
export const ALLOWED_CADENCES = [1, 3, 6, 12, 24];

export type AgentConfigPatch = { enabled?: boolean; cadenceHours?: number; nextRunAt?: string | null };
export type PatchResult = { ok: true; patch: AgentConfigPatch } | { ok: false; error: string };

// Date.parse is far looser than the contract: it accepts "0" (year 2000),
// "2026", and locale-dependent strings, any of which lands in the past and
// makes the runner fire immediately. Require a real ISO 8601 instant, with an
// explicit zone so the meaning does not depend on the host's timezone.
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export function validCadence(value: number) {
  return ALLOWED_CADENCES.includes(value);
}

export function buildAgentConfigPatch(body: unknown, current: { enabled: boolean }): PatchResult {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Invalid autopilot settings.' };
  const input = body as Record<string, unknown>;
  const patch: AgentConfigPatch = {};

  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean') return { ok: false, error: 'enabled must be a boolean.' };
    patch.enabled = input.enabled;
    patch.nextRunAt = input.enabled ? new Date().toISOString() : null;
  }

  const willBeEnabled = patch.enabled !== undefined ? patch.enabled : current.enabled;

  if (input.cadenceHours !== undefined) {
    if (typeof input.cadenceHours !== 'number' || !validCadence(input.cadenceHours)) {
      return { ok: false, error: 'Cadence must be 1, 3, 6, 12, or 24 hours.' };
    }
    patch.cadenceHours = input.cadenceHours;
    // Keyed off the resulting state, not the stored one, so enabling and
    // re-timing in one request cannot leave autopilot on with no schedule.
    patch.nextRunAt = willBeEnabled ? new Date().toISOString() : null;
  }

  // Applied last so an explicit schedule wins over one derived above. This is
  // what the "Run next cycle now" control sends, and dropping it used to make
  // that button return 200 while changing nothing.
  if (input.nextRunAt !== undefined) {
    if (input.nextRunAt === null) {
      // The runner reads a missing schedule as "due now", so clearing it while
      // autopilot stays on would start a cycle rather than stop one.
      if (willBeEnabled) return { ok: false, error: 'Clear nextRunAt only while pausing autopilot.' };
      patch.nextRunAt = null;
    } else {
      if (typeof input.nextRunAt !== 'string' || !ISO_INSTANT.test(input.nextRunAt)) {
        return { ok: false, error: 'nextRunAt must be an ISO timestamp or null.' };
      }
      const parsed = Date.parse(input.nextRunAt);
      if (!Number.isFinite(parsed)) return { ok: false, error: 'nextRunAt must be an ISO timestamp or null.' };
      patch.nextRunAt = new Date(parsed).toISOString();
    }
  }

  // Never report success for a request that would change nothing.
  if (Object.keys(patch).length === 0) return { ok: false, error: 'No supported autopilot settings were provided.' };
  return { ok: true, patch };
}
