import assert from 'node:assert/strict';
import test from 'node:test';
import { auditTrailRow, changedAuditFields, sanitizeAuditValues } from './audit-trail.ts';

test('redacts credentials from audit values at every nesting level', () => {
  assert.deepEqual(
    sanitizeAuditValues({
      final_status: 'Approved',
      public_tracking_hash: 'secret',
      raw_record: { copied: 'source data' },
      nested: { token_hash: 'secret', visible: true },
      payload: { trackingTokenCiphertext: 'secret' },
    }),
    { final_status: 'Approved', nested: { visible: true } },
  );
});

test('reports only fields whose audit values changed', () => {
  assert.deepEqual(
    changedAuditFields({ active: true, name: 'Before' }, { active: true, name: 'After' }),
    ['name'],
  );
});

test('converts database audit records into safe API rows', () => {
  const row = auditTrailRow({
    id: 4,
    occurred_at: '2026-10-23T01:00:00Z',
    table_name: 'rfp_requests',
    record_id: 'request-id',
    operation: 'UPDATE',
    actor_email: 'staff@example.com',
    actor_user_id: null,
    old_values: { final_status: 'Pending', token_hash: 'hidden' },
    new_values: { final_status: 'Approved', token_hash: 'hidden-again' },
  });
  assert.equal(row.actor_email, 'staff@example.com');
  assert.deepEqual(row.changed_fields, ['final_status']);
  assert.equal('token_hash' in (row.after || {}), false);
});
