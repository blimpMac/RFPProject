export type AccessLevel = 'staff' | 'finance_head' | 'approver';

export type StaffUser = {
  id: string;
  email: string;
  roles: string[];
  createdAt: string;
  lastSignInAt: string | null;
  protected: boolean;
  fullName: string | null;
  department: string | null;
  assignedDepartments: string[];
  active: boolean;
  accessLevel: AccessLevel | null;
};

export type SystemSetting = {
  key: string;
  value: Record<string, unknown>;
};

export type StaffUsersResponse = {
  ok: true;
  users: StaffUser[];
  canRemove: boolean;
};

export type SettingsResponse = {
  ok: true;
  settings: SystemSetting[];
};
