import crypto from 'node:crypto';

export const REQUIRED_SHEETS=['Form Responses 1','RFP Tracker','Approver Master','Approval Log','Recommended Process Flow'] as const;
export const hashRecord=(value:unknown)=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const text=(value:unknown)=>value===null||value===undefined?'':String(value).trim();
export const nullable=(value:unknown)=>{const v=text(value);return v||null};
export const normalize=(value:unknown)=>text(value).replace(/^[-–—\s]+/,'').trim().toLowerCase();
export function parseDate(value:unknown,dateOnly=false):string|null{
  if(value===null||value===undefined||value==='')return null;
  if(value instanceof Date){const iso=value.toISOString();return dateOnly?iso.slice(0,10):iso}
  const raw=text(value);const match=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(match){const[,m,d,y,h='0',min='0',s='0']=match;const local=`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;return dateOnly?local:`${local}T${h.padStart(2,'0')}:${min}:${s}+08:00`}
  const parsed=new Date(raw);if(Number.isNaN(parsed.getTime()))return null;return dateOnly?parsed.toISOString().slice(0,10):parsed.toISOString();
}
export const rfpNumeric=(value:string)=>Number(value.match(/\d+/)?.[0]||0);
export function a1(row:number,column:number){let n=column+1,name='';while(n){const r=(n-1)%26;name=String.fromCharCode(65+r)+name;n=Math.floor((n-1)/26)}return `${name}${row+1}`}
