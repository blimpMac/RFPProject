export type ApprovingHeadCandidate = {
  id: string;
  displayName: string;
  department: string | null;
  roles: string[];
  protected: boolean;
};

export type DepartmentApprovalRoster = {
  department: string;
  headUserIds: string[];
};

export type ApprovingHeadOverview = {
  candidates: ApprovingHeadCandidate[];
  departments: DepartmentApprovalRoster[];
};

export type ApprovalTeam = {
  headUserId: string;
  coApproverUserIds: string[];
};
