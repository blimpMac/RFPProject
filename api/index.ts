import { handler as applicationHandler } from '../server/api.js';
import type { ApplicationEvent, ApplicationResponse } from '../server/lib/http.js';
import { GET as cleanupUploads } from './cron/cleanup-uploads.js';
import { GET as processEmailQueue } from './cron/process-email-queue.js';

function requestHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
  return headers;
}

function routedPath(url: URL): string {
  return (url.searchParams.get('path') ?? '').replace(/^\/+|\/+$/g, '');
}

async function dispatch(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = routedPath(url);

  if (path === 'cron/process-email-queue') return processEmailQueue(request);
  if (path === 'cron/cleanup-uploads') return cleanupUploads(request);

  const queryStringParameters: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    if (key !== 'path') queryStringParameters[key] = value;
  });
  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const event = {
    path: `/api/${path}`,
    rawUrl: request.url,
    rawQuery: new URLSearchParams(queryStringParameters).toString(),
    httpMethod: request.method,
    headers: requestHeaders(request),
    queryStringParameters,
    body: hasBody ? await request.text() : null,
    isBase64Encoded: false,
  } satisfies ApplicationEvent;

  const result = await applicationHandler(event);
  if (!result) {
    return Response.json({ ok: false, error: 'The service returned no response.' }, { status: 500 });
  }

  const response = result as ApplicationResponse;
  const headers = new Headers();
  Object.entries(response.headers ?? {}).forEach(([key, value]) => {
    if (value !== undefined) headers.set(key, String(value));
  });
  return new Response(response.body ?? null, {
    status: response.statusCode,
    headers,
  });
}

export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
export const PUT = dispatch;
export const DELETE = dispatch;
export const OPTIONS = dispatch;
