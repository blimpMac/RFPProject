import { randomBytes } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';
import process from 'node:process';
import { createClient,type User } from '@supabase/supabase-js';

const url=process.env.SUPABASE_URL;
const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required.');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const baseMailbox='gpigemcorqbbackup';
const domain='gmail.com';
const perDepartment=3;

const settings=await db.from('system_settings').select('value').eq('key','submission_options').single();
if(settings.error)throw settings.error;
const departments=(settings.data.value as {departments?:unknown}).departments;
if(!Array.isArray(departments)||!departments.every((value)=>typeof value==='string'))throw new Error('No valid department list was found.');

const listed=await db.auth.admin.listUsers({page:1,perPage:1000});
if(listed.error)throw listed.error;
const usersByEmail=new Map(listed.data.users.map((user)=>[user.email?.toLowerCase(),user]));
const credentials:Array<{email:string;temporaryPassword:string;fullName:string;department:string;accessLevel:'approver'}>=[];

for(const department of departments){
  const slug=department.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  for(let index=1;index<=perDepartment;index+=1){
    const email=`${baseMailbox}+${slug}-approver-${index}@${domain}`;
    const fullName=`${department} Approver ${index} (Mock)`;
    const temporaryPassword=`Rfp!${randomBytes(18).toString('base64url')}`;
    let user:User|undefined=usersByEmail.get(email);
    if(user){
      const updated=await db.auth.admin.updateUserById(user.id,{password:temporaryPassword,email_confirm:true,user_metadata:{full_name:fullName,department,access_level:'approver'}});
      if(updated.error)throw updated.error;
      user=updated.data.user;
    }else{
      const created=await db.auth.admin.createUser({email,password:temporaryPassword,email_confirm:true,user_metadata:{full_name:fullName,department,access_level:'approver'}});
      if(created.error)throw created.error;
      user=created.data.user;
      usersByEmail.set(email,user);
    }
    const profile=await db.from('profiles').upsert({id:user.id,email,full_name:fullName,department,active:true},{onConflict:'id'});
    if(profile.error)throw profile.error;
    const cleared=await db.from('user_roles').delete().eq('user_id',user.id);
    if(cleared.error)throw cleared.error;
    const role=await db.from('user_roles').insert({user_id:user.id,role:'department_approver'});
    if(role.error)throw role.error;
    credentials.push({email,temporaryPassword,fullName,department,accessLevel:'approver'});
  }
}

await mkdir('test-assets',{recursive:true});
await writeFile('test-assets/mock-access-accounts.json',`${JSON.stringify({generatedAt:new Date().toISOString(),loginUrl:`${process.env.SITE_URL||process.env.VITE_SITE_URL}/admin/login`,requestor:{email:'dricianfranciscordon@gmail.com',loginRequired:false,entryPoint:process.env.SITE_URL||process.env.VITE_SITE_URL},accounts:credentials},null,2)}\n`,{encoding:'utf8',mode:0o600});
console.log(`Created or rotated ${credentials.length} active department approver accounts across ${departments.length} departments.`);
console.log('Credentials were written to the ignored local file test-assets/mock-access-accounts.json.');
