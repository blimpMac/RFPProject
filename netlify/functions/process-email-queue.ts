import type { Config, Handler } from '@netlify/functions';
import { processEmailQueue } from '../email/service.js';

export const handler: Handler = async () => {
  try { return { statusCode:200, body:JSON.stringify({ ok:true, results:await processEmailQueue() }) }; }
  catch (error) { console.error(error); return { statusCode:500, body:JSON.stringify({ ok:false }) }; }
};
export const config: Config = { schedule: '*/5 * * * *' };
