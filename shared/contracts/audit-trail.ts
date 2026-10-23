export type AuditTrailRow = {
  id: number;
  occurred_at: string;
  table_name: string;
  record_id: string;
  operation: string;
  actor_email: string | null;
  actor_user_id: string | null;
  changed_fields: string[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export type AuditTrailResponse = {
  rows: AuditTrailRow[];
  count: number;
  page: number;
  pageSize: number;
  truncated?: boolean;
};
