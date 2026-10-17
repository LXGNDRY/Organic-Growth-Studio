import { describe, expect, it } from 'vitest';
import { attributeOrder, classifyVisit, revenueByChannel, trackedLinkRevenue, visitMatchesLink, type LinkKey, type OrderJourney } from './attribution';

const LINK: LinkKey = { id: 'link-1', source: 'studio', medium: 'organic', campaign: 'hoodie-460-oct', content: null };

// Every order below is a real order from the live shop, with its journey as
// Shopify recorded it.
const CHATGPT_ORDER: OrderJourney = {
  name: 'LB1120', createdAt: '2026-09-13T19:58:43Z', amount: '70.75', currency: 'USD', momentsCount: 2,
  productHandles: ['heavyweight-oversized-hoodie-460gsm'],
  firstVisit: { occurredAt: '2026-09-13T19:47:51Z', source: 'ChatGPT', landingPage: 'https://legendary-branding.com/products/heavyweight-oversized-hoodie-460gsm', utmParameters: { source: 'chatgpt.com', medium: 'feed', campaign: null, content: null } },
  lastVisit: { occurredAt: '2026-09-13T19:56:59Z', source: 'ChatGPT', landingPage: 'https://legendary-branding.com/products/heavyweight-oversized-hoodie-460gsm', utmParameters: { source: 'chatgpt.com', medium: 'feed', campaign: null, content: null } },
};

const FREE_LISTING_ORDER: OrderJourney = {
  name: 'LB1122', createdAt: '2026-10-04T05:57:03Z', amount: '50.0', currency: 'USD', momentsCount: 2,
  productHandles: ['blank-washed-gradient-t-shirt'],
  firstVisit: { source: 'Google', landingPage: 'https://www.legendary-branding.com/es/products/blank-washed-gradient-t-shirt', utmParameters: { source: 'google', medium: 'product_sync', campaign: 'sag_organic', content: 'sag_organic' } },
  lastVisit: { source: 'https://www.legendary-branding.com/es/products/blank-washed-gradient-t-shirt', landingPage: 'https://www.legendary-branding.com/products/blank-washed-gradient-t-shirt', utmParameters: { source: 'google', medium: 'product_sync', campaign: 'sag_organic', content: 'sag_organic' } },
};

const ADMIN_ORDER: OrderJourney = {
  name: '#LB1117', amount: '305.0', currency: 'USD', momentsCount: 3,
  firstVisit: { source: 'https://admin.shopify.com/', landingPage: 'https://legendary-branding.com/', utmParameters: null },
  lastVisit: { source: 'https://admin.shopify.com/', landingPage: 'https://legendary-branding.com/', utmParameters: null },
};

const NO_JOURNEY_ORDER: OrderJourney = {
  name: '#LB1115', amount: '88.7', currency: 'USD', momentsCount: 0, firstVisit: null, lastVisit: null,
};

const DIRECT_ORDER: OrderJourney = {
  name: '#LB1116', amount: '187.5', currency: 'USD', momentsCount: 1,
  firstVisit: { source: 'direct', landingPage: 'https://legendary-branding.com/products/marque-legendaire-raglan-polo-shirt', utmParameters: null },
  lastVisit: { source: 'direct', landingPage: 'https://legendary-branding.com/products/marque-legendaire-raglan-polo-shirt', utmParameters: null },
};

describe('visitMatchesLink', () => {
  it('matches a visit carrying the link\'s campaign', () => {
    expect(visitMatchesLink({ utmParameters: { source: 'studio', medium: 'organic', campaign: 'hoodie-460-oct' } }, LINK)).toBe(true);
  });

  it('refuses to match on source and medium alone', () => {
    // Without requiring campaign, every generic studio/organic visit would be
    // credited to this link, handing the engine other channels' revenue.
    expect(visitMatchesLink({ utmParameters: { source: 'studio', medium: 'organic', campaign: 'something-else' } }, LINK)).toBe(false);
    expect(visitMatchesLink({ utmParameters: { source: 'studio', medium: 'organic', campaign: null } }, LINK)).toBe(false);
  });

  it('never matches a visit with no UTM parameters', () => {
    expect(visitMatchesLink({ source: 'direct', utmParameters: null }, LINK)).toBe(false);
    expect(visitMatchesLink(null, LINK)).toBe(false);
  });

  it('requires content to agree when the link sets it', () => {
    const withContent = { ...LINK, content: 'variant-a' };
    expect(visitMatchesLink({ utmParameters: { source: 'studio', medium: 'organic', campaign: 'hoodie-460-oct', content: 'variant-b' } }, withContent)).toBe(false);
    expect(visitMatchesLink({ utmParameters: { source: 'studio', medium: 'organic', campaign: 'hoodie-460-oct', content: 'variant-a' } }, withContent)).toBe(true);
  });

  it('ignores case and padding', () => {
    expect(visitMatchesLink({ utmParameters: { source: 'Studio', medium: 'ORGANIC', campaign: ' Hoodie-460-Oct ' } }, LINK)).toBe(true);
  });
});

describe('attributeOrder', () => {
  it('credits a tracked link on last click', () => {
    const order: OrderJourney = { name: 'X', amount: '84.00',
      firstVisit: { source: 'direct', utmParameters: null },
      lastVisit: { utmParameters: { source: 'studio', medium: 'organic', campaign: 'hoodie-460-oct' } } };
    const a = attributeOrder(order, [LINK]);
    expect(a).toMatchObject({ linkId: 'link-1', touch: 'last-click', channel: 'tracked-link', amount: 84 });
  });

  it('falls back to first click when only the first visit carries the link', () => {
    const order: OrderJourney = { name: 'X', amount: '84.00',
      firstVisit: { utmParameters: { source: 'studio', medium: 'organic', campaign: 'hoodie-460-oct' } },
      lastVisit: { source: 'direct', utmParameters: null } };
    expect(attributeOrder(order, [LINK]).touch).toBe('first-click');
  });

  it('names ChatGPT as its own channel', () => {
    // Two real orders, $141.50, both the 460GSM hoodie. This is the shop's
    // only unpaid channel that demonstrably converts, so it is not buried
    // under "referral".
    const a = attributeOrder(CHATGPT_ORDER, [LINK]);
    expect(a).toMatchObject({ channel: 'ai-assistant', linkId: null, touch: 'none', amount: 70.75 });
    expect(a.productHandles).toEqual(['heavyweight-oversized-hoodie-460gsm']);
  });

  it('reads a Merchant Center free listing as free, not paid', () => {
    expect(attributeOrder(FREE_LISTING_ORDER, [LINK]).channel).toBe('free-listing');
  });

  it('excludes orders placed through Shopify admin', () => {
    const a = attributeOrder(ADMIN_ORDER, [LINK]);
    expect(a.channel).toBe('internal');
    expect(a.reason).toBe('placed through Shopify admin');
  });

  it('handles an order with no journey at all', () => {
    const a = attributeOrder(NO_JOURNEY_ORDER, [LINK]);
    expect(a).toMatchObject({ channel: 'unknown', touch: 'none', linkId: null, amount: 88.7 });
  });

  it('reports direct as direct rather than guessing', () => {
    expect(attributeOrder(DIRECT_ORDER, [LINK]).channel).toBe('direct');
  });

  it('treats an unreadable amount as zero rather than NaN', () => {
    expect(attributeOrder({ name: 'X', amount: null }, []).amount).toBe(0);
    expect(attributeOrder({ name: 'X', amount: 'free' }, []).amount).toBe(0);
  });
});

describe('classifyVisit', () => {
  it('calls a cpc medium paid', () => {
    expect(classifyVisit({ source: 'Google', utmParameters: { medium: 'cpc' } }).channel).toBe('paid-click');
  });

  it('calls a gclid landing page paid even with no UTM medium', () => {
    expect(classifyVisit({ source: 'Google', landingPage: 'https://legendary-branding.com/products/x?gclid=abc' }).channel).toBe('paid-click');
  });

  it('prefers free-listing over paid when both markers are present', () => {
    // Real rows carry gclid AND sag_organic together.
    expect(classifyVisit({ landingPage: 'https://x/y?gclid=abc', utmParameters: { campaign: 'sag_organic', medium: 'product_sync' } }).channel).toBe('free-listing');
  });
});

describe('reporting', () => {
  const rows = [CHATGPT_ORDER, CHATGPT_ORDER, FREE_LISTING_ORDER, ADMIN_ORDER, DIRECT_ORDER].map(o => attributeOrder(o, [LINK]));

  it('splits revenue by channel, biggest first', () => {
    const byChannel = revenueByChannel(rows);
    expect(byChannel[0]).toMatchObject({ channel: 'internal', orders: 1, revenue: 305 });
    expect(byChannel.find(c => c.channel === 'ai-assistant')).toMatchObject({ orders: 2, revenue: 141.5 });
  });

  it('claims nothing for the engine when no link was involved', () => {
    expect(trackedLinkRevenue(rows)).toEqual([]);
  });

  it('counts only tracked-link revenue for the engine', () => {
    const tracked = attributeOrder({ name: 'T', amount: '84.00', lastVisit: { utmParameters: { source: 'studio', medium: 'organic', campaign: 'hoodie-460-oct' } } }, [LINK]);
    expect(trackedLinkRevenue([...rows, tracked])).toEqual([{ linkId: 'link-1', orders: 1, revenue: 84 }]);
  });
});
