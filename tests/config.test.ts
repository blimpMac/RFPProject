import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('server configuration', () => {
  it('treats blank optional SMTP values as unconfigured', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'secret-key-with-at-least-20-characters');
    vi.stubEnv('APPROVAL_TOKEN_ENCRYPTION_KEY', 'encryption-key-with-at-least-32-characters');
    vi.stubEnv('SITE_URL', 'https://rfp.example.com');
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('SMTP_USER', '');
    vi.stubEnv('SMTP_PASSWORD', '');
    vi.stubEnv('SMTP_FROM_EMAIL', '');

    const { config } = await import('../netlify/lib/config');
    const result = config();

    expect(result.SMTP_HOST).toBeUndefined();
    expect(result.SMTP_USER).toBeUndefined();
    expect(result.SMTP_PASSWORD).toBeUndefined();
    expect(result.SMTP_FROM_EMAIL).toBeUndefined();
  });
});
