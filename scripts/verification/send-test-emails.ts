import process from 'node:process';
import nodemailer from 'nodemailer';

const host=process.env.SMTP_HOST;
const port=Number(process.env.SMTP_PORT||465);
const secure=(process.env.SMTP_SECURE||'true')==='true';
const user=process.env.SMTP_USER;
const pass=process.env.SMTP_PASSWORD;
const from=process.env.SMTP_FROM_EMAIL;
if(!host||!user||!pass||!from)throw new Error('SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM_EMAIL are required.');

const recipients=[
  {email:'gpigemcorqbbackup@gmail.com',caseName:'Approver delivery'},
  {email:'dricianfranciscordon@gmail.com',caseName:'Requestor delivery'},
];
const transport=nodemailer.createTransport({host,port,secure,auth:{user,pass}});
await transport.verify();
const results=[];
for(const recipient of recipients){
  const result=await transport.sendMail({
    from,
    to:recipient.email,
    subject:`[TEST] RFP workflow email delivery — ${recipient.caseName}`,
    text:`This is an authorized RFP workflow delivery test for ${recipient.caseName}. No request was created, changed, or deleted. Test time: ${new Date().toISOString()}`,
    html:`<div style="font-family:Arial,sans-serif;color:#172033"><h1 style="font-size:20px">RFP workflow email test</h1><p>This is an authorized delivery test for <strong>${recipient.caseName}</strong>.</p><p>No request was created, changed, or deleted.</p><p style="color:#667085;font-size:12px">Test time: ${new Date().toISOString()}</p></div>`,
  });
  results.push({recipient:recipient.email,accepted:result.accepted.includes(recipient.email),messageId:result.messageId});
}
console.log(JSON.stringify({ok:results.every((item)=>item.accepted),results},null,2));
