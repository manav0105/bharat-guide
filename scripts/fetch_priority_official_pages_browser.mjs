import {chromium} from '@playwright/test';
import fs from 'node:fs';
const path='.verification/priority-direct-fetch-results.json';
const results=JSON.parse(fs.readFileSync(path,'utf8'));
const allowed=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&/\.(gov|nic)\.in$/i.test(u.hostname);}catch{return false;}};
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext();
await context.route('**/*',route=>{
 const r=route.request();
 return !allowed(r.url())||['image','font','media'].includes(r.resourceType())?route.abort():route.continue();
});
const pending=results.map((r,i)=>({r,i})).filter(({r})=>r.error&&!r.browserAttempted);
let next=0;
async function worker(){
 while(next<pending.length){
  const {r,i}=pending[next++];const page=await context.newPage();
  try{
   const response=await page.goto(r.requestedUrl,{waitUntil:'domcontentloaded',timeout:25000});
   if(!allowed(page.url()))throw new Error('Redirect outside .gov.in/.nic.in blocked');
   if(response&&response.status()>=400)throw new Error('HTTP '+response.status());
   await page.waitForFunction(()=>document.body?.innerText.length>500,null,{timeout:8000}).catch(()=>{});
   const data=await page.evaluate(()=>{
    const selected=document.querySelector('main')||document.querySelector('[role="main"]')||document.body;
    const clone=selected.cloneNode(true);
    clone.querySelectorAll('script,style,nav,header,footer,aside,noscript,svg,[aria-hidden="true"],[hidden]').forEach(n=>n.remove());
    return {title:document.title,text:clone.textContent.replace(/[ \t\r]+/g,' ').split('\n').map(s=>s.trim()).filter(Boolean).join('\n'),links:[...document.querySelectorAll('a[href]')].map(a=>a.href)};
   });
   if(data.text.length<220||data.text.split(/\s+/).length<35)throw new Error('No substantive public text after JavaScript rendering');
   if(/access denied|request rejected|just a moment|checking your browser|verify you are human|404 not found|page not found/i.test(data.title+' '+data.text.slice(0,1200)))throw new Error('Access/error/challenge page');
   if(/{{[^}]+}}/.test(data.text))throw new Error('JavaScript template did not render');
   results[i]={requestedUrl:r.requestedUrl,sourceUrl:page.url(),fetchedAt:new Date().toISOString(),method:'direct browser',title:data.title,text:data.text,links:[...new Set(data.links.filter(allowed))].slice(0,1000),previousError:r.error};
   console.log('OK '+r.requestedUrl+' '+data.text.length+' characters');
  }catch(error){results[i]={...r,error:String(error.message).split('\n')[0],directHttpError:r.error,browserAttempted:true};console.log('UNAVAILABLE '+r.requestedUrl+' '+results[i].error);}
  finally{await page.close();fs.writeFileSync(path,JSON.stringify(results,null,2));}
 }
}
await Promise.all(Array.from({length:4},worker));
await browser.close();
console.log('Browser pass complete: '+results.filter(r=>!r.error).length+' available; '+results.filter(r=>r.error).length+' unavailable.');
