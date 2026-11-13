import { HttpError } from '../lib/http.js';

type SMTPSettings = {
  user: string;
  password: string;
  fromEmail: string;
};

const token = () => process.env.VERCEL_API_TOKEN;
const project = () => process.env.VERCEL_RFP_PROJECT_ID;
const team = () => process.env.VERCEL_RFP_TEAM_ID;

export const vercelSMTPEditingReady = () => Boolean(token() && project() && team());

async function vercelCall(path: string, init: RequestInit = {}) {
  if (!vercelSMTPEditingReady()) {
    throw new HttpError(
      503,
      'IT setup is required: add VERCEL_API_TOKEN, VERCEL_RFP_PROJECT_ID and VERCEL_RFP_TEAM_ID as server-only environment variables once.',
    );
  }
  const target = new URL(path, 'https://api.vercel.com');
  target.searchParams.set('teamId', team()!);
  let response: Response;
  try {
    response = await fetch(target, {
      ...init,
      headers: {
        authorization: `Bearer ${token()}`,
        'content-type': 'application/json',
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new HttpError(502, 'Could not reach the Vercel API. No deployment has been confirmed.');
  }
  if (!response.ok) {
    // Never echo Vercel's response: an error may include environment values.
    throw new HttpError(
      502,
      `Vercel rejected the operation (HTTP ${response.status}). Check the IT access token and RFP project permissions.`,
    );
  }
  return response.json() as Promise<Record<string, unknown>>;
}

export async function applySMTPToVercelAndRedeploy(input: SMTPSettings) {
  const id = encodeURIComponent(project() || '');
  // Only the three sender credentials can be edited through the IT portal.
  // SMTP_HOST, SMTP_PORT and SMTP_SECURE remain server-managed settings.
  const variables = [
    ['SMTP_USER', input.user],
    ['SMTP_PASSWORD', input.password],
    ['SMTP_FROM_EMAIL', input.fromEmail],
  ].map(([key, value]) => ({ key, value, type: 'encrypted', target: ['production'] }));

  // Upsert only these three allowed keys in the designated RFP project.
  await vercelCall(`/v10/projects/${id}/env?upsert=true`, {
    method: 'POST',
    body: JSON.stringify(variables),
  });

  const current = await vercelCall(
    `/v6/deployments?projectId=${encodeURIComponent(project()!)}&target=production&state=READY&limit=1`,
  );
  const deployments = current.deployments as Array<{ uid?: string; id?: string }> | undefined;
  const previousId = deployments?.[0]?.uid || deployments?.[0]?.id;
  if (!previousId) {
    return {
      saved: true,
      redeployStarted: false,
      note: 'SMTP variables saved. No previous ready production deployment was found; deployment must be started by an authorized operator.',
    };
  }
  const deployment = await vercelCall('/v13/deployments?forceNew=1', {
    method: 'POST',
    body: JSON.stringify({
      name: process.env.VERCEL_RFP_PROJECT_NAME || 'greenlight-rfp',
      project: project(),
      deploymentId: previousId,
      withLatestCommit: true,
      target: 'production',
    }),
  });
  return {
    saved: true,
    redeployStarted: Boolean(deployment.id),
    deploymentId: typeof deployment.id === 'string' ? deployment.id : null,
    note: 'New production build requested. Verify READY status before considering sender configuration live.',
  };
}

export async function readVercelSmtpStatus() {
  if (!vercelSMTPEditingReady()) return { ready: false, checked: false, keys: [] as string[] };
  const data = await vercelCall(`/v10/projects/${encodeURIComponent(project()!)}/env`);
  const vars = (data.envs || []) as Array<{ key?: string; target?: string[] }>;
  return {
    ready: true,
    checked: true,
    keys: vars
      .filter((entry) => ['SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM_EMAIL'].includes(entry.key || '') && entry.target?.includes('production'))
      .map((entry) => entry.key!),
  };
}
