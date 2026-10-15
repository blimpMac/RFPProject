import { describe,expect,it } from 'vitest';
import { accessRole,canAccessDepartment,isDepartmentOnly,normalizeDepartment } from '../server/lib/staff-access';

describe('staff access levels',()=>{
  it('maps the two account choices to separate application roles',()=>{
    expect(accessRole('staff')).toBe('finance_reviewer');
    expect(accessRole('approver')).toBe('department_approver');
  });

  it('limits approver-only accounts to their assigned department',()=>{
    expect(isDepartmentOnly(['department_approver'])).toBe(true);
    expect(canAccessDepartment('– Finance','Finance')).toBe(true);
    expect(canAccessDepartment('Finance','IT')).toBe(false);
    expect(canAccessDepartment(null,'Finance')).toBe(false);
    expect(normalizeDepartment(' — Operations ')).toBe('operations');
  });

  it('does not department-limit finance staff or administrators',()=>{
    expect(isDepartmentOnly(['finance_reviewer'])).toBe(false);
    expect(isDepartmentOnly(['administrator','department_approver'])).toBe(false);
  });
});
