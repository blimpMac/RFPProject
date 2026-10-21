import { readFile,mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

type AccessFile={accounts:Array<{email:string;temporaryPassword:string}>};
const access=JSON.parse(await readFile('test-assets/mock-access-accounts.json','utf8')) as AccessFile;
const account=access.accounts[0];
if(!account)throw new Error('No mock approver account is available.');
const expectedRfpNumber=process.env.EXPECTED_RFP_NUMBER;

await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  await page.addInitScript(()=>localStorage.setItem('rfp-theme','light'));
  await page.goto('https://greenlight-rfp.vercel.app/admin/login',{waitUntil:'networkidle'});
  await page.getByLabel('Work email').fill(account.email);
  await page.getByLabel('Password').fill(account.temporaryPassword);
  await page.getByRole('button',{name:'Sign in securely'}).click();
  await page.waitForURL(/\/admin\/?$/,{timeout:20_000});
  await page.goto('https://greenlight-rfp.vercel.app/admin/approvals',{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'Approvals'}).waitFor();
  await page.getByText('Live · refreshes every 15 seconds').waitFor();
  if(expectedRfpNumber)await page.getByText(expectedRfpNumber,{exact:true}).waitFor();
  const colors=await page.evaluate(`(()=>{
    const sidebar=document.querySelector('.admin-sidebar');
    const active=document.querySelector('.admin-sidebar-link-active');
    const topbar=document.querySelector('.admin-topbar');
    if(!sidebar||!active||!topbar)throw new Error('Admin theme elements were not found.');
    return{
      sidebarBackground:getComputedStyle(sidebar).backgroundColor,
      activeText:getComputedStyle(active).color,
      activeBackground:getComputedStyle(active).backgroundColor,
      topbarText:getComputedStyle(topbar).color,
      theme:document.documentElement.dataset.theme,
    };
  })()`);
  await page.screenshot({path:'artifacts/admin-approvals-light.png',fullPage:true});
  console.log(JSON.stringify({ok:true,path:'/admin/approvals',autoRefresh:true,expectedRequestVisible:Boolean(expectedRfpNumber),colors,screenshot:'artifacts/admin-approvals-light.png'},null,2));
}finally{await browser.close()}
