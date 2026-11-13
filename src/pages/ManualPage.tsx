import { useMemo, useState } from 'react';
import {
  BookOpen,
  CircleHelp,
  ClipboardList,
  LifeBuoy,
  Search,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../components/AuthProvider';

type Topic = { title: string; description: string };
type Section = { id: string; title: string; subtitle: string; topics: Topic[] };

const sections: Section[] = [
  {
    id: 'workflow',
    title: 'How to use the RFP system',
    subtitle: 'From creating a payment request through release and liquidation',
    topics: [
      {
        title: '1. Submit a request',
        description:
          'Open Add a new Request, select the company, department, request type, payee, amount, purpose and required date. Use your full first and last name. An active Department Head must be assigned before you can submit.',
      },
      {
        title: '2. Attach supporting documents',
        description:
          'Check the requirements shown for the selected type and upload supporting PDFs or images. Wait until every upload completes before submitting. Keep the private tracking link and assigned reference number.',
      },
      {
        title: '3. Department Head review',
        description:
          'The assigned Department Head reviews the request, attached files and remarks. They can Approve, Reject or Return for Correction. Reject closes the request; Return permits correction under the same reference.',
      },
      {
        title: '4. Print the approved RFP',
        description:
          'Once Department approval is recorded, use the tracking page to print or save the digital RFP. The reference is created during submission and stays linked to the request.',
      },
      {
        title: '5. Finance review',
        description:
          'Finance Member reviews the submitted documents, then the Finance Head approves. Use the Approval queue to inspect requests and record review actions. Finance can request additional documentation.',
      },
      {
        title: '6. Original documents',
        description:
          'Submit original supporting documents to Finance. Finance records the receipt date and marks document verification Complete or Incomplete. Processing starts only after the required hard-copy verification is approved.',
      },
      {
        title: '7. Payment processing',
        description:
          'Finance records processing, check preparation, signatory/check approval, release and completion through the available action buttons. Use the dashboard and approval queue to monitor due dates and overdue work.',
      },
      {
        title: '8. Cash advance liquidation',
        description:
          'For supported CA/RF advance types, a daily automated job marks Paid advances as Pending Liquidation after at least 72 hours. The requestor submits itemized expenses using the private tracking link, and Finance reviews the liquidation.',
      },
      {
        title: '9. Track or resubmit',
        description:
          'Use your saved private tracking link to see the latest status and action history. For Returned to Requestor records, provide a correction note and resubmit without changing the existing reference.',
      },
      {
        title: '10. Export and reconcile',
        description:
          'Authorized staff can filter, search and export records from RFP requests and Monitoring. Confirm report dates, statuses and company before using exports for reconciliation.',
      },
    ],
  },
  {
    id: 'faqs',
    title: 'Frequently asked questions',
    subtitle: 'Answers to the questions requestors and staff ask most often',
    topics: [
      {
        title: 'Where do I find my RFP number?',
        description:
          'The confirmation screen displays it after a successful submission. Save the private tracking link too; do not share it publicly.',
      },
      {
        title: 'Can a submitted request be edited?',
        description:
          'Only a request returned for correction can be corrected and resubmitted through its original tracking link, subject to the workflow.',
      },
      {
        title: 'What is the difference between Reject and Return?',
        description:
          'Reject ends the Department review without resubmission. Return for Correction allows the requestor to edit and resubmit the same reference.',
      },
      {
        title: 'Why can I not submit a request?',
        description:
          'Complete all mandatory fields, enter a full name, choose a valid type and department, and ensure that department has an active approving head.',
      },
      {
        title: 'Who approves Finance requests?',
        description:
          'Finance Member reviews first, Finance Head reviews next. Finance also validates original documents before payment processing.',
      },
      {
        title: 'When is an approved request ready for processing?',
        description:
          'Finance must receive and verify original documents. A Department-approved RFP is not automatically a released payment.',
      },
      {
        title: 'Can I preview official form layouts?',
        description:
          'Yes. Open the separate Preview Forms tab. Sample previews are marked SAMPLE; Finance can open an actual request from its approval record.',
      },
      {
        title: 'Does Paid automatically mean liquidation is complete?',
        description:
          'No. Eligible cash advances transition to Pending Liquidation after at least 72 hours when the scheduled job runs. Finance must review the expense summary.',
      },
      {
        title: 'Can I download a report?',
        description:
          'Authorized staff can use the table export buttons for CSV or Excel, subject to their assigned access.',
      },
    ],
  },
  {
    id: 'issues',
    title: 'Common issues and quick fixes',
    subtitle: 'Start here before raising an incident',
    topics: [
      {
        title: 'Cannot sign in',
        description:
          'Check your account email and password, try the password recovery page, then ask an administrator to verify that your account is active and has an assigned role.',
      },
      {
        title: 'Department Head is missing',
        description:
          'Ask the Finance Head / administrator to assign an active Department Head to the selected department in Account Management.',
      },
      {
        title: 'Attachment upload fails',
        description:
          'Check the file type (PDF/JPG/PNG/WEBP/GIF), configured size limit and network connection. Retry once and avoid creating duplicate submissions.',
      },
      {
        title: 'Email not received',
        description:
          'Check spam/junk and the intended recipient address. Administrators should check Email Queue Diagnostics, SMTP configuration and whether the message is sent rather than queued.',
      },
      {
        title: 'Approval link expired or already used',
        description:
          'Secure review links are single-use and can expire. Request a fresh notification or ask the administrator to inspect the existing approval record.',
      },
      {
        title: 'RFP not showing in the dashboard',
        description:
          'Clear date/company/status filters and refresh. Confirm the reference using the requestor tracking link; raise an issue with the reference if still missing.',
      },
      {
        title: 'Cannot proceed to payment',
        description:
          'Confirm Finance Member and Finance Head approvals, original receipt date and Complete document verification. Incomplete hard copies block processing.',
      },
      {
        title: 'Status does not update immediately',
        description:
          'Refresh the request; scheduled liquidation transitions are not instantaneous. After the 72-hour threshold, the daily maintenance job must still run.',
      },
      {
        title: 'Duplicate RFP or incorrect data',
        description:
          'Do not delete production records to fix a discrepancy. Record the reference, timestamp and screenshots, then escalate to the administrator for audit review.',
      },
      {
        title: 'Wrong layout or printing problem',
        description:
          'Use Preview Forms for sample layouts and the dedicated print page for actual Finance records. Try the browser Print / Save PDF option with the appropriate paper size.',
      },
    ],
  },
  {
    id: 'maintenance',
    title: 'Maintenance and administration',
    subtitle: 'An operational checklist for Finance Head and IT',
    topics: [
      {
        title: 'Daily — queue and workflow',
        description:
          'Review failed/queued email notifications and Finance exceptions. Check that the daily email/liquidation and abandoned-upload cleanup jobs completed. Monitor urgent, overdue and pending hard-copy records.',
      },
      {
        title: 'Weekly — access and audit',
        description:
          'Review active staff accounts and assigned departments, investigate rejected/returned records and unexpected status changes, and confirm exports are available for reconciliation.',
      },
      {
        title: 'Monthly — reconciliations and backups',
        description:
          'Reconcile RFP reports against Finance payment records. Verify database and private-file backup/restore procedures, monitor retention, and review exception logs.',
      },
      {
        title: 'Before deployment',
        description:
          'Review code changes, run typecheck, tests, lint and build in a safe environment. Verify migration effects and secrets, then deploy through the normal reviewed GitHub/Vercel process.',
      },
      {
        title: 'After deployment',
        description:
          'Smoke-test submission, attachments, approvals, hard-copy verification, payments, tracking, exports and access permissions with approved test data. Confirm scheduled jobs and email delivery.',
      },
      {
        title: 'Security and incident response',
        description:
          'Never expose Supabase secret keys, SMTP credentials, approval links or private tracking URLs. Keep an incident record with time, request reference, symptoms, impact and corrective action.',
      },
      {
        title: 'Recovery and rollback',
        description:
          'Use verified Vercel deployment rollback for frontend failures; treat database migrations as forward-only and prepare reviewed corrective migrations. Do not force-push or manually delete audit history.',
      },
    ],
  },
];

const itSections: Section[] = [
  {
    id: 'it-overview',
    title: 'IT operations and service health',
    subtitle: 'How to monitor the system without entering Finance approval workflows',
    topics: [
      {
        title: '1. Open the IT workspace',
        description:
          'Sign in through the same Staff Login page as other users. Your IT Administrator role directs you to IT Dashboard. IT operators do not approve, release, or edit RFP payment transactions.',
      },
      {
        title: '2. Monitor production services',
        description:
          'Open IT Dashboard → Services to review Supabase connectivity, the configured SMTP sender, the Vercel API integration status, and recent notification queue counts. A status of configured does not guarantee delivery to an inbox.',
      },
      {
        title: '3. Review notification diagnostics',
        description:
          'Use Email Queue Diagnostics under Services to inspect queued, retried, sent and failed messages. Check each affected request reference and error context before retrying; do not duplicate financial approvals.',
      },
      {
        title: '4. Interpret dashboard metrics',
        description:
          'User Overview lists account profiles and assigned roles. Login Monitoring uses recent authenticated browser heartbeats; online activity is an estimate, not proof of constant user interaction.',
      },
      {
        title: '5. Record service incidents',
        description:
          'Capture the time in Philippine time, service affected, relevant request reference if applicable, error text and impact. Never put passwords, SMTP credentials, access tokens or private tracking links in incident reports.',
      },
    ],
  },
  {
    id: 'it-access',
    title: 'User accounts and login monitoring',
    subtitle: 'Identity, access levels, session activity and controlled password recovery',
    topics: [
      {
        title: '1. Review user access',
        description:
          'Open IT Dashboard → Users. Confirm names, email addresses, departments, assigned roles, active status, and the most recent successful sign-in. IT role membership is stored separately from Finance approval roles.',
      },
      {
        title: '2. Monitor active logins',
        description:
          'Open Login monitoring. An authenticated session is Active when its last heartbeat is under three minutes old and it has not signed out. A browser that closes unexpectedly changes to Offline when the heartbeat window expires.',
      },
      {
        title: '3. Reset a staff password without OTP',
        description:
          'Open Password reset, select an eligible non-protected user, enter and confirm a strong temporary password, then confirm your own current IT password. The server limits resets and records the operator and target; it does not store the new password in audit logs.',
      },
      {
        title: '4. Respect protected accounts',
        description:
          'Protected accounts and other IT Administrator accounts cannot be reset using the standard IT reset screen. Never remove protection or grant Finance permissions as a workaround; follow the approved account recovery process.',
      },
      {
        title: '5. Change your display name',
        description:
          'Open the upper-right account menu → Edit profile. Updating your own display name does not change your email, department, access level or other users’ records.',
      },
    ],
  },
  {
    id: 'it-smtp',
    title: 'SMTP configuration and email reliability',
    subtitle: 'Sender changes, deployment state and troubleshooting notification failures',
    topics: [
      {
        title: '1. Know the three editable fields',
        description:
          'Open IT Dashboard → SMTP sender. Only Email (SMTP username), SMTP Password, and SMTP From Email may be changed here. SMTP host, port, security mode and the Vercel management token are server-managed settings.',
      },
      {
        title: '2. Verify one-time Vercel API setup',
        description:
          'If the SMTP page says Setup required, an authorized operator must configure the RFP project’s server-only VERCEL_API_TOKEN, VERCEL_RFP_PROJECT_ID and VERCEL_RFP_TEAM_ID variables once. Do not paste those secrets into the site or source code.',
      },
      {
        title: '3. Apply a sender change',
        description:
          'Enter an authorized SMTP account and From address, confirm your own IT login password, then save. The server updates the three sender variables for the configured RFP project and requests a production rebuild. Changes are not live until the new deployment is READY.',
      },
      {
        title: '4. Test notifications after deployment',
        description:
          'Verify deployment success, send an approved test notification, check Email Queue Diagnostics and confirm that the recipient sees the intended From address. Provider acceptance does not guarantee inbox placement.',
      },
      {
        title: '5. Investigate failed mail',
        description:
          'Check the recipient, SMTP authentication or app-password status, sender authorization, queue retry state and deployment status. Do not expose SMTP passwords or retry a request in a way that duplicates an approval.',
      },
    ],
  },
  {
    id: 'it-maintenance',
    title: 'Audit, troubleshooting and maintenance',
    subtitle: 'Security review, common incidents, changes and recovery',
    topics: [
      {
        title: '1. Inspect audit history',
        description:
          'Use IT Operations → Audit trail to review recorded system events. IT password resets and sender changes also appear in the IT security actions view. Preserve timestamps and user IDs when investigating an incident.',
      },
      {
        title: '2. Resolve an account access failure',
        description:
          'Confirm the email exists in Supabase Authentication, email is confirmed, its staff profile is active, and the correct role is assigned. IT access requires an active it_administrators entry; a Finance role is not a substitute.',
      },
      {
        title: '3. Investigate missing live activity',
        description:
          'Confirm the user is actually signed in and the staff presence endpoint is responding. Active status depends on a browser heartbeat and may show Offline after three minutes without one; older logins cannot be reconstructed retroactively.',
      },
      {
        title: '4. Perform regular health checks',
        description:
          'Daily: inspect failed or pending notifications and scheduled jobs. Weekly: review accounts, login activity and unusual audit events. Monthly: confirm approved backup/restore processes and review retention and access permissions.',
      },
      {
        title: '5. Prepare and verify a deployment',
        description:
          'Review code changes and run formatting, TypeScript, lint, tests and production build before merging. After deployment, verify the login, profile editing, IT-only screens, SMTP status, and representative Finance functions using approved test data.',
      },
      {
        title: '6. Handle incidents and rollback',
        description:
          'Capture the impact, time and errors, isolate affected services, and use the approved deployment rollback or a reviewed forward corrective database migration. Never delete audit history or modify payment data to silence an error.',
      },
    ],
  },
];

const itTabs = [
  { id: 'it-overview', label: 'IT operations', icon: ClipboardList },
  { id: 'it-access', label: 'Users & sessions', icon: CircleHelp },
  { id: 'it-smtp', label: 'SMTP & delivery', icon: LifeBuoy },
  { id: 'it-maintenance', label: 'Audit & maintenance', icon: Wrench },
];

const tabs = [
  { id: 'workflow', label: 'How to use', icon: ClipboardList },
  { id: 'faqs', label: 'FAQs', icon: CircleHelp },
  { id: 'issues', label: 'Troubleshooting', icon: LifeBuoy },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench },
];

export function ManualPage() {
  const { roles } = useAuth();
  const isIT = roles.includes('it_administrator');
  const visibleSections = isIT ? itSections : sections;
  const visibleTabs = isIT ? itTabs : tabs;
  const [section, setSection] = useState('workflow');
  const [query, setQuery] = useState('');
  const active = visibleSections.find((item) => item.id === section) || visibleSections[0];
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? visibleSections.flatMap((group) =>
          group.topics
            .filter((item) => (item.title + ' ' + item.description).toLowerCase().includes(needle))
            .map((item) => ({ ...item, section: group.title })),
        )
      : active.topics.map((item) => ({ ...item, section: active.title }));
  }, [active, query, visibleSections]);

  return (
    <div className="space-y-5">
      <section className="dashboard-hero flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">{isIT ? 'IT operations reference' : 'Staff reference guide'}</p>
          <h2 className="mt-2 flex items-center gap-3 text-2xl font-semibold sm:text-3xl">
            <BookOpen size={28} /> {isIT ? 'IT Technical Manual' : 'RFP System Manual'}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            {isIT
              ? 'Account administration, login monitoring, service diagnostics, SMTP delivery, audit and maintenance.'
              : 'Submission, Department approval, Finance processing, troubleshooting and maintenance in one place.'}
          </p>
        </div>
      </section>
      <section className="card p-4 sm:p-5">
        <label className="mb-2 block text-sm font-semibold" htmlFor="manual-search">
          Search the manual
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            id="manual-search"
            className="input w-full !pl-10"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a step, FAQ or issue..."
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Manual sections">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={!query && active.id === tab.id}
                onClick={() => {
                  setSection(tab.id);
                  setQuery('');
                }}
                className={active.id === tab.id && !query ? 'btn btn-primary' : 'btn btn-secondary'}
              >
                <Icon size={16} /> {tab.label}
              </button>
            );
          })}
        </div>
      </section>
      <section aria-label={query ? 'Search results' : active.title}>
        <div className="mb-4 flex items-start gap-3">
          <ShieldCheck size={23} className="mt-1 text-[#16846d]" />
          <div>
            <h3 className="text-xl font-semibold">{query ? 'Search results' : active.title}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {query ? matches.length + ' matching topics across the manual' : active.subtitle}
            </p>
          </div>
        </div>
        {matches.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">
            No matching topics. Try a shorter search or select another section.
          </div>
        ) : (
          <div className="grid gap-3">
            {matches.map((item, index) => (
              <details
                key={item.section + item.title}
                open={index === 0}
                className="card group p-4 sm:p-5"
              >
                <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-100">
                  {item.title}
                </summary>
                <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  {item.description}
                </p>
                {query && <p className="mt-2 text-xs text-slate-500">{item.section}</p>}
              </details>
            ))}
          </div>
        )}
      </section>
      <p className="text-xs leading-5 text-slate-500">
        {isIT
          ? 'This is an IT operations reference. Production credential, database and deployment changes require authorized review; IT access does not grant Finance approval authority.'
          : 'This guide follows the RFP monitoring workflow in the current application. Changes to finance policy, document requirements and system settings should be verified by the Finance Head before rollout.'}
      </p>
    </div>
  );
}
