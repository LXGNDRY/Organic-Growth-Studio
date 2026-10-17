import { describe, expect, it } from 'vitest';
import { isPrivateAddress, mappedIPv4 } from './analyzer';

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
