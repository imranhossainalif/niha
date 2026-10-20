import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const err = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

/** Turn thrown errors (AccessError, ConflictError, ...) into JSON responses. */
export function handle<A extends unknown[]>(fn: (...a: A) => Promise<Response>) {
  return async (...a: A): Promise<Response> => {
    try {
      return await fn(...a);
    } catch (e) {
      if (e instanceof ZodError) return err(400, 'bad_request', e.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; '));
      const x = e as { status?: number; code?: string; message?: string; current?: number | null };
      if (x && typeof x.status === 'number') return NextResponse.json({ error: { code: x.code, message: x.message, current_version: x.current } }, { status: x.status });
      console.error(e);
      return err(500, 'internal', 'Internal error');
    }
  };
}
