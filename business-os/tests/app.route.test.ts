import { beforeEach, describe, expect, it, vi } from 'vitest';

// The route only needs the principal; mocking it keeps the test off NextAuth/Prisma (and off the DB).
const mocks = vi.hoisted(() => ({ principal: vi.fn() }));
vi.mock('@/lib/session', () => ({ requestPrincipal: mocks.principal }));

const route = () => import('@/app/app/route');

describe('/app (legacy dashboard route)', () => {
  beforeEach(() => mocks.principal.mockReset());

  it('sends a logged-out browser to a RELATIVE /login URL, never the server-local localhost', async () => {
    mocks.principal.mockResolvedValue(null);
    const { GET } = await route();
    // Exactly what Next.js builds behind Caddy: an absolute req.url with the container's localhost:3000.
    // An absolute Location built from it used to send the browser to https://localhost:3000/login.
    const res = await GET(new Request('https://localhost:3000/app'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login?next=/app');
    expect(res.headers.get('location')).not.toMatch(/localhost|:\d{4}/);
  });

  it('serves the patched legacy page to a logged-in user', async () => {
    mocks.principal.mockResolvedValue({ kind: 'user', userId: 'u1', email: 'a@b.c', role: 'owner', businesses: [], scopes: ['read', 'write'] });
    const { GET } = await route();
    const res = await GET(new Request('https://localhost:3000/app'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('/legacy/bos-shim.js');
  });
});
