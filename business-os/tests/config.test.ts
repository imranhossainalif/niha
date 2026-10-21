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

import { envVal } from '@/lib/config';
describe('env values with Docker inline comments', () => {
  it('treats "# note" as unset and strips trailing comments', () => {
    process.env.T_A = '# AI Assistant, InboxPilot replies';
    process.env.T_B = 'claude-haiku-5-5      # chat + inbox';
    process.env.T_C = 'abc#def';
    process.env.T_D = '';
    expect(envVal('T_A')).toBeUndefined();
    expect(envVal('T_B')).toBe('claude-haiku-5-5');
    expect(envVal('T_C')).toBe('abc#def');
    expect(envVal('T_D')).toBeUndefined();
  });
});
