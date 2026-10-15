import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL;
const key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY;
const siteUrl=process.env.SITE_URL||process.env.VITE_SITE_URL;
if(!url||!key||!siteUrl)throw new Error('Supabase URL, publishable key, and SITE_URL are required.');
const auth=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const recipients=['gpigemcorqbbackup@gmail.com','dricianfranciscordon@gmail.com'];
const results=[];
for(const email of recipients){
  const {error}=await auth.auth.resetPasswordForEmail(email,{redirectTo:`${siteUrl}/admin/reset-password`});
  results.push({email,accepted:!error,error:error?.message});
}
console.log(JSON.stringify({ok:results.every((result)=>result.accepted),channel:'Supabase Auth password recovery',results},null,2));
if(results.some((result)=>!result.accepted))process.exitCode=1;
