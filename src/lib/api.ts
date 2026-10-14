import { supabase } from './supabase';

async function parse(response:Response){ const body=await response.json().catch(()=>({error:'Unreadable server response.'})); if(!response.ok||body.ok===false) throw new Error(body.error||'Request failed.'); return body; }
export async function api<T=unknown>(path:string,options:RequestInit={}){
  const headers=new Headers(options.headers); headers.set('content-type','application/json');
  const {data}=await supabase.auth.getSession(); if(data.session) headers.set('authorization',`Bearer ${data.session.access_token}`);
  return parse(await fetch(`/api/${path}`,{...options,headers})) as Promise<T>;
}
export const get=<T,>(path:string)=>api<T>(path);
export const post=<T,>(path:string,body:unknown)=>api<T>(path,{method:'POST',body:JSON.stringify(body)});
export const patch=<T,>(path:string,body:unknown)=>api<T>(path,{method:'PATCH',body:JSON.stringify(body)});
