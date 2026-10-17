import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// store.ts resolves DATA_DIR at module load, so the env has to be set before
// the route (and the store it pulls in) is imported.
const dir = mkdtempSync(join(tmpdir(), 'ogs-agent-'));
process.env.DATA_DIR = dir;

const HOUR = 3_600_000;
const storeFile = join(dir, 'store.json');
const readStore = () => JSON.parse(readFileSync(storeFile, 'utf8'));

const seed = (config: Record<string, unknown>) =>
  writeFileSync(storeFile, JSON.stringify({ agentConfig: config }), 'utf8');

const patch = (body: unknown) =>
  new Request('https://studio.example/api/agent', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

let PATCH: (req: Request) => Promise<Response>;

beforeAll(async () => {
  ({ PATCH } = await import('./route'));
});

describe('PATCH /api/agent cadence scheduling, end to end', () => {
  it('re-times the next scan from the last run and persists it', async () => {
    const lastRunAt = new Date(Date.now() - 5 * HOUR).toISOString();
    seed({ enabled: true, cadenceHours: 6, nextRunAt: new Date(Date.now() + HOUR).toISOString(), lastRunAt });

    const response = await PATCH(patch({ cadenceHours: 24 }));
    expect(response.status).toBe(200);

    const { config } = await response.json();
    expect(config.cadenceHours).toBe(24);

    // 24h after the last scan, so ~19h out — not "now", which is what a
    // cadence change used to schedule.
    const outMs = Date.parse(config.nextRunAt) - Date.now();
    expect(outMs).toBeGreaterThan(18.5 * HOUR);
    expect(outMs).toBeLessThan(19.5 * HOUR);

    // And it actually reached disk, not just the response body.
    expect(readStore().agentConfig.nextRunAt).toBe(config.nextRunAt);
    expect(readStore().agentConfig.cadenceHours).toBe(24);
  });

  it('scans promptly when the new cadence leaves it overdue', async () => {
    seed({
      enabled: true,
      cadenceHours: 24,
      nextRunAt: new Date(Date.now() + 19 * HOUR).toISOString(),
      lastRunAt: new Date(Date.now() - 5 * HOUR).toISOString(),
    });

    const { config } = await (await PATCH(patch({ cadenceHours: 1 }))).json();
    expect(Date.parse(config.nextRunAt) - Date.now()).toBeLessThan(HOUR);
  });

  it('leaves a paused autopilot unscheduled', async () => {
    seed({ enabled: false, cadenceHours: 6, nextRunAt: null, lastRunAt: null });

    const { config } = await (await PATCH(patch({ cadenceHours: 12 }))).json();
    expect(config.nextRunAt).toBeNull();
    expect(readStore().agentConfig.nextRunAt).toBeNull();
  });
});
