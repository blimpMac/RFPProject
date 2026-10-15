import { describe,expect,it } from 'vitest';
import { calculateDashboardStats } from '../src/features/dashboard/stats';

describe('dashboard calculations',()=>{
  it('separates completed, returned, and in-progress requests',()=>{
    const result=calculateDashboardStats([
      {final_status:'Pending Finance Review',submitted_at:'2026-10-01T00:00:00Z',department_approval_at:null,finance_review_at:null},
      {final_status:'Paid',submitted_at:'2026-10-01T00:00:00Z',department_approval_at:'2026-10-01T08:00:00Z',finance_review_at:null},
      {final_status:'Returned to Department Approver',submitted_at:'2026-10-02T00:00:00Z',department_approval_at:'2026-10-02T04:00:00Z',finance_review_at:null},
    ]);
    expect(result).toMatchObject({total:3,approved:1,rejected:1,pending:1,avg:6});
  });
});
