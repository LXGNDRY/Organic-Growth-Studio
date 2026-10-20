import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, limitsFromEnv, planTargets, runStatus, type ProjectLike } from './targeting';
import type { CatalogProduct } from './catalog';
import type { OrderAttribution } from './attribution';

const NOW = Date.parse('2026-10-20T06:00:00.000Z');
const DAY = 86400000;

function product(handle: string, over: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: handle, handle, title: handle, status: 'ACTIVE',
    url: `https://legendary-branding.com/products/${handle}`,
    price: 40, currency: 'USD', gsm: 280, inventory: 90000,
    seoTitle: 'A title', seoDescription: 'A description', descriptionLength: 8729,
    promotable: true, reason: 'promotable', ingestedAt: '2026-10-20T05:00:00.000Z', ...over,
  };
}

const order = (handles: string[], amount: number): OrderAttribution => ({
  order: handles.join('+'), createdAt: '2026-10-01T00:00:00.000Z', amount, grossAmount: amount,
  refunded: false, currency: 'USD', linkId: null, touch: 'none', channel: 'direct',
  reason: '', productHandles: handles,
});

const catalogProject = (handle: string, lastTargetedAt: string | null): ProjectLike => ({
  id: `project-${handle}`, targetUrl: `https://legendary-branding.com/products/${handle}`,
  sourceHandle: handle, lastTargetedAt,
});

afterEach(() => {
  delete process.env.AUTOPILOT_TARGETS_PER_CYCLE;
  delete process.env.AUTOPILOT_TARGET_COOLDOWN_DAYS;
  delete process.env.AUTOPILOT_MAX_CATALOG_PROJECTS;
});

describe('planTargets', () => {
  const five = ['a', 'b', 'c', 'd', 'e'].map(h => product(h));

  it('takes no more than perCycle, highest ranked first', () => {
    // Unbounded selection is not a feature: every target is a network fetch
    // against the owner's own storefront, repeated every cycle.
    const plan = planTargets(five, [order(['c'], 500)], [], NOW);
    expect(plan.selected).toHaveLength(DEFAULT_LIMITS.perCycle);
    expect(plan.selected[0].product.handle).toBe('c');
    expect(plan.selected.every(s => s.projectId === null)).toBe(true);
  });

  it('skips a product worked inside the cooldown', () => {
    const projects = [catalogProject('a', new Date(NOW - 2 * DAY).toISOString())];
    const plan = planTargets([product('a'), product('b')], [], projects, NOW, {...DEFAULT_LIMITS, perCycle: 5});
    expect(plan.selected.map(s => s.product.handle)).toEqual(['b']);
    expect(plan.notes.some(n => n.includes('cooldown'))).toBe(true);
  });

  it('reuses the existing project once the cooldown has passed', () => {
    const projects = [catalogProject('a', new Date(NOW - 15 * DAY).toISOString())];
    const plan = planTargets([product('a')], [], projects, NOW);
    expect(plan.selected).toHaveLength(1);
    expect(plan.selected[0].projectId).toBe('project-a');
  });

  it('treats a never-targeted or unreadable timestamp as due, not as skipped forever', () => {
    for (const stamp of [null, 'not-a-date' as unknown as string]) {
      const plan = planTargets([product('a')], [], [catalogProject('a', stamp)], NOW);
      expect(plan.selected, String(stamp)).toHaveLength(1);
      expect(plan.selected[0].projectId).toBe('project-a');
    }
  });

  it('never touches a page the owner already tracks by hand', () => {
    // A hand-made project is the owner's. Selecting its URL would create a
    // second project for the same page and double its scans every cycle.
    const manual: ProjectLike = {id: 'mine', targetUrl: 'https://legendary-branding.com/products/a'};
    const plan = planTargets([product('a'), product('b')], [], [manual], NOW, {...DEFAULT_LIMITS, perCycle: 5});
    expect(plan.selected.map(s => s.product.handle)).toEqual(['b']);
    expect(plan.notes.some(n => n.includes('hand-made'))).toBe(true);
  });

  it('never selects a product the catalog marked unpromotable', () => {
    const plan = planTargets(
      [product('draft', {promotable: false, reason: 'draft'}), product('live')],
      [], [], NOW,
    );
    expect(plan.selected.map(s => s.product.handle)).toEqual(['live']);
  });

  it('stops at the catalog-project ceiling', () => {
    const existing = Array.from({length: 4}, (_, i) => catalogProject(`old${i}`, null));
    const plan = planTargets(five, [], existing, NOW, {perCycle: 3, cooldownDays: 14, maxProjects: 4});
    expect(plan.selected).toEqual([]);
    expect(plan.notes.some(n => n.includes('ceiling'))).toBe(true);
  });

  it('keeps working due projects after the ceiling is reached', () => {
    // The ceiling limits how many catalog projects may EXIST, so it must gate
    // creation only. Refusing to reuse at the ceiling stopped the engine
    // working its catalog at all - permanently, and while still reporting a
    // complete cycle, because the scan only covers what this planner selects.
    const atCeiling = five.map(p => catalogProject(p.handle, null));
    const plan = planTargets(five, [], atCeiling, NOW, {perCycle: 3, cooldownDays: 14, maxProjects: 5});
    expect(plan.selected).toHaveLength(3);
    expect(plan.selected.every(s => s.projectId !== null)).toBe(true);
  });

  it('skips an uncreatable product without abandoning lower-ranked reusable ones', () => {
    // 'top' outranks the rest and has no project, so at the ceiling it cannot
    // be created - but that must not end the scan for products that already
    // have one and cost nothing to work.
    const existing = [catalogProject('b', null), catalogProject('c', null)];
    const plan = planTargets(
      [product('top', {price: 70}), product('b'), product('c')],
      [], existing, NOW, {perCycle: 3, cooldownDays: 14, maxProjects: 2},
    );
    expect(plan.selected.map(s => s.product.handle).sort()).toEqual(['b', 'c']);
    expect(plan.notes.some(n => n.includes('ceiling'))).toBe(true);
  });

  it('stops creating the moment the ceiling would be crossed mid-cycle', () => {
    // One catalog project exists and the ceiling is three, so exactly two may
    // be created - not the three perCycle would otherwise allow.
    const existing = [catalogProject('old', null)];
    const plan = planTargets(five, [], existing, NOW, {perCycle: 3, cooldownDays: 14, maxProjects: 3});
    const created = plan.selected.filter(s => s.projectId === null);
    expect(created).toHaveLength(2);
    expect(existing.length + created.length).toBe(3);
  });

  it('says so rather than selecting nothing silently when no catalog exists', () => {
    const plan = planTargets([], [], [], NOW);
    expect(plan.selected).toEqual([]);
    expect(plan.notes[0]).toContain('No catalog ingested');
  });

  it('reports when everything is on cooldown', () => {
    const recent = new Date(NOW - DAY).toISOString();
    const plan = planTargets(five, [], five.map(p => catalogProject(p.handle, recent)), NOW);
    expect(plan.selected).toEqual([]);
    expect(plan.notes.some(n => n.includes('No catalog target was eligible'))).toBe(true);
  });

  it('is unaffected by how many hand-made projects exist', () => {
    const manual = Array.from({length: 50}, (_, i) => ({id: `m${i}`, targetUrl: `https://example.com/${i}`}));
    const plan = planTargets(five, [], manual, NOW);
    expect(plan.selected).toHaveLength(3);
  });
});

describe('limitsFromEnv', () => {
  it('defaults to the agreed numbers', () => {
    expect(limitsFromEnv()).toEqual(DEFAULT_LIMITS);
  });

  it('accepts a sane override', () => {
    process.env.AUTOPILOT_TARGETS_PER_CYCLE = '5';
    expect(limitsFromEnv().perCycle).toBe(5);
  });

  it('clamps an override rather than trusting it', () => {
    // A typo that turns 3 into 300 would otherwise point three hundred
    // fetches a cycle at the owner's storefront.
    process.env.AUTOPILOT_TARGETS_PER_CYCLE = '300';
    expect(limitsFromEnv().perCycle).toBe(10);
  });

  it('falls back on nonsense', () => {
    for (const bad of ['0', '-1', 'three', '']) {
      process.env.AUTOPILOT_TARGETS_PER_CYCLE = bad;
      expect(limitsFromEnv().perCycle, bad).toBe(DEFAULT_LIMITS.perCycle);
    }
  });
});

describe('runStatus', () => {
  it('is complete when nothing went wrong', () => {
    expect(runStatus(0, false, 3)).toBe('complete');
    // No work to do is not a failure: every product may simply be on cooldown.
    expect(runStatus(0, false, 0)).toBe('complete');
  });

  it('never reports complete when targeting threw', () => {
    // The case that matters: targeting fails, there are no hand-made projects,
    // so the cycle does no work at all. Reporting 'complete' there advances
    // nextRunAt and hides the failure from anything watching status.
    expect(runStatus(0, true, 0)).toBe('failed');
    expect(runStatus(0, true, 2)).toBe('partial');
  });

  it('still downgrades on scan errors alone', () => {
    expect(runStatus(1, false, 0)).toBe('failed');
    expect(runStatus(1, false, 5)).toBe('partial');
  });
});
