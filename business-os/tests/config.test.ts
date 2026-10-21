import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from '@/lib/config';

describe('settings encryption', () => {
  it('round-trips and never stores the plain value', () => {
    process.env.AUTH_SECRET = 'a';
    const c = encrypt('sk-ant-secret-123');
    expect(c).not.toContain('secret');
    expect(decrypt(c)).toBe('sk-ant-secret-123');
  });
  it('fails closed with a different AUTH_SECRET or tampered data', () => {
    process.env.AUTH_SECRET = 'a';
    const c = encrypt('x');
    process.env.AUTH_SECRET = 'b';
    expect(decrypt(c)).toBeNull();
    process.env.AUTH_SECRET = 'a';
    expect(decrypt(c.slice(0, -4) + 'AAAA')).toBeNull();
  });
});
