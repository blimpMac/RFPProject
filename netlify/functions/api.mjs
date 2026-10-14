import crypto from 'node:crypto';

const SCRIPT_URL=process.env.APPS_SCRIPT_URL;
const SHARED_SECRET=process.env.RFP_SHARED_SECRET;
const SESSION_SECRET=process.env.SESSION_SECRET;
const ADMIN_EMAIL=process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD;
const isConfigured=()=>[SCRIPT_URL,SHARED_SECRET,SESSION_SECRET,ADMIN_EMAIL,ADMIN_PASSWORD].every(Boolean);
const json=(status,body,headers={})=>({statusCode:status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers},body:JSON.stringify(body)});
const bad=(code,msg)=>json(code,{ok:false,error:msg});
const sign=(data,secret)=>crypto.createHmac('sha256',secret).update(data).digest('base64url');
const safeEq=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length && crypto.timingSafeEqual(x,y)};
const cookies=(event)=>Object.fromEntries((event.headers.cookie||'').split(';').map(s=>s.trim().split('=').map(decodeURIComponent)).filter(p=>p.length===2));
function hasAdmin(event){const token=cookies(event).rfp_session;if(!token)return false;const [payload,sig]=token.split('.');if(!payload||!sig||!safeEq(sign(payload,SESSION_SECRET),sig))return false;try{const data=JSON.parse(Buffer.from(payload,'base64url').toString());return data.email===ADMIN_EMAIL.toLowerCase()&&data.exp>Date.now()}catch{return false}}
function issueSession(){const payload=Buffer.from(JSON.stringify({email:ADMIN_EMAIL.toLowerCase(),exp:Date.now()+8*3600000})).toString('base64url');return payload+'.'+sign(payload,SESSION_SECRET)}
function parseDecisionToken(token){if(typeof token!=='string'||token.length>400)return null;const [payload,sig]=token.split('.');if(!payload||!sig||!safeEq(sign(payload,SHARED_SECRET),sig))return null;try{const obj=JSON.parse(Buffer.from(payload,'base64url').toString());if(!/^RFP-\d{4,}$/.test(obj.id)||obj.exp<Date.now())return null;return obj.id}catch{return null}}
function secureFile(f){if(!f||typeof f.name!=='string'||typeof f.type!=='string'||typeof f.data!=='string')return false;return f.name.length<=150&&f.data.length<4300000 && /^(application\/pdf|image\/(jpeg|png|webp|gif|heic|heif|tiff|bmp|x-ms-bmp))$/.test(f.type)&&/^[A-Za-z0-9+/=]+$/.test(f.data);}
function verifyRequest(r){return r && ['requestorName','requestorEmail','department','project','rfpType','payee','requiredDate','purpose'].every(k=>typeof r[k]==='string'&&r[k].trim()&&r[k].length<=1800)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.requestorEmail)&&r.requestorEmail.length<=160&&Number(r.amount)>0&&Number(r.amount)<=1e9&&/^\d{4}-\d\d-\d\d$/.test(r.requiredDate)&&['Sales','Operations','Engineering','IT','HR','Admin','Finance','Other'].includes(r.department)&&['Request for Payment','Supplier Payment','Project Expense','Reimbursement','Cash Advance','Other'].includes(r.rfpType);}
async function bridge(action,data){const response=await fetch(SCRIPT_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({secret:SHARED_SECRET,action,...data}),redirect:'follow',signal:AbortSignal.timeout(27000)});const text=await response.text();let result;try{result=JSON.parse(text)}catch{throw new Error('Google integration returned a non-JSON response. Check the Apps Script deployment URL and access settings.')}if(!response.ok||result.ok===false)throw new Error(result.error||'Google integration failed.');return result;}
export async function handler(event){const origin=event.headers.origin;const host=event.headers.host;if(origin){try{if(new URL(origin).host!==host)return bad(403,'Invalid origin.')}catch{return bad(403,'Invalid origin.');}}
  if(!isConfigured())return bad(503,'Service configuration is incomplete. An administrator must configure the deployment environment.');
  const route=event.path.replace(/^.*\/api\/?/,'').replace(/\/+$/,'');const method=event.httpMethod;let body={};
  if(method==='POST'){if((event.body||'').length>4800000)return bad(413,'Request is too large.');try{body=JSON.parse(event.body||'{}')}catch{return bad(400,'Invalid JSON payload.');}}
  try{
    if(route==='me'&&method==='GET')return json(200,{ok:true,authenticated:hasAdmin(event)});
    if(route==='login'&&method==='POST'){if(!safeEq(String(body.email||'').toLowerCase(),ADMIN_EMAIL.toLowerCase())||!safeEq(String(body.password||''),ADMIN_PASSWORD))return bad(401,'Incorrect email or password.');return json(200,{ok:true},{'set-cookie':'rfp_session='+encodeURIComponent(issueSession())+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800'});}
    if(route==='logout'&&method==='POST')return json(200,{ok:true},{'set-cookie':'rfp_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
    if(route==='dashboard'&&method==='GET'){if(!hasAdmin(event))return bad(401,'Please sign in as an administrator.');return json(200,await bridge('dashboard',{}));}
    if(route==='submit'&&method==='POST'){if(!verifyRequest(body.request))return bad(400,'Please complete every required field with valid information.');const files=body.files||[];if(!Array.isArray(files)||files.length>10||files.some(f=>!secureFile(f)))return bad(400,'Unsupported attachment or more than 10 files.');let total=0;for(const f of files)total+=Buffer.from(f.data,'base64').length;if(total>3*1024*1024)return bad(413,'Maximum combined upload size is 3 MB.');return json(200,await bridge('submit',{request:body.request,files}));}
    if(route==='review'&&method==='POST'){const id=parseDecisionToken(body.token);if(!id)return bad(403,'This review link is invalid or expired.');return json(200,await bridge('review',{id}));}
    if(route==='decide'&&method==='POST'){const id=parseDecisionToken(body.token);if(!id)return bad(403,'This review link is invalid or expired.');if(!['approve','reject'].includes(body.decision))return bad(400,'Invalid decision.');const remarks=typeof body.remarks==='string'?body.remarks.trim():'';if(remarks.length>1000||body.decision==='reject'&&!remarks)return bad(400,'A rejection explanation is required.');return json(200,await bridge('decide',{id,decision:body.decision,remarks}));}
    return bad(404,'API route not found.');
  }catch(err){console.error('RFP API:',err.message);return bad(502,'The service could not finish this request. '+(String(err.message).includes('Google integration')?'Please check the Google integration configuration.':'Try again or contact the administrator.'));}
}