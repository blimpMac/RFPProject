import { z } from 'zod';

const optionalKey=z.preprocess((value)=>value===''?undefined:value,z.string().min(20).optional());
const optionalString=z.preprocess((value)=>value===''?undefined:value,z.string().min(1).optional());
const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: optionalKey,
  SUPABASE_SERVICE_ROLE_KEY: optionalKey,
  APPROVAL_TOKEN_ENCRYPTION_KEY: z.string().min(32),
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: z.string().default('true').transform((v) => v === 'true'),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  SMTP_FROM_EMAIL: optionalString,
  SITE_URL: z.string().url(),
  MAX_UPLOAD_FILES: z.coerce.number().int().min(0).max(10).default(10),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().max(50).default(10),
  REVIEW_TOKEN_HOURS: z.coerce.number().int().positive().default(168),
  EMAIL_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX_SUBMISSIONS: z.coerce.number().int().positive().default(8),
  TEMP_TEST_RETENTION_HOURS: z.coerce.number().int().min(1).max(168).default(24),
}).refine((value)=>Boolean(value.SUPABASE_SECRET_KEY||value.SUPABASE_SERVICE_ROLE_KEY),{message:'SUPABASE_SECRET_KEY is required (legacy SUPABASE_SERVICE_ROLE_KEY is also accepted).'});

export type Config = z.infer<typeof schema>;
let cached: Config | undefined;
export function config(): Config {
  cached ??= schema.parse(process.env);
  return cached;
}
