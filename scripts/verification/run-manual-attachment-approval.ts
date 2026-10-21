import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const siteUrl='https://greenlight-rfp.vercel.app';
const supabaseUrl=process.env.SUPABASE_URL;
const serviceKey=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!supabaseUrl||!serviceKey)throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required.');

const db=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const label='temporary-manual-attachment-approval';
const requestorEmail='gpigemcorqbbackup@gmail.com';
const approverEmail='dricianfranciscordon@gmail.com';
const department='Finance';
const pdfAttachmentName='TEMPORARY-RFP-APPROVAL-ATTACHMENT.pdf';
const imageAttachmentName='TEMPORARY-RFP-APPROVAL-IMAGE.png';

type Assignment={userId:string;departments:string[]};
type StartResult={requestId:string;rfpNumber:string;trackingToken:string;uploads:{id:string;name:string;path:string;token:string}[]};

function normalized(value:string){return value.replace(/^[-–—\s]+/,'').trim().toLowerCase()}

function assignmentsFrom(rows:{department:string;user_id:string;position:number}[]):Assignment[]{
  const order:string[]=[];
  const departmentsByUser=new Map<string,string[]>();
  for(const row of rows){
    if(!order.includes(row.user_id))order.push(row.user_id);
    const departments=departmentsByUser.get(row.user_id)||[];
    if(!departments.some((item)=>normalized(item)===normalized(row.department)))departments.push(row.department);
    departmentsByUser.set(row.user_id,departments);
  }
  return order.map((userId)=>({userId,departments:departmentsByUser.get(userId)||[]}));
}

function createPdf():Buffer{
  const stream=[
    'BT','/F1 18 Tf','72 720 Td','(Temporary RFP Approval Attachment) Tj',
    '0 -32 Td','/F1 11 Tf','(Requestor: gpigemcor backup account) Tj',
    '0 -20 Td','(Approver: Drician super administrator account) Tj',
    '0 -20 Td','(Purpose: live attachment and manual approval verification) Tj','ET',
  ].join('\n');
  const objects=[
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];
  let pdf='%PDF-1.4\n';
  const offsets=[0];
  for(const object of objects){offsets.push(Buffer.byteLength(pdf));pdf+=object}
  const xrefOffset=Buffer.byteLength(pdf);
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  pdf+=offsets.slice(1).map((offset)=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('');
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf);
}

async function post<T>(path:string,body:unknown):Promise<T>{
  const response=await fetch(`${siteUrl}/api/${path}`,{
    method:'POST',headers:{'content-type':'application/json',origin:siteUrl},body:JSON.stringify(body),
  });
  const result=await response.json() as T&{ok?:boolean;error?:string};
  if(!response.ok||result.ok===false)throw new Error(result.error||`Production API returned ${response.status}.`);
  return result;
}

const previous=await db.from('temporary_test_runs').select('request_id').eq('label',label).maybeSingle();
if(previous.error)throw previous.error;
if(previous.data){
  const expired=await db.from('temporary_test_runs').update({expires_at:new Date(Date.now()-1000).toISOString()}).eq('request_id',previous.data.request_id);
  if(expired.error)throw expired.error;
  const purged=await db.rpc('purge_expired_temporary_tests');
  if(purged.error)throw purged.error;
}

const [profilesResult,headsResult]=await Promise.all([
  db.from('profiles').select('id,email,active').in('email',[requestorEmail,approverEmail]),
  db.from('department_approving_heads').select('department,user_id,position').order('position'),
]);
if(profilesResult.error)throw profilesResult.error;
if(headsResult.error)throw headsResult.error;
const requestor=(profilesResult.data||[]).find((profile)=>profile.email.toLowerCase()===requestorEmail);
const approver=(profilesResult.data||[]).find((profile)=>profile.email.toLowerCase()===approverEmail);
if(!requestor?.active||!approver?.active)throw new Error('The requestor and approver accounts must both be active.');

const originalAssignments=assignmentsFrom(headsResult.data||[]);
if(originalAssignments.length<3||originalAssignments.length>4)throw new Error('The current approving-head roster is outside the supported 3–4 account range.');
const testAssignments=originalAssignments.map((assignment)=>({...assignment,departments:[...assignment.departments]}));
const approverAssignment=testAssignments.find((assignment)=>assignment.userId===approver.id);
if(approverAssignment){
  if(!approverAssignment.departments.some((item)=>normalized(item)===normalized(department))){
    const financeAssignment=testAssignments.find((assignment)=>assignment.departments.some((item)=>normalized(item)===normalized(department)));
    if(!financeAssignment)throw new Error('No Finance approving-head slot is configured.');
    const previousDepartments=approverAssignment.departments;
    approverAssignment.departments=financeAssignment.departments;
    financeAssignment.departments=previousDepartments;
  }
}else{
  const financeAssignment=testAssignments.find((assignment)=>assignment.userId===requestor.id&&assignment.departments.some((item)=>normalized(item)===normalized(department)))
    ||testAssignments.find((assignment)=>assignment.departments.some((item)=>normalized(item)===normalized(department)));
  if(!financeAssignment)throw new Error('No Finance approving-head slot is configured.');
  financeAssignment.userId=approver.id;
}

const rosterChanged=JSON.stringify(testAssignments)!==JSON.stringify(originalAssignments);
if(rosterChanged){
  const assigned=await db.rpc('set_approving_head_assignments',{p_assignments:testAssignments,p_actor_user_id:approver.id});
  if(assigned.error)throw assigned.error;
}

let result:Record<string,unknown>|undefined;
let workflowError:unknown;
let restoreError:Error|undefined;
try{
  const files=[
    {name:pdfAttachmentName,type:'application/pdf',content:createPdf()},
    {name:imageAttachmentName,type:'image/png',content:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')},
  ];
  const requiredPaymentDate=new Date(Date.now()+7*24*60*60_000).toISOString().slice(0,10);
  const started=await post<StartResult>('submissions/start',{
    request:{
      requestorName:'gpigemcor Backup Administrator',requestorEmail,department,
      projectClass:'Temporary attachment approval verification',rfpType:'Request for Payment',
      supplierPayee:'Temporary Attachment Test Payee',
      purposeDescription:'TEMPORARY TEST - verify attachment delivery and manual approval by the Super Administrator.',
      amount:1,requiredPaymentDate,approvingHead:'Assigned privately by department',
    },
    attachments:files.map((file)=>({name:file.name,type:file.type,size:file.content.byteLength})),
    idempotencyKey:randomUUID(),
  });

  const expiresAt=new Date(Date.now()+24*60*60_000).toISOString();
  const marked=await db.from('temporary_test_runs').insert({request_id:started.requestId,label,expires_at:expiresAt});
  if(marked.error)throw marked.error;
  for(const file of files){
    const upload=started.uploads.find((item)=>item.name===file.name);
    if(!upload)throw new Error(`The production API did not return the declared upload for ${file.name}.`);
    const uploaded=await db.storage.from('rfp-attachments').uploadToSignedUrl(upload.path,upload.token,file.content,{contentType:file.type});
    if(uploaded.error)throw uploaded.error;
    await post('submissions/attachment-complete',{requestId:started.requestId,trackingToken:started.trackingToken,attachmentId:upload.id});
  }

  const finalized=await post<{rfpNumber:string;status:string;delivery:{configured:boolean;sent:number;retrying:number;failed:number}}>('submissions/finalize',{
    requestId:started.requestId,trackingToken:started.trackingToken,
  });
  const [notifications,attachmentRecords]=await Promise.all([
    db.from('email_notifications').select('template_key,recipient_email,status,last_error').eq('request_id',started.requestId),
    db.from('request_attachments').select('original_filename,mime_type,status').eq('request_id',started.requestId).order('created_at'),
  ]);
  if(notifications.error)throw notifications.error;
  if(attachmentRecords.error)throw attachmentRecords.error;
  const rows=notifications.data||[];
  const approverNotice=rows.find((row)=>row.template_key==='supervisor_review'&&row.recipient_email.toLowerCase()===approverEmail);
  const requestorNotice=rows.find((row)=>row.template_key==='submission_received'&&row.recipient_email.toLowerCase()===requestorEmail);
  result={
    ok:approverNotice?.status==='sent'&&requestorNotice?.status==='sent'&&(attachmentRecords.data||[]).length===files.length&&(attachmentRecords.data||[]).every((attachment)=>attachment.status==='available'),
    liveUrl:siteUrl,rfpNumber:finalized.rfpNumber,status:finalized.status,
    attachments:(attachmentRecords.data||[]).map((attachment)=>({name:attachment.original_filename,type:attachment.mime_type,status:attachment.status})),
    approverNotification:{included:Boolean(approverNotice),status:approverNotice?.status||'missing'},
    requestorNotification:{included:Boolean(requestorNotice),status:requestorNotice?.status||'missing'},
    delivery:finalized.delivery,expiresAt,
    deliveryErrors:[...new Set(rows.map((row)=>row.last_error).filter((error):error is string=>Boolean(error)))],
  };
}catch(error){workflowError=error}
finally{
  if(rosterChanged){
    const restored=await db.rpc('set_approving_head_assignments',{p_assignments:originalAssignments,p_actor_user_id:approver.id});
    if(restored.error)restoreError=new Error(`The temporary roster could not be restored: ${restored.error.message}`);
  }
}

if(restoreError)throw restoreError;
if(workflowError)throw workflowError;
console.log(JSON.stringify(result,null,2));
