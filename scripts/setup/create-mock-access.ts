import { randomBytes } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';
import process from 'node:process';
import { createClient,type User } from '@supabase/supabase-js';

const url=process.env.SUPABASE_URL;
const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required.');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const protectedEmail='gpigemcorqbbackup@gmail.com';
const mailbox='gpigemcorqbbackup';
const domain='gmail.com';

const settings=await db.from('system_settings').select('value').eq('key','submission_options').single();
if(settings.error)throw settings.error;
const configured=(settings.data.value as {departments?:unknown}).departments;
if(!Array.isArray(configured)||!configured.every((value)=>typeof value==='string'))throw new Error('No valid department list was found.');
const findDepartment=(name:string)=>configured.find((department)=>department.toLowerCase()===name.toLowerCase());
const required=['Sales','Operations','Engineering','IT','HR','Admin','Finance','Other'];
if(required.some((name)=>!findDepartment(name)))throw new Error('The mock setup expects the standard eight departments.');

const listed=await db.auth.admin.listUsers({page:1,perPage:1000});
if(listed.error)throw listed.error;
const usersByEmail=new Map(listed.data.users.map((user)=>[user.email?.toLowerCase(),user]));
const protectedUser=usersByEmail.get(protectedEmail);
if(!protectedUser)throw new Error('The protected administrator account was not found.');
const protectedProfile=await db.from('profiles').select('full_name').eq('id',protectedUser.id).single();
if(protectedProfile.error)throw protectedProfile.error;
if(!protectedProfile.data.full_name){const named=await db.from('profiles').update({full_name:'Backup Administrator'}).eq('id',protectedUser.id);if(named.error)throw named.error}

const mockDefinitions=[
  {email:`${mailbox}+mock-head-1@${domain}`,fullName:'Operations Approver (Mock)',departments:[findDepartment('Sales')!,findDepartment('Operations')!]},
  {email:`${mailbox}+mock-head-2@${domain}`,fullName:'Technical Approver (Mock)',departments:[findDepartment('Engineering')!,findDepartment('IT')!]},
  {email:`${mailbox}+mock-head-3@${domain}`,fullName:'Corporate Approver (Mock)',departments:[findDepartment('HR')!,findDepartment('Admin')!]},
];
const credentials:Array<{email:string;temporaryPassword:string;fullName:string;departments:string[];accessLevel:'approver'}>=[];
const mockUsers:User[]=[];

for(const definition of mockDefinitions){
  const temporaryPassword=`Rfp!${randomBytes(18).toString('base64url')}`;
  let user:User|undefined=usersByEmail.get(definition.email);
  if(user){
    const updated=await db.auth.admin.updateUserById(user.id,{password:temporaryPassword,email_confirm:true,user_metadata:{full_name:definition.fullName,departments:definition.departments,access_level:'approver'}});
    if(updated.error)throw updated.error;
    user=updated.data.user;
  }else{
    const created=await db.auth.admin.createUser({email:definition.email,password:temporaryPassword,email_confirm:true,user_metadata:{full_name:definition.fullName,departments:definition.departments,access_level:'approver'}});
    if(created.error)throw created.error;
    user=created.data.user;
  }
  const profile=await db.from('profiles').upsert({id:user.id,email:definition.email,full_name:definition.fullName,department:definition.departments.join(' / '),active:true},{onConflict:'id'});
  if(profile.error)throw profile.error;
  const cleared=await db.from('user_roles').delete().eq('user_id',user.id);
  if(cleared.error)throw cleared.error;
  const role=await db.from('user_roles').insert({user_id:user.id,role:'department_approver',granted_by:protectedUser.id});
  if(role.error)throw role.error;
  mockUsers.push(user);
  credentials.push({email:definition.email,temporaryPassword,fullName:definition.fullName,departments:definition.departments,accessLevel:'approver'});
}

const assignments=[
  {userId:protectedUser.id,departments:[findDepartment('Finance')!,findDepartment('Other')!]},
  ...mockUsers.map((user,index)=>({userId:user.id,departments:mockDefinitions[index].departments})),
];
const assigned=await db.rpc('set_approving_head_assignments',{p_assignments:assignments,p_actor_user_id:protectedUser.id});
if(assigned.error)throw assigned.error;

await mkdir('test-assets',{recursive:true});
await writeFile('test-assets/mock-access-accounts.json',`${JSON.stringify({generatedAt:new Date().toISOString(),loginUrl:`${process.env.SITE_URL||process.env.VITE_SITE_URL}/admin/login`,accounts:credentials},null,2)}\n`,{encoding:'utf8',mode:0o600});
console.log('Configured 4 private approving heads: 1 protected administrator and 3 mock accounts.');
console.log('Each head covers 2 departments; every department has an approving head.');
console.log('Mock credentials were written to the ignored local file test-assets/mock-access-accounts.json.');
