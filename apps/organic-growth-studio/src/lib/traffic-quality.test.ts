import { describe, expect, it } from 'vitest';
import { classifySession, summarize } from './traffic-quality';

// Every URL below is a real row from the live shop's 90-day session export.
// They are kept verbatim because each one is a case that was silently counted
// as a customer before this module existed.
describe('classifySession', () => {
  it('excludes the shop owner\'s own dev server', () => {
    // 568 sessions - the single largest "landing page" in the shop, and a
    // developer's Next.js server talking to production analytics.
    const cls = classifySession({
      landingPageUrl: 'http://127.0.0.1:3000/products/legendary-world-round-t-shirt?Color=Black&Size=S',
    });
    expect(cls.verdict).toBe('local-dev');
    expect(cls.learnable).toBe(false);
  });

  it('excludes private LAN and localhost dev servers too', () => {
    for (const url of ['http://localhost:3000/cart', 'http://192.168.1.14:3000/', 'http://172.20.0.3/search']) {
      expect(classifySession({ landingPageUrl: url }).verdict).toBe('local-dev');
    }
  });

  it('excludes Shopify theme previews', () => {
    const cls = classifySession({
      landingPageUrl: 'https://sjf22lulztu5mov47hak2vwo2to1atn-49013915801.shopifypreview.com/?cb=88d0bcc',
    });
    expect(cls.verdict).toBe('store-preview');
    expect(cls.learnable).toBe(false);
  });

  it('counts Merchant Center free listings as real organic discovery', () => {
    // Regression: these carry BOTH gclid and gad_source, so a naive paid-click
    // test throws away the unpaid product discovery the Studio exists to grow.
    // "sag_organic" is Surfaces Across Google - the free half of Merchant Center.
    const cls = classifySession({
      landingPageUrl: 'https://legendary-branding.com/id/products/goated-heavyweight-fleece-crewneck-sweatshirt?variant=46972942287001&country=ID&currency=USD&utm_medium=product_sync&utm_source=google&utm_content=sag_organic&gad_source=5&gclid=CjwKCAjwqonVBhA4EiwA9wYJ3RSZ',
    });
    expect(cls.verdict).toBe('free-listing');
    expect(cls.learnable).toBe(true);
  });

  it('excludes purchased clicks', () => {
    const cls = classifySession({
      landingPageUrl: 'https://legendary-branding.com/products/legendary-d20-w-king-200w-portable-bluetooth-speaker?gad_source=2&gad_campaignid=24045123053&gbraid=0AAAAApyQURn5&gclid=Cj0KCQjwg5zTBhCL',
    });
    expect(cls.verdict).toBe('paid-click');
    expect(cls.learnable).toBe(false);
  });

  it('excludes ad-network placements', () => {
    // 6,938 sessions from googlesyndication alone - display placements, not visitors.
    const cls = classifySession({
      landingPageUrl: 'https://legendary-branding.com/',
      referrerSource: 'unknown',
      referrerName: 'googlesyndication',
    });
    expect(cls.verdict).toBe('ad-network');
    expect(cls.learnable).toBe(false);
  });

  it('quarantines referrers Shopify could not classify instead of guessing', () => {
    // trueaim360, iciclecrush, sportsseier and friends. They may be junk, they
    // may not - either way the model does not get to decide, a human does.
    const cls = classifySession({
      landingPageUrl: 'https://legendary-branding.com/',
      referrerSource: 'unknown',
      referrerName: 'trueaim360',
    });
    expect(cls.verdict).toBe('unverified-referral');
    expect(cls.learnable).toBe(false);
  });

  it('keeps genuine organic search', () => {
    const cls = classifySession({
      landingPageUrl: 'https://legendary-branding.com/products/mini-goat-oversized-t-shirt',
      referrerSource: 'search',
      referrerName: 'google',
    });
    expect(cls.verdict).toBe('organic');
    expect(cls.learnable).toBe(true);
  });

  it('treats a paid marker on a loopback URL as dev traffic, not a paid click', () => {
    expect(classifySession({ landingPageUrl: 'http://127.0.0.1:3000/x?gclid=abc' }).verdict).toBe('local-dev');
  });

  it('refuses to credit unattributed traffic', () => {
    // 23,614 sessions - 56% of the shop. "direct" means Shopify saw no
    // referrer, so it cannot tell the model which action earned the visit,
    // and it is where dev-server and bot sessions land. Counting it as
    // organic made the engine look like it had 26,771 sessions of signal
    // when it has roughly 3,000.
    const cls = classifySession({
      landingPageUrl: 'https://legendary-branding.com/',
      referrerSource: 'direct',
      referrerName: '',
    });
    expect(cls.verdict).toBe('unattributed');
    expect(cls.learnable).toBe(false);
  });

  it('quarantines an unknown source even when no referrer name was selected', () => {
    // Regression: the classifier used to end with `return organic` for
    // anything unmatched, so an audit grouped by referrer_source alone - a
    // grouping scripts/traffic-audit.mjs accepts - sent every "unknown"
    // session into the model as learnable organic traffic.
    const cls = classifySession({
      landingPageUrl: 'https://legendary-branding.com/',
      referrerSource: 'unknown',
      referrerName: null,
    });
    expect(cls.verdict).toBe('unverified-referral');
    expect(cls.learnable).toBe(false);
  });

  it('fails closed on a referrer source it does not recognise', () => {
    const cls = classifySession({
      landingPageUrl: 'https://legendary-branding.com/',
      referrerSource: 'some-future-shopify-source',
    });
    expect(cls.learnable).toBe(false);
  });

  it('does not crash on the blank landing page Shopify emits', () => {
    expect(classifySession({ landingPageUrl: '' }).verdict).toBe('unattributed');
  });
});

describe('summarize', () => {
  it('weights by session count, not by row', () => {
    const report = summarize([
      { landingPageUrl: 'http://127.0.0.1:3000/', sessions: 568 },
      { landingPageUrl: 'https://legendary-branding.com/', referrerSource: 'unknown', referrerName: 'googlesyndication', sessions: 6938 },
      { landingPageUrl: 'https://legendary-branding.com/products/mini-goat-oversized-t-shirt', referrerSource: 'search', referrerName: 'google', sessions: 731 },
    ]);
    expect(report.total).toBe(8237);
    expect(report.learnable).toBe(731);
    expect(report.excluded).toBe(7506);
    expect(report.byVerdict[0]).toMatchObject({ verdict: 'ad-network', sessions: 6938 });
  });

  it('ignores zero and negative session counts', () => {
    const report = summarize([
      { landingPageUrl: 'https://legendary-branding.com/', referrerSource: 'search', referrerName: 'google', sessions: 0 },
      { landingPageUrl: 'https://legendary-branding.com/', referrerSource: 'search', referrerName: 'google', sessions: -5 },
    ]);
    expect(report.total).toBe(0);
    expect(report.byVerdict).toEqual([]);
  });

  it('defaults a row with no session count to one session', () => {
    expect(summarize([{ landingPageUrl: 'https://legendary-branding.com/', referrerSource: 'search' }]).total).toBe(1);
  });
});
