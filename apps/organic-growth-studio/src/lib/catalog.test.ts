import { describe, expect, it } from 'vitest';
import { mergeCatalog, parseGsm, summarizeCatalog, toCatalogProduct, type CatalogProduct } from './catalog';

const AT = '2026-10-17T13:00:00.000Z';

// Nodes below are real products from the live shop's Admin API response.
describe('toCatalogProduct', () => {
  it('maps a live, purchasable product', () => {
    const p = toCatalogProduct({
      id: 'gid://shopify/Product/1',
      handle: 'heavyweight-oversized-hoodie-460gsm',
      title: 'Marque Légendaire Heavyweight Oversized Hoodie | 460GSM',
      status: 'ACTIVE',
      onlineStoreUrl: 'https://legendary-branding.com/products/heavyweight-oversized-hoodie-460gsm',
      totalInventory: 41987,
      seo: { title: null, description: 'Marque Légendaire 460GSM heavyweight oversized hoodie…' },
      priceRangeV2: { minVariantPrice: { amount: '84.00', currencyCode: 'USD' } },
      descriptionHtml: '<p>'.padEnd(9322, 'x'),
    }, AT)!;
    expect(p.promotable).toBe(true);
    expect(p.reason).toBe('promotable');
    expect(p.gsm).toBe(460);
    expect(p.price).toBe(84);
    expect(p.currency).toBe('USD');
    expect(p.seoTitle).toBeNull();
  });

  it('refuses to promote a draft', () => {
    const p = toCatalogProduct({
      handle: 'neverdy-boxy-fit-hoodie', title: 'Neverdy Boxy Fit Hoodie',
      status: 'DRAFT', onlineStoreUrl: null, totalInventory: 60031,
    }, AT)!;
    expect(p.promotable).toBe(false);
    expect(p.reason).toBe('draft');
  });

  it('refuses to promote an unlisted product with no storefront URL', () => {
    // 32 of the shop's 126 products are UNLISTED; most serve no URL at all.
    const p = toCatalogProduct({
      handle: 'neverdy-skulls-oversized-t-shirt235g', title: 'Neverdy Skulls Oversized T-Shirt',
      status: 'UNLISTED', onlineStoreUrl: null, totalInventory: 89999,
    }, AT)!;
    expect(p.promotable).toBe(false);
    expect(p.reason).toBe('unlisted');
  });

  it('promotes an unlisted product that still serves a URL', () => {
    // Unlisted means hidden from search and collections, not unreachable. A
    // tracked /go/ link lands a visitor on it, which is how the engine works.
    const p = toCatalogProduct({
      handle: 'marque-legendaire-boxy-t-shirt', title: 'Marque Légendaire Boxy T-Shirt | 280GSM',
      status: 'UNLISTED',
      onlineStoreUrl: 'https://legendary-branding.com/products/marque-legendaire-boxy-t-shirt',
      totalInventory: 24023,
    }, AT)!;
    expect(p.promotable).toBe(true);
    expect(p.gsm).toBe(280);
  });

  it('refuses to promote a live product that is out of stock', () => {
    const p = toCatalogProduct({
      handle: 'x', title: 'X', status: 'ACTIVE',
      onlineStoreUrl: 'https://legendary-branding.com/products/x', totalInventory: 0,
    }, AT)!;
    expect(p.promotable).toBe(false);
    expect(p.reason).toBe('out-of-stock');
  });

  it('treats an active product with no storefront URL as unreachable', () => {
    const p = toCatalogProduct({
      handle: 'x', title: 'X', status: 'ACTIVE', onlineStoreUrl: null, totalInventory: 5,
    }, AT)!;
    expect(p.promotable).toBe(false);
    expect(p.reason).toBe('not-published');
  });

  it('skips a node with no handle and no id', () => {
    expect(toCatalogProduct({ title: 'orphan', status: 'ACTIVE' }, AT)).toBeNull();
  });

  it('survives a node with almost nothing selected', () => {
    const p = toCatalogProduct({ handle: 'bare' }, AT)!;
    expect(p.status).toBe('UNKNOWN');
    expect(p.price).toBeNull();
    expect(p.gsm).toBeNull();
    expect(p.inventory).toBeNull();
    expect(p.promotable).toBe(false);
  });

  it('does not treat unknown inventory as out of stock', () => {
    const p = toCatalogProduct({
      handle: 'x', title: 'X', status: 'ACTIVE',
      onlineStoreUrl: 'https://legendary-branding.com/products/x',
    }, AT)!;
    expect(p.inventory).toBeNull();
    expect(p.promotable).toBe(true);
  });
});

describe('parseGsm', () => {
  it('reads the shop\'s real title formats', () => {
    expect(parseGsm('Marque Légendaire Heavyweight Oversized Hoodie | 460GSM')).toBe(460);
    expect(parseGsm('The Goat Hoodie | 440GSM')).toBe(440);
    expect(parseGsm('280GSM Urban Framework heavyweight boxy T-shirt')).toBe(280);
    expect(parseGsm('350 GSM three-quarter sweatpants')).toBe(350);
  });

  it('falls through sources in order and stops at the first stated weight', () => {
    expect(parseGsm(null, 'GOAT Essential Mock-Neck Sweatshirt | 330GSM', '220GSM')).toBe(330);
  });

  it('returns null rather than inventing a weight', () => {
    // Content built from this catalog must never assert a GSM the shop did not
    // publish - invented product claims were already a problem in the blog.
    expect(parseGsm('GOAT Dept. Heavyweight Multi-Pocket Jean')).toBeNull();
    expect(parseGsm(null, undefined, '')).toBeNull();
  });

  it('rejects numbers outside a plausible garment weight', () => {
    expect(parseGsm('variant 48634094452889gsm')).toBeNull();
    expect(parseGsm('5gsm')).toBeNull();
  });
});

describe('mergeCatalog', () => {
  const make = (handle: string, title: string): CatalogProduct =>
    toCatalogProduct({ handle, title, status: 'ACTIVE', onlineStoreUrl: `https://x/${handle}` }, AT)!;

  it('keeps the latest row per handle instead of stacking re-ingests', () => {
    const merged = mergeCatalog([make('a', 'Old name'), make('b', 'B'), make('a', 'New name')]);
    expect(merged).toHaveLength(2);
    expect(merged.find(p => p.handle === 'a')!.title).toBe('New name');
  });
});

describe('summarizeCatalog', () => {
  it('counts what the engine can actually work with', () => {
    const products = [
      toCatalogProduct({ handle: 'a', title: 'A | 460GSM', status: 'ACTIVE', onlineStoreUrl: 'https://x/a', seo: { title: 'A' } }, AT)!,
      toCatalogProduct({ handle: 'b', title: 'B', status: 'DRAFT' }, AT)!,
      toCatalogProduct({ handle: 'c', title: 'C', status: 'UNLISTED' }, AT)!,
    ];
    const s = summarizeCatalog(products);
    expect(s).toMatchObject({ total: 3, promotable: 1, withGsm: 1, missingSeoTitle: 2 });
    expect(s.byReason).toEqual(expect.arrayContaining([{ reason: 'draft', count: 1 }, { reason: 'unlisted', count: 1 }]));
  });
});
