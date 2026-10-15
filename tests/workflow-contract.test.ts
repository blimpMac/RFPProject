import fs from 'node:fs';
import { describe,expect,it } from 'vitest';
import { financeSchema } from '../server/lib/validation';

const sql = ['202610150006_super_admin_and_process_flow.sql','202610150007_return_workflow_loops.sql'].map((file)=>fs.readFileSync(`supabase/migrations/${file}`,'utf8')).join('\n');
const api = fs.readFileSync('server/api.ts','utf8');

describe('seven-stage RFP workflow contract',()=>{
  it('keeps finance actions in their required sequence',()=>{
    for(const action of ['approve','reject','request_documents','payment_processing','check_preparation','awaiting_signatory','check_released','payment_released']){
      expect(()=>financeSchema.parse({requestId:'3f33d8ea-b2ac-4ca6-9fbf-4e2e9d0b95b0',action,remarks:''})).not.toThrow();
    }
    expect(sql).toContain("previous_status not in ('Processing','Payment Processing')");
    expect(sql).toContain("previous_status not in ('Check Approval','Awaiting Signatory')");
    expect(sql).toContain("previous_status not in ('Check Released','Payment Released')");
    expect(sql).toContain('resubmit_returned_request');
    expect(sql).toContain('department_rereview_action');
  });

  it('restricts account removal to the protected super administrator model',()=>{
    expect(sql).toContain("public.has_role('super_administrator')");
    expect(api).toContain("Only the Super Administrator can remove accounts.");
    for(const email of ['gpigemcorqbbackup@gmail.com','dricianfranciscordon@gmail.com','cerealman637@gmail.com']){
      expect(api).toContain(email);
    }
  });
});
