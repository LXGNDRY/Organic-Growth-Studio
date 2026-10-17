import { describe, expect, it } from 'vitest';
import { altState, isPrivateAddress, mappedIPv4, pageBodyIsOwners } from './analyzer';

// Hostnames are taken from a parsed URL, so they arrive already canonicalized.
const hostOf = (url: string) => new URL(url).hostname.replace(/^\[|\]$/g, '');

describe('mappedIPv4', () => {
  it('decodes the hex form the URL parser produces', () => {
    expect(mappedIPv4('::ffff:7f00:1')).toBe('127.0.0.1');
    expect(mappedIPv4('::ffff:a9fe:a9fe')).toBe('169.254.169.254');
  });

  it('accepts the dotted and IPv4-translated forms', () => {
    expect(mappedIPv4('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(mappedIPv4('::ffff:0:127.0.0.1')).toBe('127.0.0.1');
  });

  it('returns null for addresses that are not IPv4-mapped', () => {
    expect(mappedIPv4('::1')).toBeNull();
    expect(mappedIPv4('2606:4700:4700::1111')).toBeNull();
  });
});

describe('isPrivateAddress', () => {
  it('blocks IPv4-mapped loopback and link-local reached through a URL', () => {
    // Regression: the URL parser rewrites these to hex, which previously
    // slipped past the mapped-address branch and allowed SSRF to the
    // loopback and cloud metadata endpoints.
    expect(isPrivateAddress(hostOf('http://[::ffff:127.0.0.1]/'))).toBe(true);
    expect(isPrivateAddress(hostOf('http://[::ffff:169.254.169.254]/'))).toBe(true);
    expect(isPrivateAddress(hostOf('http://[::ffff:10.0.0.1]/'))).toBe(true);
    expect(isPrivateAddress(hostOf('http://[::ffff:192.168.1.1]/'))).toBe(true);
  });

  it('fails closed on IPv4-mapped forms it cannot decode', () => {
    expect(isPrivateAddress('::ffff:not-an-address')).toBe(true);
  });

  it('still blocks the plain private ranges', () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.0.1', '::1', 'fd00::1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('still allows public addresses, mapped or not', () => {
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress(hostOf('http://[::ffff:8.8.8.8]/'))).toBe(false);
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
  });
});

describe('pageBodyIsOwners', () => {
  // Regression: a live run against a Cloudflare-protected store returned 429 for
  // two collection pages. The analyzer parsed the block page and reported "title
  // is missing", "no main heading", "no canonical link" and "thin content"
  // against pages whose real markup was fine - five false findings that would
  // send an owner to fix something that is not broken.
  it('rejects edge blocks and server errors, whose body is not the owner page', () => {
    expect(pageBodyIsOwners(429)).toBe(false);
    expect(pageBodyIsOwners(403)).toBe(false);
    expect(pageBodyIsOwners(503)).toBe(false);
    expect(pageBodyIsOwners(500)).toBe(false);
  });

  it('rejects 404, so the missing-page finding stands without content noise', () => {
    expect(pageBodyIsOwners(404)).toBe(false);
  });

  it('accepts the success range the owner page is actually served on', () => {
    expect(pageBodyIsOwners(200)).toBe(true);
    expect(pageBodyIsOwners(203)).toBe(true);
    expect(pageBodyIsOwners(299)).toBe(true);
  });

  it('rejects 2xx statuses that carry no body', () => {
    // 204 and 205 are response.ok, so no status finding fires for them. Left in
    // the assessable range they produced the same false cascade as a 429, but
    // with nothing in the report to explain why.
    expect(pageBodyIsOwners(204)).toBe(false);
    expect(pageBodyIsOwners(205)).toBe(false);
  });
});

describe('altState', () => {
  // Regression: a run over all 79 product pages reported "image lacks alt text"
  // on every one. Each was the same shared video poster carrying alt="" inside
  // a play button that already had an accessible name - the WCAG-correct way to
  // mark an image decorative, and the very thing the finding's advice tells the
  // owner to do. 79 false findings across the catalog.
  it('treats an explicit empty alt as decorative, not missing', () => {
    expect(altState(true, '')).toBe('decorative');
    expect(altState(true, '   ')).toBe('decorative');
  });

  it('treats an absent alt attribute as missing', () => {
    expect(altState(false, null)).toBe('missing');
  });

  it('treats a real description as described', () => {
    expect(altState(true, 'Washed black hoodie, front view')).toBe('described');
  });
});
