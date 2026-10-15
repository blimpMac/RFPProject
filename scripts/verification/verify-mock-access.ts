import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

type Credential={email:string;temporaryPassword:string;department:string};
const url=process.env.SUPABASE_URL;
const serviceKey=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY;
if(!url||!serviceKey||!publicKey)throw new Error('Supabase URL, secret key, and publishable key are required.');
const fixture=JSON.parse(await readFile('test-assets/mock-access-accounts.json','utf8')) as {accounts:Credential[]};
const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const listed=await admin.auth.admin.listUsers({page:1,perPage:1000});if(listed.error)throw listed.error;
const byEmail=new Map(listed.data.users.map((user)=>[user.email?.toLowerCase(),user]));
const ids=fixture.accounts.map((account)=>byEmail.get(account.email)?.id).filter((id):id is string=>Boolean(id));
if(ids.length!==fixture.accounts.length)throw new Error(`Only ${ids.length}/${fixture.accounts.length} mock Auth users exist.`);
const[{data:profiles,error:profileError},{data:roles,error:roleError}]=await Promise.all([admin.from('profiles').select('id,department,active').in('id',ids),admin.from('user_roles').select('user_id,role').in('user_id',ids)]);
if(profileError)throw profileError;if(roleError)throw roleError;
for(const account of fixture.accounts){const id=byEmail.get(account.email)?.id;const profile=profiles?.find((row)=>row.id===id);const role=roles?.find((row)=>row.user_id===id);if(!profile?.active||profile.department!==account.department||role?.role!=='department_approver')throw new Error(`Access mismatch for ${account.email}.`)}
const samples=[...new Map(fixture.accounts.map((account)=>[account.department,account])).values()];
for(const account of samples){const client=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});const login=await client.auth.signInWithPassword({email:account.email,password:account.temporaryPassword});if(login.error||!login.data.user)throw new Error(`Login failed for ${account.department}: ${login.error?.message||'No user returned'}`);await client.auth.signOut()}
console.log(JSON.stringify({ok:true,totalAccounts:fixture.accounts.length,departments:samples.length,verifiedLogins:samples.length,approversPerDepartment:fixture.accounts.length/samples.length},null,2));
