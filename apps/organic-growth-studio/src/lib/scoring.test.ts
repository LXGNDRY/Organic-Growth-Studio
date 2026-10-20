import { describe, expect, it } from 'vitest';
import { revenueByHandle, scoreCatalog, targetReport } from './scoring';
import type { CatalogProduct } from './catalog';
import type { OrderAttribution } from './attribution';

const AT = '2026-10-20T06:00:00.000Z';

function product(over: Partial<CatalogProduct> & {handle: string}): CatalogProduct {
  return {
    id: over.handle, title: over.handle, status: 'ACTIVE',
    url: `https://legendary-branding.com/products/${over.handle}`,
    price: 40, currency: 'USD', gsm: 280, inventory: 90000,
    seoTitle: 'A title', seoDescription: 'A description', descriptionLength: 8729,
    promotable: true, reason: 'promotable', ingestedAt: AT, ...over,
  };
}

function order(over: Partial<OrderAttribution> & {order: string}): OrderAttribution {
  return {
    createdAt: AT, amount: 0, grossAmount: 0, refunded: false,
    currency: 'USD', linkId: null, touch: 'none', channel: 'direct',
    reason: '', productHandles: [], ...over,
  };
}

describe('revenueByHandle', () => {
  it('credits every handle in an order with the order value', () => {
    const map = revenueByHandle([
      order({order: 'A', amount: 100, productHandles: ['x', 'y']}),
      order({order: 'B', amount: 50, productHandles: ['x']}),
    ]);
    expect(map.get('x')).toBe(150);
    expect(map.get('y')).toBe(100);
  });

  it('contributes nothing for a refunded order', () => {
    // Refunds are already netted out upstream, so a refunded order arrives
    // with amount 0 and must not make its product look like it earned.
    const map = revenueByHandle([
      order({order: 'R', amount: 0, grossAmount: 88.7, refunded: true, productHandles: ['refunded-item']}),
    ]);
    expect(map.get('refunded-item')).toBe(0);
  });

  it('ignores orders with no line items', () => {
    expect(revenueByHandle([order({order: 'A', amount: 100})]).size).toBe(0);
  });
});

describe('scoreCatalog', () => {
  it('scores only promotable products', () => {
    const scored = scoreCatalog([
      product({handle: 'live'}),
      product({handle: 'draft', promotable: false, reason: 'draft'}),
    ], []);
    expect(scored.map(s => s.handle)).toEqual(['live']);
  });

  it('ranks a product the engine can describe above one it cannot', () => {
    // The shop's 86 existing articles are generic and barely rank. A product
    // with no stated fabric weight can only produce more of the same.
    const [first, second] = scoreCatalog([
      product({handle: 'no-gsm', gsm: null}),
      product({handle: 'has-gsm', gsm: 460}),
    ], []);
    expect(first.handle).toBe('has-gsm');
    expect(second.reasons).toContain('no stated GSM, so content cannot cite a fabric weight');
  });

  it('ranks a proven earner above an identical product that has never sold', () => {
    const scored = scoreCatalog(
      [product({handle: 'earner'}), product({handle: 'quiet'})],
      [order({order: 'A', amount: 141.5, productHandles: ['earner']})],
    );
    expect(scored[0].handle).toBe('earner');
    expect(scored[0].revenue).toBe(141.5);
    expect(scored[0].reasons.some(r => r.includes('141.50'))).toBe(true);
  });

  it('does not let one strong earner flatten the rest to zero', () => {
    const scored = scoreCatalog(
      [product({handle: 'big'}), product({handle: 'small'}), product({handle: 'none'})],
      [
        order({order: 'A', amount: 1000, productHandles: ['big']}),
        order({order: 'B', amount: 100, productHandles: ['small']}),
      ],
    );
    const proven = (h: string) => scored.find(s => s.handle === h)!.factors.find(f => f.name === 'proven')!.value;
    expect(proven('big')).toBe(1);
    expect(proven('small')).toBeCloseTo(0.1);
    expect(proven('none')).toBe(0);
  });

  it('prices relative to the catalog, not an absolute scale', () => {
    // A $70 item is this shop's top end even though it is not expensive.
    const scored = scoreCatalog(
      [product({handle: 'top', price: 70}), product({handle: 'mid', price: 50}), product({handle: 'low', price: 30})],
      [],
    );
    const value = (h: string) => scored.find(s => s.handle === h)!.factors.find(f => f.name === 'value')!.value;
    expect(value('top')).toBe(1);
    expect(value('low')).toBe(0);
    expect(value('mid')).toBeCloseTo(0.5);
    expect(scored.find(s => s.handle === 'top')!.reasons.some(r => r.includes('highest price'))).toBe(true);
  });

  it('treats an identical-price catalog as neutral rather than dividing by zero', () => {
    const scored = scoreCatalog([product({handle: 'a'}), product({handle: 'b'})], []);
    expect(scored.every(s => s.factors.find(f => f.name === 'value')!.value === 0.5)).toBe(true);
    expect(scored.every(s => Number.isFinite(s.score))).toBe(true);
  });

  it('rewards a missing SEO title as unrealised upside', () => {
    const scored = scoreCatalog(
      [product({handle: 'with-seo'}), product({handle: 'without-seo', seoTitle: null})],
      [],
    );
    expect(scored[0].handle).toBe('without-seo');
    expect(scored[0].reasons).toContain('no SEO title set');
  });

  it('never lets the SEO bonus outrank a describable product', () => {
    // seoGap is a tiebreaker, not a driver: a product with no stated weight
    // must not float to the top just because its SEO title is blank.
    const scored = scoreCatalog(
      [product({handle: 'gsm-with-seo', gsm: 460}), product({handle: 'nogsm-no-seo', gsm: null, seoTitle: null})],
      [],
    );
    expect(scored[0].handle).toBe('gsm-with-seo');
  });

  it('handles a product with no price', () => {
    const scored = scoreCatalog([product({handle: 'a', price: null}), product({handle: 'b', price: 70})], []);
    expect(scored.every(s => Number.isFinite(s.score))).toBe(true);
  });

  it('is deterministic for products that tie', () => {
    const run = () => scoreCatalog([product({handle: 'b'}), product({handle: 'a'})], []).map(s => s.handle);
    expect(run()).toEqual(['a', 'b']);
    expect(run()).toEqual(run());
  });

  it('explains every product it ranks', () => {
    const scored = scoreCatalog([product({handle: 'a'}), product({handle: 'b', gsm: null})], []);
    for (const s of scored) {
      expect(s.reasons.length).toBeGreaterThan(0);
      expect(s.factors).toHaveLength(4);
      expect(s.factors.every(f => f.note.length > 0)).toBe(true);
    }
  });

  it('returns nothing when no product is promotable', () => {
    expect(scoreCatalog([product({handle: 'x', promotable: false, reason: 'draft'})], [])).toEqual([]);
  });
});

describe('targetReport', () => {
  it('reports what it scored and what it skipped', () => {
    const report = targetReport(
      [product({handle: 'a'}), product({handle: 'b'}), product({handle: 'c', promotable: false, reason: 'draft'})],
      [order({order: 'A', amount: 10, productHandles: ['a']})],
      1,
    );
    expect(report).toMatchObject({scored: 2, skipped: 1, usingRevenueFrom: 1});
    expect(report.targets).toHaveLength(1);
    expect(report.targets[0].handle).toBe('a');
  });

  it('survives a limit of zero or negative', () => {
    const products = [product({handle: 'a'})];
    expect(targetReport(products, [], 0).targets).toEqual([]);
    expect(targetReport(products, [], -5).targets).toEqual([]);
  });
});
