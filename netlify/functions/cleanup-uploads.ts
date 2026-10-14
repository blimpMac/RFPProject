import type { Config, Handler } from '@netlify/functions';
import { adminClient } from '../lib/supabase.js';

export const handler: Handler = async () => {
  const db=adminClient();
  const cutoff=new Date(Date.now()-24*60*60_000).toISOString();
  const { data, error }=await db.from('rfp_requests').select('id').eq('final_status','Draft Uploading').lt('created_at',cutoff);
  if(error) return {statusCode:500,body:JSON.stringify({ok:false})};
  for(const request of data||[]){
    const listed=await db.storage.from('rfp-attachments').list(request.id,{limit:100});
    if(listed.data?.length) await db.storage.from('rfp-attachments').remove(listed.data.map((f)=>`${request.id}/${f.name}`));
    await db.from('rfp_requests').delete().eq('id',request.id);
  }
  await db.from('submission_rate_limits').delete().lt('occurred_at',new Date(Date.now()-24*60*60_000).toISOString());
  return {statusCode:200,body:JSON.stringify({ok:true,removed:data?.length||0})};
};
export const config: Config = { schedule:'17 2 * * *' };
