import { expect, test } from 'vitest';
import { JSDOM } from 'jsdom';
import { countFeedItems, discoverFeeds, inspectJsonLd, inspectSitemap, parseRobots } from './source-signals.ts';

test('JSON-LD inspection collects nested schema types and flags malformed blocks', () => {
  const doc = new JSDOM('<script type="application/ld+json">{"@graph":[{"@type":"Product"},{"@type":["Organization","Brand"]}]}</script><script type="application/ld+json">{broken</script>').window.document;
  expect(inspectJsonLd(doc)).toEqual({ blocks: 2, types: ['Brand', 'Organization', 'Product'], parseErrors: 1 });
});

test('feed discovery returns only supported same-origin feed URLs', () => {
  const doc = new JSDOM('<link rel="alternate" type="application/rss+xml" href="/feed.xml"><link rel="alternate" type="application/atom+xml" href="https://other.example/feed"><link rel="alternate" type="application/atom+xml" href="https://shop.example:8443/feed"><link rel="alternate" type="text/html" href="/page">').window.document;
  expect(discoverFeeds(doc, 'https://shop.example/products/a')).toEqual([
    { url: 'https://shop.example/feed.xml', type: 'application/rss+xml' },
  ]);
});

test('robots parser uses longest matching user-agent * rule and returns sitemap directives', () => {
  const robots = 'User-agent: *\nDisallow: /collections\nAllow: /collections/public\nSitemap: https://shop.example/sitemap.xml';
  expect(parseRobots(robots, 'https://shop.example/collections/public/item')).toEqual({
    sitemaps: ['https://shop.example/sitemap.xml'],
    targetAllowed: true,
  });
  expect(parseRobots(robots, 'https://shop.example/collections/private').targetAllowed).toBe(false);
  expect(parseRobots('User-agent: *\nDisallow: /search/*', 'https://shop.example/search/private').targetAllowed).toBe(null);
});

test('sitemap and RSS item counts stay descriptive and do not infer indexation', () => {
  const sitemap = '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://shop.example/products/a</loc></url><url><loc>https://shop.example/pages/about</loc></url></urlset>';
  expect(inspectSitemap(sitemap, 'https://shop.example/products/a?utm_source=test')).toEqual({
    kind: 'urlset',
    urlCount: 2,
    sitemapCount: null,
    containsTarget: true,
    valid: true,
  });
  expect(countFeedItems('<rss version="2.0"><channel><item/><item/></channel></rss>', 'application/rss+xml')).toBe(2);
});
