"""Bounded streaming recovery of priority task pages. Never downloads the full dataset."""
import os,sys,json,re,time,hashlib,subprocess,urllib.parse
from pathlib import Path
os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN']='1'
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING']='1'
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from fetch_priority_official_pages import allowed,url_key,convex,quality_error
OUT=ROOT/'.verification'; REV='1b76e58adbb0a69e113e27626a15b97d039d897e'
# Each candidate needs both the task subject and relevant task content.
PATTERNS={
1:(r'aadhaar|uidai',r'updat|correct|demographic'),2:(r'aadhaar|uidai',r'download|e-aadhaar'),3:(r'aadhaar|uidai',r'enrol|enroll'),
6:(r'\bpan\b|permanent account',r'correct|reprint|changes'),7:(r'\bpan\b|permanent account',r'track|status|acknowledg'),
25:(r'pm.?kisan|kisan samman',r'eligib|register|apply|enrol'),26:(r'pm.?kisan|kisan samman',r'e.?kyc'),27:(r'pm.?kisan|kisan samman',r'status|beneficiar|payment'),
48:(r'provident fund|\bepf[o]?\b',r'withdraw|settlement|claim'),49:(r'provident fund|\bepf[o]?\b',r'transfer'),50:(r'provident fund|\bepf[o]?\b|\buan\b',r'activat|kyc'),52:(r'employee.{0,4} pension|\beps\b|\bepfo\b',r'pension|10d'),
18:(r'e.?epic',r'download'),17:(r'voter|electoral',r'roll|polling|search'),32:(r'ayushman|pm.?jay|jan arogya',r'eligib|enrol|apply|register'),33:(r'ayushman|pm.?jay|jan arogya',r'card|beneficiar'),
57:(r'e.?shram',r'regist|enrol|apply'),80:(r'caste certificate|scheduled caste',r'certificate|issuance'),69:(r'sukanya',r'account|apply|deposit'),
73:(r'surya ghar|rooftop solar',r'apply|application|subsid|register'),66:(r'atal pension',r'enrol|apply|subscriber|eligib'),67:(r'jeevan jyoti|pmjjby',r'enrol|apply|eligib|application'),68:(r'suraksha bima|pmsby',r'enrol|apply|eligib|application'),
62:(r'pmegp|employment generation programme',r'apply|eligib|application'),89:(r'vidyalaxmi|vidyalakshmi|education loan',r'apply|loan|eligib'),39:(r'cowin|co-win|vaccination certificate',r'book|download|register|certificate')}
def scan():
 from datasets import load_dataset
 inventory=convex('documentLoader:inventory',{});(OUT/'gap-recovery-inventory-before.json').write_text(json.dumps(inventory),encoding='utf8')
 existing={url_key(s['url']) for s in inventory['sources']}
 best={str(k):[] for k in PATTERNS};counts={str(k):0 for k in PATTERNS}
 stream=load_dataset('ankitjh4/bharat-government-documents',revision=REV,split='train',streaming=True,token=False,columns=['document_id','title','url','text','quality','topics','sources'])
 for n,r in enumerate(stream,1):
  if not allowed(r['url']) or r['quality'] not in ('full_text','ocr_text'):continue
  if not any(s.get('document_id')==r['document_id'] and s.get('assessment_status')=='eligible' for s in r['sources']):continue
  text=r.get('text') or '';head=r['title']+' '+urllib.parse.unquote(r['url']);body=head+' '+text
  if len(text)<200 or len(text)>120000 or quality_error(text,r['title']):continue
  for k,(subject,action) in PATTERNS.items():
   if not re.search(subject,head,re.I) or not re.search(action,text,re.I):continue
   # Certificate task stays within the previously selected Delhi example.
   if k==80 and 'delhi' not in body.lower():continue
   counts[str(k)]+=1
   score=5*bool(re.search(subject,r['title'],re.I))+3*bool(re.search(action,r['title'],re.I))+2*('/schemes/' in r['url'])+2*bool(re.search(r'faq|guideline|how.to',head,re.I))
   entry={'taskId':k,'score':score,'alreadyLoaded':url_key(r['url']) in existing,'url':r['url'],'title':r['title'],'text':text,'topics':r['topics'],'quality':r['quality'],'documentId':r['document_id'],'origin':'Hugging Face streaming dataset','revision':REV}
   best[str(k)].append(entry);best[str(k)]=sorted(best[str(k)],key=lambda e:e['score'],reverse=True)[:4]
  if n%5000==0:
   print('Checked dataset rows:',n,flush=True);(OUT/'gap-hf-candidates.json').write_text(json.dumps({'rowsChecked':n,'complete':False,'matches':counts,'candidates':best},ensure_ascii=False),encoding='utf8')
 result={'rowsChecked':n,'complete':True,'matches':counts,'candidates':best};(OUT/'gap-hf-candidates.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
 for k,rows in best.items():print(k,[(r['title'],r['url'],r['alreadyLoaded']) for r in rows],flush=True)
if __name__=='__main__':
 sys.stdout.reconfigure(encoding='utf8');scan()
