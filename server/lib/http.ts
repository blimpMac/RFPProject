export type ApplicationEvent = {
  path: string;
  rawUrl?: string;
  rawQuery?: string;
  httpMethod: string;
  headers: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string> | null;
  body: string | null;
  isBase64Encoded: boolean;
};

export type ApplicationResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
};

export type ApplicationHandler = (event: ApplicationEvent) => Promise<ApplicationResponse>;

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export const json = (statusCode: number, body: unknown, headers: Record<string,string> = {}): ApplicationResponse => ({
  statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }, body: JSON.stringify(body),
});
export function readJson(event: ApplicationEvent): unknown {
  try { return JSON.parse(event.body || '{}'); } catch { throw new HttpError(400, 'The request body is not valid JSON.'); }
}
export function routeOf(event: ApplicationEvent) { return event.path.replace(/^.*\/api\/?/, '').replace(/\/+$/, ''); }
export function ensureMethod(event: ApplicationEvent, ...methods: string[]) { if (!methods.includes(event.httpMethod)) throw new HttpError(405, 'Method not allowed.'); }
export function assertSameOrigin(event: ApplicationEvent) {
  const origin = event.headers.origin;
  if (!origin) return;
  const configuredHosts = [
    process.env.SITE_URL ? new URL(process.env.SITE_URL).host : undefined,
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ].filter((host): host is string => Boolean(host));
  if (!configuredHosts.includes(new URL(origin).host)) throw new HttpError(403, 'Invalid request origin.');
}
export function responseError(error: unknown) {
  if (error instanceof HttpError) return json(error.status, { ok: false, error: error.message });
  const message = error instanceof Error ? error.message : 'Unexpected error';
  console.error(error);
  return json(500, { ok: false, error: /configuration|environment/i.test(message) ? 'Service configuration is incomplete.' : 'The service could not complete this request.' });
}
