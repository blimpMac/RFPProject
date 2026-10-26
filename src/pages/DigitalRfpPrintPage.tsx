import { useEffect, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import {
  DigitalRfpReceipt,
  type DigitalRfpAttachment,
  type DigitalRfpOperations,
  type DigitalRfpWorkflow,
} from '../components/DigitalRfpReceipt';
import { Button, Spinner } from '../components/ui';
import { get } from '../lib/api';
import type { RfpRequest } from '../types';
import { normalizeFinanceReceipt } from '../../shared/contracts/digital-rfp';

type PrintData = {
  request: RfpRequest;
  attachments: DigitalRfpAttachment[];
};

export function DigitalRfpPrintPage() {
  const { id = '' } = useParams();
  const { roles, loading: authLoading } = useAuth();
  const [data, setData] = useState<PrintData>();
  const [error, setError] = useState('');
  const finance = roles.some((role) => ['super_administrator', 'finance_reviewer'].includes(role));

  useEffect(() => {
    if (!finance || !id) return;
    get<PrintData>(`digital-rfp/${encodeURIComponent(id)}`)
      .then((result) => {
        setData(result);
        setError('');
      })
      .catch((cause) => setError(cause.message));
  }, [finance, id]);

  if (authLoading) return <Spinner label="Checking Finance access" />;
  if (!finance) return <Navigate to="/admin" replace />;
  if (!data && !error)
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Preparing digital RFP" />
      </div>
    );
  if (error)
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="card max-w-lg p-6 text-center">
          <h1 className="text-xl font-semibold">Digital RFP unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
          <Link className="btn btn-secondary mt-4" to="/admin/approvals">
            Return to Finance
          </Link>
        </div>
      </main>
    );

  const request = data!.request;
  const workflow = (request.raw_record?.finance_workflow || {}) as DigitalRfpWorkflow;
  const financeOperations = (request.raw_record?.finance_operations || {}) as DigitalRfpOperations;
  const checklist = request.raw_record?.submission_checklist || [];
  const financeReceipt = normalizeFinanceReceipt(request.raw_record, {
    finalStatus: request.final_status,
    plannedCheckDate: request.planned_check_date,
  });

  return (
    <main className="digital-rfp-print-page">
      <div className="print-actions">
        <Link className="btn btn-secondary" to="/admin/approvals">
          <ArrowLeft size={16} />
          Back to Finance
        </Link>
        <Button onClick={() => window.print()}>
          <Printer size={16} />
          Print / Save PDF
        </Button>
      </div>
      <DigitalRfpReceipt
        request={request}
        attachments={data!.attachments}
        workflow={workflow}
        financeOperations={financeOperations}
        financeReceipt={financeReceipt}
        submissionChecklist={checklist}
      />
    </main>
  );
}
