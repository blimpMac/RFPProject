import type { HandlerEvent, HandlerResponse } from '@netlify/functions';

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export const json = (statusCode: number, body: unknown, headers: Record<string,string> = {}): HandlerResponse => ({
  statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }, body: JSON.stringify(body),
});
export function readJson(event: HandlerEvent): unknown {
  try { return JSON.parse(event.body || '{}'); } catch { throw new HttpError(400, 'The request body is not valid JSON.'); }
}
export function routeOf(event: HandlerEvent) { return event.path.replace(/^.*\/api\/?/, '').replace(/\/+$/, ''); }
export function ensureMethod(event: HandlerEvent, ...methods: string[]) { if (!methods.includes(event.httpMethod)) throw new HttpError(405, 'Method not allowed.'); }
export function assertSameOrigin(event: HandlerEvent) {
  const origin = event.headers.origin;
  if (!origin) return;
  const expected = new URL(process.env.SITE_URL || '').host;
  if (!expected || new URL(origin).host !== expected) throw new HttpError(403, 'Invalid request origin.');
}
export function responseError(error: unknown) {
  if (error instanceof HttpError) return json(error.status, { ok: false, error: error.message });
  const message = error instanceof Error ? error.message : 'Unexpected error';
  console.error(error);
  return json(500, { ok: false, error: /configuration|environment/i.test(message) ? 'Service configuration is incomplete.' : 'The service could not complete this request.' });
}
