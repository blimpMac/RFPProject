export type Role =
  'super_administrator' | 'administrator' | 'department_approver' | 'finance_reviewer';
export type RfpRequest = {
  id: string;
  rfp_number: string;
  submitted_at: string | null;
  requestor_email: string;
  requestor_name: string;
  company: string | null;
  department: string;
  project_class: string;
  rfp_type: string;
  supplier_payee: string;
  purpose_description: string;
  amount: number;
  required_payment_date: string;
  approving_head: string;
  approver_email: string;
  department_approval: string;
  department_approval_at: string | null;
  department_approval_remarks: string | null;
  finance_review: string;
  finance_review_at: string | null;
  finance_remarks: string | null;
  final_status: string;
  last_action: string;
  planned_check_date: string | null;
  check_date_last_updated: string | null;
  check_date_change_reason: string | null;
  finance_email_thread_id: string | null;
  raw_record?: {
    finance_operations?: {
      originals_received_date?: string | null;
      document_verification?: 'Complete' | 'Incomplete' | null;
      verification_remarks?: string | null;
      updated_at?: string | null;
      updated_by?: string | null;
    };
    [key: string]: unknown;
  } | null;
};
export type PublicOptions = { departments: string[]; requestTypes: string[] };
