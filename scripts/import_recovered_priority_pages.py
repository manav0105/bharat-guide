"""Append reviewed recovery pages without changing existing documents or app code."""
import json,sys,hashlib,subprocess,urllib.parse
from pathlib import Path
from fetch_priority_official_pages import convex,allowed,url_key,quality_error
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.verification';IMPORT_ID='bharat-priority-recovery-2026-10-15-v1'
def main():
 inventory=convex('documentLoader:inventory',{});known={url_key(s['url']) for s in inventory['sources']}
 if any(i['importId']==IMPORT_ID for i in inventory['imports']):raise RuntimeError('Recovery batch already imported; verify instead of appending it twice')
 selected=json.loads((OUT/'gap-reviewed-dataset-pages.json').read_text(encoding='utf8'))
 pages={}
 for r in selected:
  key=url_key(r['url'])
  if key not in pages:pages[key]={**r,'sourceUrl':r['url'],'taskIds':[]}
  pages[key]['taskIds'].append(r['taskId'])
 for filename in ['gap-fallback-fetch-results.json','gap-extra-fetch-results.json','gap-final-fetch-results.json','gap-pan-fallback.json']:
  for r in json.loads((OUT/filename).read_text(encoding='utf8')):
   if r.get('error'):continue
   # The second FAQ query returned the exact same page; keep its canonical URL only.
   if r['requestedUrl']=='https://eshram.gov.in/faqs?page=1':continue
   r['url']=r['sourceUrl'];r['topics']=['public_services']
   if r['taskIds']==[18]:r['taskIds']=[17,18]
   # Import only verbatim citizen-service sections, omitting dated vaccine-age/medical advice.
   if r['taskIds']==[39]:
    lines=r['text'].splitlines();questions=[i for i,s in enumerate(lines) if s.endswith('?')]
    wanted={'Where can I register for COVID-19 vaccination?','Can I book an appointment for vaccination in the Co-WIN portal?','Can I download appointment slip?','Where can I download vaccination certificate from?'}
    excerpts=[]
    for ix,start in enumerate(questions):
     if lines[start] in wanted:
      stop=questions[ix+1] if ix+1<len(questions) else len(lines);excerpts.append('\n'.join(lines[start:stop]))
    if len(excerpts)!=4:raise RuntimeError('Vaccination FAQ section boundaries changed')
    r['text']='\n\n'.join(excerpts);r['extraction']='Four verbatim registration, booking and certificate question-answer sections; clinical advice and old age limits omitted.'
   pages.setdefault(url_key(r['url']),r)
 rows=[];added=[];seen_bodies=set()
 for key,p in pages.items():
  if key in known:continue
  url=p['url'];text=p['text'].strip();assert allowed(url)
  if quality_error(text,p['title']) or len(text)>120000:raise RuntimeError('Unusable or oversized page: '+url)
  digest=hashlib.sha256(text.encode()).hexdigest()
  if digest in seen_bodies:continue
  seen_bodies.add(digest);source_id=hashlib.sha256((url+'\0'+text).encode()).hexdigest();chunks=[text[i:i+1000] for i in range(0,len(text),1000)];assert ''.join(chunks)==text
  for i,chunk in enumerate(chunks):rows.append(dict(title=p['title'],text=chunk,url=url,host=urllib.parse.urlsplit(url).hostname,topics=p.get('topics') or ['public_services'],sourceId=source_id,chunkIndex=i,chunkCount=len(chunks),importId=IMPORT_ID))
  added.append({k:p[k] for k in ['url','title','taskIds','origin']});added[-1].update(chunks=len(chunks),sourceId=source_id,extraction=p.get('extraction','Original source text, unaltered'))
 before=convex('storageCleanup:measure',{});estimate=sum(len(json.dumps(r,ensure_ascii=False).encode())+300 for r in rows)*5
 if not before['complete'] or before['databaseBytes']+estimate>400*1048576:raise RuntimeError('Incomplete inventory or estimated storage would exceed 400 MiB')
 path=OUT/'priority-recovery-import.jsonl';path.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows),encoding='utf8')
 print('Appending',len(added),'official pages and',len(rows),'chunks',flush=True)
 if rows:
  p=subprocess.run(['npx.cmd' if sys.platform=='win32' else 'npx','convex','import','--table','documents','--append',str(path)],cwd=ROOT,capture_output=True,text=True,encoding='utf8')
  if p.returncode:raise RuntimeError(p.stderr)
 after=convex('storageCleanup:measure',{})
 assert after['complete'] and after['documents']==before['documents']+len(added) and after['chunks']==before['chunks']+len(rows)
 report={'importId':IMPORT_ID,'addedPages':len(added),'addedChunks':len(rows),'pages':added,'before':before,'after':after}
 (OUT/'priority-recovery-import-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=False),flush=True)
if __name__=='__main__':
 sys.stdout.reconfigure(encoding='utf8');main()
