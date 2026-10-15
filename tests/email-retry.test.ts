import { describe,expect,it } from 'vitest';
import { retryUpdate } from '../server/email/service';
describe('email retry behavior',()=>{it('uses exponential retry without claiming delivery',()=>{const retry=retryUpdate(3,5,0);expect(retry.status).toBe('retry');expect(retry.nextAttemptAt).toBe(new Date(4*60_000).toISOString())});it('marks the final exhausted attempt failed',()=>expect(retryUpdate(5,5,0).status).toBe('failed'))});
