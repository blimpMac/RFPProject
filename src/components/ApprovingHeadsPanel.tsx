import { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleAlert, Crown, ShieldCheck, Users } from 'lucide-react';
import type {
  ApprovalTeam,
  ApprovingHeadCandidate,
  ApprovingHeadOverview,
} from '../../shared/contracts/approving-heads';
import { get, post } from '../lib/api';
import { Button, Modal, Spinner, StatusBadge } from './ui';

type Candidate = ApprovingHeadCandidate;
type RosterResponse = ApprovingHeadOverview;

function normalized(value: string | null | undefined) {
  return (
    value
      ?.trim()
      .replace(/^[- ]+/, '')
      .toLowerCase() || ''
  );
}
function departmentLabel(value: string | null) {
  return value?.replace(/^[- ]+/, '') || 'No department assigned';
}
function roleLabel(roles: string[]) {
  if (roles.includes('super_administrator')) return 'Super Administrator';
  if (roles.includes('administrator')) return 'Administrator';
  return 'Department Approver';
}

function savedTeam(data: RosterResponse): ApprovalTeam {
  const allDepartments = new Set(data.departments.map((roster) => normalized(roster.department)));
  const coverage = new Map<string, Set<string>>();
  for (const roster of data.departments) {
    for (const userId of roster.headUserIds) {
      const assigned = coverage.get(userId) || new Set<string>();
      assigned.add(normalized(roster.department));
      coverage.set(userId, assigned);
    }
  }
  const headCandidates = data.candidates.filter((candidate) => {
    const assigned = coverage.get(candidate.id);
    return (
      assigned?.size === allDepartments.size &&
      [...allDepartments].every((department) => assigned.has(department))
    );
  });
  const headUserId = headCandidates.length === 1 ? headCandidates[0].id : '';
  const usedDepartments = new Set<string>();
  const coApproverUserIds = data.candidates
    .filter((candidate) => {
      if (candidate.id === headUserId || !candidate.roles.includes('department_approver'))
        return false;
      const department = normalized(candidate.department);
      const assigned = coverage.get(candidate.id);
      if (
        !department ||
        assigned?.size !== 1 ||
        !assigned.has(department) ||
        usedDepartments.has(department)
      )
        return false;
      usedDepartments.add(department);
      return true;
    })
    .slice(0, 3)
    .map((candidate) => candidate.id);
  return { headUserId, coApproverUserIds };
}

export function ApprovingHeadsPanel() {
  const [data, setData] = useState<RosterResponse>();
  const [editing, setEditing] = useState(false);
  const [team, setTeam] = useState<ApprovalTeam>({ headUserId: '', coApproverUserIds: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await get<RosterResponse>('approving-heads'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the approval team.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const candidateMap = useMemo(
    () => new Map((data?.candidates || []).map((candidate) => [candidate.id, candidate])),
    [data],
  );
  const current = data ? savedTeam(data) : { headUserId: '', coApproverUserIds: [] };
  const currentHead = candidateMap.get(current.headUserId);
  const currentCoApprovers = current.coApproverUserIds
    .map((id) => candidateMap.get(id))
    .filter((candidate): candidate is Candidate => Boolean(candidate));
  const configured =
    Boolean(currentHead) && currentCoApprovers.length >= 2 && currentCoApprovers.length <= 3;

  function openEditor() {
    setTeam(current);
    setEditing(true);
    setError('');
    setNotice('');
  }

  async function save() {
    if (!team.headUserId || team.coApproverUserIds.length < 2 || team.coApproverUserIds.length > 3)
      return;
    setBusy(true);
    setError('');
    try {
      await post('approving-heads', team);
      setNotice(
        'Approval team saved. The Head receives every request; Co-Approvers receive requests for their own departments.',
      );
      setEditing(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the approval team.');
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <div className="card p-8 text-center">
        <Spinner label="Loading approval team" />
      </div>
    );
  if (!data)
    return (
      <div className="card p-5 text-sm text-red-700">
        {error || 'Could not load the approval team.'}
      </div>
    );
  const departmentKeys = new Set(data.departments.map((roster) => normalized(roster.department)));
  const eligibleCoApprovers = data.candidates.filter(
    (candidate) =>
      candidate.roles.includes('department_approver') &&
      departmentKeys.has(normalized(candidate.department)),
  );

  return (
    <>
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-[#315c93]" />
            <h2 className="font-semibold">Approval team</h2>
          </div>
          <Button
            disabled={!data.departments.length || eligibleCoApprovers.length < 2}
            onClick={openEditor}
          >
            {configured ? 'Edit approval team' : 'Set up approval team'}
          </Button>
        </div>
        {error && (
          <p className="m-4 rounded bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="m-4 rounded bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
            {notice}
          </p>
        )}
        {eligibleCoApprovers.length < 2 && (
          <p className="m-4 flex items-start gap-2 rounded bg-amber-50 p-3 text-sm text-amber-900">
            <CircleAlert className="mt-0.5 shrink-0" size={17} />
            Add or activate at least 2 Department Approver accounts with configured departments
            before setting up the team.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 border-b bg-slate-50 px-5 py-3 text-sm">
          <StatusBadge>{configured ? 'Complete' : 'Needs setup'}</StatusBadge>
          <span className="text-slate-600">
            {currentHead ? '1 of 1' : '0 of 1'} Head · {currentCoApprovers.length} of 2–3
            Co-Approvers
          </span>
        </div>
        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <article
            className={`rounded-xl border p-4 ${currentHead ? 'border-blue-200 bg-blue-50' : 'border-amber-300 bg-amber-50'}`}
          >
            <div className="flex items-center gap-2">
              <Crown size={18} className="text-[#315c93]" />
              <h3 className="font-semibold">Approver Head</h3>
            </div>
            {currentHead ? (
              <div className="mt-3 rounded-lg border bg-white p-3">
                <p className="font-semibold">{currentHead.displayName}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {roleLabel(currentHead.roles)} · All departments
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm font-semibold text-amber-900">Not selected</p>
            )}
          </article>
          <article
            className={`rounded-xl border p-4 ${currentCoApprovers.length >= 2 ? 'border-slate-200' : 'border-amber-300 bg-amber-50'}`}
          >
            <div className="flex items-center gap-2">
              <Users size={18} className="text-[#315c93]" />
              <h3 className="font-semibold">Co-Approvers</h3>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {currentCoApprovers.map((candidate) => (
                <div className="rounded-lg border bg-white p-3" key={candidate.id}>
                  <p className="font-semibold">{candidate.displayName}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {departmentLabel(candidate.department)}
                  </p>
                </div>
              ))}
              {!currentCoApprovers.length && (
                <p className="text-sm font-semibold text-amber-900">Not selected</p>
              )}
            </div>
          </article>
        </div>
        {!configured && (
          <p className="border-t bg-amber-50 px-5 py-3 text-sm text-amber-900">
            Your current routing stays unchanged until you select a valid team and save it.
          </p>
        )}
      </section>
      {editing && (
        <TeamEditor
          candidates={data.candidates}
          departmentKeys={departmentKeys}
          team={team}
          busy={busy}
          error={error}
          onChange={setTeam}
          onClose={() => setEditing(false)}
          onSave={() => void save()}
        />
      )}
    </>
  );
}

type EditorProps = {
  candidates: Candidate[];
  departmentKeys: Set<string>;
  team: ApprovalTeam;
  busy: boolean;
  error: string;
  onChange: (team: ApprovalTeam) => void;
  onClose: () => void;
  onSave: () => void;
};

function TeamEditor({
  candidates,
  departmentKeys,
  team,
  busy,
  error,
  onChange,
  onClose,
  onSave,
}: EditorProps) {
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const valid =
    Boolean(team.headUserId) &&
    team.coApproverUserIds.length >= 2 &&
    team.coApproverUserIds.length <= 3;
  const groupedCandidates = useMemo(() => {
    const groups = new Map<string, { label: string; candidates: Candidate[] }>();
    for (const candidate of candidates) {
      const departmentKey = normalized(candidate.department);
      const key = departmentKey || 'administrators-unassigned';
      const label =
        key === 'administrators-unassigned'
          ? 'Administrators / Unassigned'
          : departmentLabel(candidate.department);
      const group = groups.get(key) || { label, candidates: [] };
      group.candidates.push(candidate);
      groups.set(key, group);
    }
    return [...groups.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => {
        if (a.key === 'administrators-unassigned') return -1;
        if (b.key === 'administrators-unassigned') return 1;
        return a.label.localeCompare(b.label);
      });
  }, [candidates]);
  const visibleGroups =
    departmentFilter === 'all'
      ? groupedCandidates
      : groupedCandidates.filter((group) => group.key === departmentFilter);

  function selectHead(candidateId: string, checked: boolean) {
    onChange({
      headUserId: checked ? candidateId : '',
      coApproverUserIds: team.coApproverUserIds.filter((id) => id !== candidateId),
    });
  }

  function selectCoApprover(candidate: Candidate, checked: boolean) {
    if (!checked) {
      onChange({
        ...team,
        coApproverUserIds: team.coApproverUserIds.filter((id) => id !== candidate.id),
      });
      return;
    }
    const department = normalized(candidate.department);
    const withoutSameDepartment = team.coApproverUserIds.filter(
      (id) => normalized(candidates.find((item) => item.id === id)?.department) !== department,
    );
    if (withoutSameDepartment.length >= 3) return;
    onChange({
      headUserId: team.headUserId === candidate.id ? '' : team.headUserId,
      coApproverUserIds: [...withoutSameDepartment, candidate.id],
    });
  }

  return (
    <Modal title="Choose the approval team" size="wide" onClose={onClose}>
      <div>
        <div className="field max-w-sm">
          <label htmlFor="approval-team-department-filter">Department</label>
          <select
            id="approval-team-department-filter"
            className="input"
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
          >
            <option value="all">All departments</option>
            {groupedCandidates.map((group) => (
              <option key={group.key} value={group.key}>
                {group.label} ({group.candidates.length})
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 space-y-4">
          {visibleGroups.map((group) => (
            <section
              className="overflow-hidden rounded-xl border"
              data-testid="approval-department-section"
              key={group.key}
            >
              <div className="flex items-center justify-between gap-3 border-b bg-[#edf4fb] px-4 py-3">
                <h3 className="font-semibold text-[#173f6b]">{group.label}</h3>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600">
                  {group.candidates.length} account{group.candidates.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="hidden grid-cols-[minmax(0,1fr)_11rem_8rem_9rem] gap-3 border-b bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 md:grid">
                <span>Account</span>
                <span>Department</span>
                <span className="text-center">Head</span>
                <span className="text-center">Co-Approver</span>
              </div>
              <div className="divide-y">
                {group.candidates.map((candidate) => (
                  <CandidateRoleRow
                    key={candidate.id}
                    candidate={candidate}
                    candidates={candidates}
                    departmentKeys={departmentKeys}
                    team={team}
                    onSelectHead={selectHead}
                    onSelectCoApprover={selectCoApprover}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ValidationItem
            valid={Boolean(team.headUserId)}
            text={team.headUserId ? '1 Approver Head selected.' : 'Select 1 Approver Head.'}
          />
          <ValidationItem
            valid={team.coApproverUserIds.length >= 2 && team.coApproverUserIds.length <= 3}
            text={`${team.coApproverUserIds.length} of 2–3 Co-Approvers selected.`}
          />
        </div>
        {error && <p className="mt-3 error">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !valid} onClick={onSave}>
            {busy ? <Spinner label="Saving" /> : 'Save approval team'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CandidateRoleRow({
  candidate,
  candidates,
  departmentKeys,
  team,
  onSelectHead,
  onSelectCoApprover,
}: {
  candidate: Candidate;
  candidates: Candidate[];
  departmentKeys: Set<string>;
  team: ApprovalTeam;
  onSelectHead: (candidateId: string, checked: boolean) => void;
  onSelectCoApprover: (candidate: Candidate, checked: boolean) => void;
}) {
  const isHead = team.headUserId === candidate.id;
  const isCoApprover = team.coApproverUserIds.includes(candidate.id);
  const department = normalized(candidate.department);
  const coEligible =
    candidate.roles.includes('department_approver') && departmentKeys.has(department);
  const replacesDepartment =
    !isCoApprover &&
    team.coApproverUserIds.some(
      (id) => normalized(candidates.find((item) => item.id === id)?.department) === department,
    );
  const coDisabled =
    !coEligible || (!isCoApprover && !replacesDepartment && team.coApproverUserIds.length >= 3);
  return (
    <article className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_11rem_8rem_9rem] md:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{candidate.displayName}</p>
          <StatusBadge>{roleLabel(candidate.roles)}</StatusBadge>
          {candidate.protected && <StatusBadge>Protected</StatusBadge>}
        </div>
        {!coEligible && (
          <p className="mt-1 text-xs text-slate-500">
            Eligible as Head only. A Co-Approver needs an active Department Approver role and
            configured department.
          </p>
        )}
      </div>
      <p className="text-sm text-slate-600">{departmentLabel(candidate.department)}</p>
      <label
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold md:justify-center ${isHead ? 'border-blue-400 bg-blue-50 text-blue-900' : 'cursor-pointer bg-white'}`}
      >
        <input
          type="checkbox"
          checked={isHead}
          onChange={(event) => onSelectHead(candidate.id, event.target.checked)}
        />
        Head
      </label>
      <label
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold md:justify-center ${isCoApprover ? 'border-violet-400 bg-violet-50 text-violet-900' : coDisabled ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'cursor-pointer bg-white'}`}
        title={
          replacesDepartment ? 'Replaces the current Co-Approver for this department.' : undefined
        }
      >
        <input
          type="checkbox"
          checked={isCoApprover}
          disabled={coDisabled}
          onChange={(event) => onSelectCoApprover(candidate, event.target.checked)}
        />
        Co-Approver
      </label>
    </article>
  );
}

function ValidationItem({ valid, text }: { valid: boolean; text: string }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${valid ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
    >
      <span className="font-black" aria-hidden="true">
        {valid ? '✓' : '!'}
      </span>
      <span>{text}</span>
    </div>
  );
}
