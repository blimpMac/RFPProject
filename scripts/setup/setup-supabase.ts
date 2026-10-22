import { spawnSync } from 'node:child_process';
import process from 'node:process';

const url = process.env.SUPABASE_URL;
if (!url) throw new Error('SUPABASE_URL is required.');
if (!process.env.SUPABASE_ACCESS_TOKEN)
  throw new Error('SUPABASE_ACCESS_TOKEN is required for automated project linking.');
if (!process.env.SUPABASE_DB_PASSWORD)
  throw new Error('SUPABASE_DB_PASSWORD is required to apply migrations.');
const ref = new URL(url).host.split('.')[0];
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
function run(args: string[]) {
  const result = spawnSync(npx, ['--yes', 'supabase@latest', ...args], {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });
  if (result.status !== 0) throw new Error(`Supabase CLI failed: ${args.join(' ')}`);
}
run(['link', '--project-ref', ref, '--password', process.env.SUPABASE_DB_PASSWORD]);
run(['db', 'push', '--include-all', '--password', process.env.SUPABASE_DB_PASSWORD]);
console.log('Supabase migrations, RLS, functions, and private storage bucket are configured.');
