from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise RuntimeError(f'Could not locate expected text in {path}: {old[:120]!r}')
    file.write_text(text.replace(old, new))


replace(
    'src/types/index.ts',
    "export type Role =\n  'super_administrator' | 'administrator' | 'department_approver' | 'finance_reviewer';",
    "export type Role =\n  | 'super_administrator'\n  | 'administrator'\n  | 'finance_head'\n  | 'department_approver'\n  | 'finance_reviewer';",
)

replace(
    'shared/contracts/accounts.ts',
    "export type AccessLevel = 'staff' | 'approver';",
    "export type AccessLevel = 'staff' | 'finance_head' | 'approver';",
)

replace(
    'server/lib/staff-access.ts',
    "export type AccessLevel = 'staff' | 'approver';\n\nexport const accessRole = (level: AccessLevel) =>\n  level === 'approver' ? 'department_approver' : 'finance_reviewer';",
    "export type AccessLevel = 'staff' | 'finance_head' | 'approver';\n\nexport const accessRole = (level: AccessLevel) => {\n  if (level === 'approver') return 'department_approver';\n  if (level === 'finance_head') return 'finance_head';\n  return 'finance_reviewer';\n};",
)
replace(
    'server/lib/staff-access.ts',
    "['super_administrator', 'administrator', 'finance_reviewer'].includes(role)",
    "['super_administrator', 'administrator', 'finance_head', 'finance_reviewer'].includes(role)",
)

replace(
    'server/lib/staff-access.test.ts',
    "  assert.equal(accessRole('staff'), 'finance_reviewer');",
    "  assert.equal(accessRole('staff'), 'finance_reviewer');\n  assert.equal(accessRole('finance_head'), 'finance_head');",
)
replace(
    'server/lib/staff-access.test.ts',
    "  assert.equal(isDepartmentOnly(['finance_reviewer']), false);",
    "  assert.equal(isDepartmentOnly(['finance_reviewer']), false);\n  assert.equal(isDepartmentOnly(['department_approver', 'finance_head']), false);",
)

administration = Path('server/routes/administration.ts')
text = administration.read_text()
needle = """  z.object({
    email: z.email(),
    fullName: z.string().min(2).max(160),
    accessLevel: z.literal('approver'),
    department: z.string().min(1).max(100),
  }),
"""
insert = """  z.object({
    email: z.email(),
    fullName: z.string().min(2).max(160),
    accessLevel: z.literal('finance_head'),
    department: z.string().max(100).optional(),
  }),
""" + needle
if needle not in text:
    raise RuntimeError('Could not locate administration account schema.')
text = text.replace(needle, insert, 1)
text = text.replace(
    """          accessLevel: roles.includes('department_approver')
            ? 'approver'
            : roles.includes('finance_reviewer')
              ? 'staff'
              : null,""",
    """          accessLevel: roles.includes('finance_head')
            ? 'finance_head'
            : roles.includes('department_approver')
              ? 'approver'
              : roles.includes('finance_reviewer')
                ? 'staff'
                : null,""",
)
text = text.replace(
    "accessLevel: z.enum(['staff', 'approver']),",
    "accessLevel: z.enum(['staff', 'finance_head', 'approver']),",
)
administration.write_text(text)

settings = Path('src/pages/SettingsPage.tsx')
text = settings.read_text()
text = text.replace(
    "type AccessFilter = 'all' | 'administrator' | 'approver' | 'staff';",
    "type AccessFilter = 'all' | 'administrator' | 'finance_head' | 'approver' | 'staff';",
)
text = text.replace(
    """          (accessFilter === 'approver' && user.accessLevel === 'approver') ||
          (accessFilter === 'staff' && user.accessLevel === 'staff');""",
    """          (accessFilter === 'finance_head' && user.accessLevel === 'finance_head') ||
          (accessFilter === 'approver' && user.accessLevel === 'approver') ||
          (accessFilter === 'staff' && user.accessLevel === 'staff');""",
)
text = text.replace(
    """              <option value=\"administrator\">Administrators</option>
              <option value=\"approver\">Approvers</option>""",
    """              <option value=\"administrator\">Administrators</option>
              <option value=\"finance_head\">Finance Heads</option>
              <option value=\"approver\">Approvers</option>""",
)
text = text.replace(
    """    : user.roles.includes('administrator')
      ? 'Administrator'
      : user.accessLevel === 'approver'
        ? 'Department Approver'
        : 'Staff';""",
    """    : user.roles.includes('administrator')
      ? 'Administrator'
      : user.accessLevel === 'finance_head'
        ? 'Finance Head'
        : user.accessLevel === 'approver'
          ? 'Department Approver'
          : 'Staff';""",
)
text = text.replace(
    """            <option value=\"staff\">Staff</option>
            <option value=\"approver\">Department Approver</option>""",
    """            <option value=\"staff\">Finance Member</option>
            <option value=\"finance_head\">Finance Head</option>
            <option value=\"approver\">Department Approver</option>""",
)
settings.write_text(text)

admin_layout = Path('src/layouts/AdminLayout.tsx')
text = admin_layout.read_text()
text = text.replace(
    "allowedRoles: ['super_administrator', 'administrator', 'finance_reviewer'],",
    "allowedRoles: ['super_administrator', 'administrator', 'finance_head', 'finance_reviewer'],",
)
text = text.replace(
    "  administrator: 'Administrator',\n  department_approver: 'Department approver',",
    "  administrator: 'Administrator',\n  finance_head: 'Finance Head',\n  department_approver: 'Department approver',",
)
admin_layout.write_text(text)

approvals = Path('src/pages/ApprovalsPage.tsx')
text = approvals.read_text()
text = text.replace(
    "['super_administrator', 'administrator', 'finance_reviewer'].includes(role)",
    "['super_administrator', 'administrator', 'finance_head', 'finance_reviewer'].includes(role)",
)
text = text.replace(
    "const financeHead = roles.some((role) => ['super_administrator', 'administrator'].includes(role));",
    "const financeHead = roles.some((role) =>\n    ['super_administrator', 'administrator', 'finance_head'].includes(role),\n  );",
)
approvals.write_text(text)

print_page = Path('src/pages/DigitalRfpPrintPage.tsx')
text = print_page.read_text().replace(
    "['super_administrator', 'administrator', 'finance_reviewer'].includes(role)",
    "['super_administrator', 'administrator', 'finance_head', 'finance_reviewer'].includes(role)",
)
print_page.write_text(text)

staff = Path('server/routes/staff.ts')
text = staff.read_text().replace(
    "[...administrativeRoles, 'finance_reviewer']",
    "[...administrativeRoles, 'finance_head', 'finance_reviewer']",
)
staff.write_text(text)

workflow = Path('server/services/finance-stage-workflow.ts')
text = workflow.read_text()
text = text.replace(
    """function isFinanceHead(roles: string[]) {
  return roles.some((role) => administrativeRoles.includes(role));
}""",
    """function isFinanceHead(roles: string[]) {
  return roles.includes('finance_head') || roles.some((role) => administrativeRoles.includes(role));
}""",
)
text = text.replace(
    "const heads = await emailsForRoles(db, administrativeRoles);",
    "const heads = await emailsForRoles(db, ['finance_head', ...administrativeRoles]);",
)
workflow.write_text(text)

migration = Path('supabase/migrations/202610260020_finance_head_role.sql')
migration.write_text("alter type public.app_role add value if not exists 'finance_head';\n")

print('Finance Head role patch applied.')
