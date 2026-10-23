import type { AuditTrailRow } from '../../shared/contracts/audit-trail.js';

const secretKeys = new Set([
  'public_tracking_hash',
  'idempotency_key',
  'token_hash',
  'client_hash',
  'payload',
  'raw_record',
  'reviewtokenciphertext',
  'trackingtokenciphertext',
]);

function sanitizedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizedValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !secretKeys.has(key.toLowerCase()))
      .map(([key, nested]) => [key, sanitizedValue(nested)]),
  );
}

export function sanitizeAuditValues(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return sanitizedValue(value) as Record<string, unknown>;
}

export function changedAuditFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys]
    .filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]))
    .sort();
}

export function auditTrailRow(row: Record<string, unknown>): AuditTrailRow {
  const before = sanitizeAuditValues(row.old_values);
  const after = sanitizeAuditValues(row.new_values);
  return {
    id: Number(row.id),
    occurred_at: String(row.occurred_at),
    table_name: String(row.table_name),
    record_id: String(row.record_id),
    operation: String(row.operation),
    actor_email: typeof row.actor_email === 'string' ? row.actor_email : null,
    actor_user_id: typeof row.actor_user_id === 'string' ? row.actor_user_id : null,
    changed_fields: changedAuditFields(before, after),
    before,
    after,
  };
}
