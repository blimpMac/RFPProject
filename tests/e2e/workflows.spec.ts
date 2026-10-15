import { expect,test } from '@playwright/test';

const publicConfig={ok:true,options:{departments:['Finance'],requestTypes:['Supplier Payment']},approvers:[{department:'Finance',approver_name:'Finance Head'}],limits:{maxFiles:10,maxSizeMb:10}};

test('requestor can complete the public submission workflow',async({page})=>{
  let submitted:Record<string,unknown>|undefined;
  await page.route('**/api/public-config',route=>route.fulfill({json:publicConfig}));
  await page.route('**/api/submissions/start',async route=>{submitted=(await route.request().postDataJSON()).request;await route.fulfill({json:{requestId:'request-1',rfpNumber:'RFP-0042',trackingToken:'private-track-token',uploads:[]}})});
  await page.route('**/api/submissions/finalize',route=>route.fulfill({json:{rfpNumber:'RFP-0042'}}));
  await page.goto('/');
  await expect(page.getByAltText('GREENLIGHT POWER')).toBeVisible();
  await expect(page.getByAltText(/GEMCOR/)).toBeVisible();
  await expect(page.getByRole('link',{name:'View RFPProject repository on GitHub'})).toHaveAttribute('href','https://github.com/blimpMac/RFPProject');
  await page.getByLabel('Requestor Name').fill('Test Requestor');
  await page.getByLabel('Requestor Email').fill('requestor@example.com');
  await page.getByLabel('Department').selectOption('Finance');
  await page.getByLabel('Project / Class').fill('Operations');
  await page.getByLabel('RFP Type').selectOption('Supplier Payment');
  await page.getByLabel('Supplier / Payee').fill('Example Supplier');
  await page.getByLabel('Amount (PHP)').fill('1250.50');
  await page.getByLabel('Required Payment Date').fill('2026-10-30');
  await page.getByLabel('Purpose / Description').fill('Workflow smoke test payment.');
  await expect(page.getByLabel('Approving Head')).toHaveValue('Finance Head');
  await page.getByRole('button',{name:'Submit request'}).click();
  await expect(page.getByRole('heading',{name:'Request submitted'})).toBeVisible();
  await expect(page.getByText('RFP-0042')).toBeVisible();
  await expect(page.getByRole('link',{name:'View live status'})).toHaveAttribute('href','/track/private-track-token');
  expect(submitted).toMatchObject({requestorName:'Test Requestor',department:'Finance',approvingHead:'Finance Head',amount:1250.5});
});

test('approver can approve and reject with required remarks',async({page})=>{
  const decisions:string[]=[];
  await page.route('**/api/review/**',async route=>{
    if(route.request().method()==='POST'){
      decisions.push((await route.request().postDataJSON()).decision);
      await route.fulfill({json:{ok:true}});
      return;
    }
    await route.fulfill({json:{request:{id:'request-1',rfp_number:'RFP-0042',requestor_name:'Test Requestor',requestor_email:'requestor@example.com',department:'Finance',project_class:'Operations',rfp_type:'Supplier Payment',supplier_payee:'Example Supplier',purpose_description:'Workflow test',amount:1250.5,required_payment_date:'2026-10-30',final_status:'Pending Department Approval'},attachments:[]}});
  });
  await page.goto('/review/approve-token');
  await page.getByRole('button',{name:'Approve'}).click();
  await expect(page.getByRole('heading',{name:'Decision recorded'})).toBeVisible();
  await page.goto('/review/reject-token');
  await page.getByRole('button',{name:'Reject'}).click();
  await expect(page.getByText('Rejection remarks are required.')).toBeVisible();
  await page.getByRole('textbox').fill('Please attach the signed invoice.');
  await page.getByRole('button',{name:'Reject'}).click();
  await expect(page.getByRole('heading',{name:'Decision recorded'})).toBeVisible();
  expect(decisions).toEqual(['approve','reject']);
});

test('requestor can correct and resubmit a returned request',async({page})=>{
  let correctionNote='';
  const tracking={request:{id:'request-1',rfp_number:'RFP-0042',submitted_at:'2026-10-15T08:00:00+08:00',requestor_name:'Test Requestor',department:'Finance',amount:1250.5,required_payment_date:'2026-10-30',department_approval:'Returned',finance_review:'Pending',final_status:'Returned to Requestor',last_action:'Returned',planned_check_date:null},logs:[{occurred_at:'2026-10-15T09:00:00+08:00',action:'Returned to Requestor',remarks:'Attach invoice',new_status:'Returned to Requestor'}],attachments:[]};
  await page.route('**/api/track/**',route=>route.fulfill({json:tracking}));
  await page.route('**/api/submissions/resubmit',async route=>{correctionNote=(await route.request().postDataJSON()).correctionNote;await route.fulfill({json:{ok:true}})});
  await page.goto('/track/private-track-token');
  await page.getByLabel('Correction note').fill('Added the signed invoice.');
  await page.getByRole('button',{name:'Resubmit for approval'}).click();
  await expect(page.getByText(/resubmitted with the same number/i)).toBeVisible();
  expect(correctionNote).toBe('Added the signed invoice.');
});

test('dark mode is readable and persists across staff navigation',async({page})=>{
  await page.route('**/api/public-config',route=>route.fulfill({json:publicConfig}));
  await page.goto('/');
  const lightHeader=await page.locator('header').evaluate((node)=>getComputedStyle(node).backgroundColor);
  await page.getByRole('button',{name:'Switch to dark mode'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await expect.poll(()=>page.locator('header').evaluate((node)=>getComputedStyle(node).backgroundColor)).not.toBe(lightHeader);
  await page.getByRole('link',{name:'Staff Login'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await expect(page.getByRole('heading',{name:'Sign in to your account'})).toBeVisible();
  await expect(page.getByLabel('Work email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
});

test('browser tab uses the dedicated Greenlight favicon',async({page})=>{
  await page.route('**/api/public-config',route=>route.fulfill({json:publicConfig}));
  await page.goto('/');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href','/favicon.svg');
  const response=await page.request.get('/favicon.svg');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('image/svg+xml');
});
