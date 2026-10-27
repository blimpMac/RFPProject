from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f'Expected text not found in {path}: {old[:80]}')
    file.write_text(text.replace(old, new, 1))


# Access policy: only the backup inbox is Super Admin; Finance Members are the operational staff.
Path('server/domain/access.ts').write_text("""export const administrativeRoles: string[] = ['super_administrator'];
export const financeRoles: string[] = ['super_administrator', 'finance_reviewer'];
export const departmentDecisionRoles: string[] = ['super_administrator', 'department_approver'];

const legacyProtectedStaffEmails = new Set(['gpigemcorqbbackup@gmail.com']);

export function isLegacyProtectedStaffEmail(email: string | null | undefined) {
  return legacyProtectedStaffEmails.has(email?.toLowerCase() || '');
}

export function protectedAccountLabel(email: string | undefined) {
  return email ? 'Signed-in staff inbox' : 'Staff inbox';
}
""")

replace(
    'src/types/index.ts',
    "export type Role =\n  'super_administrator' | 'administrator' | 'department_approver' | 'finance_reviewer';",
    "export type Role = 'super_administrator' | 'department_approver' | 'finance_reviewer';",
)

# Navigation and profile self-service.
replace(
    'src/layouts/AdminLayout.tsx',
    "import { ThemeToggle } from '../components/ThemeToggle';\nimport type { Role } from '../types';",
    "import { ThemeToggle } from '../components/ThemeToggle';\nimport { EditNameModal } from '../features/profile/EditNameModal';\nimport type { Role } from '../types';",
)
replace(
    'src/layouts/AdminLayout.tsx',
    "allowedRoles: ['super_administrator', 'administrator', 'finance_reviewer'],",
    "allowedRoles: ['super_administrator', 'finance_reviewer'],",
)
replace(
    'src/layouts/AdminLayout.tsx',
    "allowedRoles: ['super_administrator', 'administrator', 'finance_reviewer'],",
    "allowedRoles: ['super_administrator', 'finance_reviewer'],",
)
replace(
    'src/layouts/AdminLayout.tsx',
    "  administrator: 'Administrator',\n",
    '',
)
replace(
    'src/layouts/AdminLayout.tsx',
    "  const { session, roles, identity, loading } = useAuth();",
    "  const { session, roles, identity, loading, refresh } = useAuth();",
)
replace(
    'src/layouts/AdminLayout.tsx',
    "  const [navigationSearch, setNavigationSearch] = useState('');",
    "  const [navigationSearch, setNavigationSearch] = useState('');\n  const [editingName, setEditingName] = useState(false);",
)
replace(
    'src/layouts/AdminLayout.tsx',
    "            <button\n              type=\"button\"\n              className={`admin-sidebar-link mt-2 w-full ${collapsed ? 'justify-center' : ''}`}\n              onClick={() => supabase.auth.signOut()}\n              title={collapsed ? 'Sign out' : undefined}\n            >",
    "            <button\n              type=\"button\"\n              className={`admin-sidebar-link mt-2 w-full ${collapsed ? 'justify-center' : ''}`}\n              onClick={() => setEditingName(true)}\n              title={collapsed ? 'Edit my name' : undefined}\n            >\n              <span className=\"admin-nav-icon\" aria-hidden=\"true\">✎</span>\n              {!collapsed && <strong>Edit my name</strong>}\n            </button>\n            <button\n              type=\"button\"\n              className={`admin-sidebar-link mt-2 w-full ${collapsed ? 'justify-center' : ''}`}\n              onClick={() => supabase.auth.signOut()}\n              title={collapsed ? 'Sign out' : undefined}\n            >",
)
replace(
    'src/layouts/AdminLayout.tsx',
    "        </div>\n      </div>\n    </>\n  );",
    "        </div>\n      </div>\n      {editingName && identity && (\n        <EditNameModal\n          currentName={identity.fullName}\n          onClose={() => setEditingName(false)}\n          onSaved={refresh}\n        />\n      )}\n    </>\n  );",
)

# Account Management no longer exposes an Administrator category.
replace(
    'src/pages/SettingsPage.tsx',
    "type AccessFilter = 'all' | 'administrator' | 'approver' | 'staff';",
    "type AccessFilter = 'all' | 'approver' | 'staff';",
)
replace(
    'src/pages/SettingsPage.tsx',
    "          (accessFilter === 'administrator' &&\n            user.roles.some((role) => ['super_administrator', 'administrator'].includes(role))) ||\n",
    '',
)
replace(
    'src/pages/SettingsPage.tsx',
    '              <option value="administrator">Administrators</option>\n',
    '',
)

replace(
    'src/features/accounts/AccountManagementForms.tsx',
    "  const isAdministrator = user.roles.some((role) =>\n    ['super_administrator', 'administrator'].includes(role),\n  );",
    "  const isSuperAdministrator = user.roles.includes('super_administrator');",
)
replace(
    'src/features/accounts/AccountManagementForms.tsx',
    "  const accessLabel = user.roles.includes('super_administrator')\n    ? 'Finance Head (Super Admin)'\n    : user.roles.includes('administrator')\n      ? 'Administrator'\n      : user.accessLevel === 'approver'\n        ? 'Department Head'\n        : 'Finance Member';",
    "  const accessLabel = user.roles.includes('super_administrator')\n    ? 'Finance Head (Super Admin)'\n    : user.accessLevel === 'approver'\n      ? 'Department Head'\n      : 'Finance Member';",
)
replace(
    'src/features/accounts/AccountManagementForms.tsx',
    '!isAdministrator && !user.protected && user.accessLevel',
    '!isSuperAdministrator && !user.protected && user.accessLevel',
)
replace(
    'src/features/accounts/AccountManagementForms.tsx',
    '!isAdministrator && !user.protected && user.accessLevel',
    '!isSuperAdministrator && !user.protected && user.accessLevel',
)

# Super Admin protection is the only administrative exception.
replace(
    'server/routes/administration/accounts.ts',
    "      targetRoles.data?.some((row) => ['super_administrator', 'administrator'].includes(row.role))\n",
    "      targetRoles.data?.some((row) => row.role === 'super_administrator')\n",
)
replace(
    'server/routes/administration/accounts.ts',
    "      existing.data?.some((row) => ['super_administrator', 'administrator'].includes(row.role))\n",
    "      existing.data?.some((row) => row.role === 'super_administrator')\n",
)
replace(
    'server/routes/administration/accounts.ts',
    "          'Administrative accounts cannot be converted or transferred here.',",
    "          'The Super Administrator account cannot be converted or transferred here.',",
)

# Finance Members can monitor Finance operational data; administrative settings remain Super Admin only.
replace(
    'server/routes/staff/monitoring.ts',
    "import { administrativeRoles } from '../../domain/access.js';",
    "import { administrativeRoles, financeRoles } from '../../domain/access.js';",
)
replace(
    'server/routes/staff/monitoring.ts',
    "    roles: [...administrativeRoles, 'finance_reviewer'],",
    "    roles: financeRoles,",
)
replace(
    'server/routes/staff/monitoring.ts',
    "    await requireStaff(event, [...administrativeRoles, 'finance_reviewer']);",
    "    await requireStaff(event, financeRoles);",
)
replace(
    'server/routes/staff/monitoring.ts',
    "    await requireStaff(event, [...administrativeRoles, 'finance_reviewer']);",
    "    await requireStaff(event, financeRoles);",
)

# Architecture documentation should match the live role model.
with Path('docs/ARCHITECTURE.md').open('a') as file:
    file.write("\n## Active access model\n\n- `gpigemcorqbbackup@gmail.com` is the sole Super Administrator / Finance Head identity.\n- Finance Members use `finance_reviewer` and can monitor and operate Finance workflow stages.\n- Department Heads use `department_approver`.\n- The legacy `administrator` role is not part of the application access model and must not be granted.\n- Every signed-in staff user can edit their own display name without changing roles, email, or department.\n")
