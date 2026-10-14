"""Fetch the 100 tasks' missing official pages. Does not deploy any app code.

Fetch:  python scripts/fetch_priority_official_pages.py
Append: python scripts/fetch_priority_official_pages.py --import-pages
Only .gov.in/.nic.in URLs (including every redirect) are fetched.
"""
import argparse, concurrent.futures, hashlib, io, json, pathlib, re, subprocess, sys, time
import urllib.request, urllib.error, urllib.parse, ssl
from html.parser import HTMLParser
from datetime import datetime, timezone

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'.verification'
IMPORT_ID='bharat-priority-direct-2026-10-15-v1'
MAX_BYTES=12*1024*1024
# Use the platform's trusted CA certificates, keeping certificate validation on.
TLS_CONTEXT=ssl.create_default_context()
if sys.platform=='win32':
    for certificate,encoding,trust in ssl.enum_certificates('ROOT'):
        if encoding=='x509_asn':
            try:TLS_CONTEXT.load_verify_locations(cadata=ssl.DER_cert_to_PEM_cert(certificate))
            except ssl.SSLError:pass

def allowed(url):
    p=urllib.parse.urlsplit(url)
    host=(p.hostname or '').lower()
    return p.scheme in ('https','http') and not p.username and not p.password and host.endswith(('.gov.in','.nic.in'))

def url_key(url):
    p=urllib.parse.urlsplit(url)
    return (p.hostname or '').lower().removeprefix('www.')+p.path.rstrip('/')+('?' + p.query if p.query else '')

class OfficialRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        if not allowed(newurl):raise ValueError('Redirect leaves permitted .gov.in/.nic.in domains')
        return super().redirect_request(req,fp,code,msg,headers,newurl)

class PageText(HTMLParser):
    skip={'script','style','nav','header','footer','aside','svg','noscript','template'}
    block={'p','div','main','article','section','h1','h2','h3','h4','h5','li','tr','br','hr','table'}
    void={'br','hr','img','input','link','meta','source','wbr','area','base','embed','param','track','col'}
    def __init__(self):
        super().__init__(convert_charrefs=True);self.parts=[];self.hidden=[];self.title=[];self.in_title=False;self.links=[];self.anchor=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='title':self.in_title=True
        if tag=='a' and a.get('href'):self.links.append({'href':a['href'],'label':''})
        if self.hidden:
            if tag not in self.void:self.hidden.append(tag)
            return
        if tag in self.skip or a.get('aria-hidden')=='true' or 'hidden' in a:
            if tag not in self.void:self.hidden.append(tag)
            return
        if tag in self.block:self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag=='title':self.in_title=False;return
        if self.hidden:
            if tag in self.hidden:
                pos=len(self.hidden)-1-self.hidden[::-1].index(tag);self.hidden=self.hidden[:pos]
            return
        if tag in self.block:self.parts.append('\n')
    def handle_data(self,data):
        if self.in_title:self.title.append(data);return
        if not self.hidden:self.parts.append(data)
    def text(self):
        return '\n'.join(line for line in (re.sub(r'[ \t\r\f\v]+',' ',x).strip() for x in ''.join(self.parts).split('\n')) if line)

def quality_error(text,title=''):
    if re.search(r'(?:access denied|request rejected|the requested url was rejected|just a moment|checking your browser|attention required|verify you are human|page not found|404 not found|site cannot be reached)',(title+' '+text[:1200]),re.I):return 'Access/error/challenge page, not government content'
    if re.search(r'{{[^}]+}}',text):return 'Unrendered JavaScript template'
    if len(text)<220 or len(re.findall(r'\w+',text))<35:return 'No substantive public text (JavaScript/login-only or empty page)'
    if re.search(r'you need to enable javascript to run this app',text,re.I) and len(text)<500:return 'JavaScript-only page'
    return None

def fetch_page(url, retry_delay=1, retry_all=False):
    result={'requestedUrl':url,'fetchedAt':datetime.now(timezone.utc).isoformat(),'method':'direct HTTP'}
    if not allowed(url):return {**result,'error':'URL outside permitted domains'}
    for attempt in range(2):
        try:
            opener=urllib.request.build_opener(OfficialRedirect,urllib.request.HTTPSHandler(context=TLS_CONTEXT))
            req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; BharatGuide official-source reader)','Accept':'text/html,application/pdf;q=0.9,*/*;q=0.8'})
            with opener.open(req,timeout=22) as response:
                final=response.geturl()
                if not allowed(final):raise ValueError('Resolved URL outside permitted domains')
                raw=response.read(MAX_BYTES+1);ctype=response.headers.get('Content-Type','');encoding=response.headers.get_content_charset() or 'utf-8'
            if len(raw)>MAX_BYTES:raise ValueError('Page exceeds 12 MB fetch limit')
            if 'application/pdf' in ctype or raw.startswith(b'%PDF'):
                from pypdf import PdfReader
                pdf=PdfReader(io.BytesIO(raw));text='\n\n'.join(page.extract_text() or '' for page in pdf.pages)
                title=str((pdf.metadata or {}).get('/Title') or urllib.parse.unquote(urllib.parse.urlsplit(final).path.rsplit('/',1)[-1]));links=[]
            else:
                parser=PageText();parser.feed(raw.decode(encoding,errors='replace'))
                text=parser.text();title=' '.join(parser.title).strip();links=[urllib.parse.urljoin(final,x['href']) for x in parser.links if allowed(urllib.parse.urljoin(final,x['href']))]
            error=quality_error(text,title)
            if error and retry_all and attempt==0:
                time.sleep(retry_delay);continue
            return {**result,'sourceUrl':final,'title':title or urllib.parse.urlsplit(final).hostname,'text':text,'links':list(dict.fromkeys(links))[:1000],'bytesFetched':len(raw),**({'error':error} if error else {})}
        except urllib.error.HTTPError as error:
            reason='HTTP '+str(error.code)
            if attempt==0 and (retry_all or error.code>=500):time.sleep(retry_delay);continue
            return {**result,'error':reason}
        except Exception as error:
            reason=type(error).__name__+': '+str(error)
            if attempt==0 and (retry_all or isinstance(error,(TimeoutError,urllib.error.URLError))):time.sleep(retry_delay);continue
            return {**result,'error':reason[:250]}

def convex(name,args):
    result=subprocess.run(['npx.cmd' if sys.platform=='win32' else 'npx','convex','run',name,json.dumps(args)],cwd=ROOT,capture_output=True,text=True,encoding='utf-8')
    if result.returncode:raise RuntimeError('Convex operation failed: '+result.stderr)
    return json.loads(result.stdout)

def fetch_all():
    mapping=json.loads((ROOT/'data/priority-official-pages.json').read_text(encoding='utf-8'))['topics']
    OUT.mkdir(exist_ok=True)
    inventory=convex('documentLoader:inventory',{})
    if not (OUT/'priority-pages-inventory-before.json').exists():
        (OUT/'priority-pages-inventory-before.json').write_text(json.dumps(inventory,ensure_ascii=False),encoding='utf-8')
        (OUT/'priority-pages-storage-before.json').write_text(json.dumps(convex('storageCleanup:measure',{})),encoding='utf-8')
    existing={url_key(r['url']):r['url'] for r in inventory['sources']}
    urls=list(dict.fromkeys(u for t in mapping for u in [t['mainOfficialUrl'],*t.get('supportingOfficialUrls',[])]))
    results=[]
    for url in urls:
        if url_key(url) in existing:results.append({'requestedUrl':url,'sourceUrl':existing[url_key(url)],'status':'already loaded'})
    missing=[url for url in urls if url_key(url) not in existing]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures={pool.submit(fetch_page,url):url for url in missing}
        for future in concurrent.futures.as_completed(futures):
            result=future.result();results.append(result)
            (OUT/'priority-direct-fetch-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
            print(str(len(results))+'/'+str(len(urls))+' '+result['requestedUrl']+' '+(result.get('error') or str(len(result.get('text','')))+' characters'),flush=True)
    print('Fetch complete:',sum('error' not in r for r in results),'successful/already loaded;',sum('error' in r for r in results),'need browser checks.')

def import_pages():
    results=json.loads((OUT/'priority-direct-fetch-results.json').read_text(encoding='utf-8'))
    mapping=json.loads((ROOT/'data/priority-official-pages.json').read_text(encoding='utf-8'))['topics']
    current=convex('documentLoader:inventory',{})
    existing={url_key(r['url']) for r in current['sources']}
    rows=[];pages=[]
    for page in results:
        if page.get('error') or page.get('status')=='already loaded':continue
        url=page['sourceUrl']
        if not allowed(url):raise RuntimeError('Non-government source blocked')
        if url_key(url) in existing:continue
        text=page['text'].strip()
        if quality_error(text,page['title']):raise RuntimeError('Unusable content in staged page')
        if len(text)>250000:raise RuntimeError('Review unusually large source before importing')
        associated=[t for t in mapping if t['mainOfficialUrl']==page['requestedUrl'] or page['requestedUrl'] in t.get('supportingOfficialUrls',[])]
        # Preserve actual publisher text. Task mappings/scopes remain metadata in
        # the report, never inserted as factual quotations into source bodies.
        source_id=hashlib.sha256((url+'\0'+text).encode('utf-8')).hexdigest()
        chunks=[text[i:i+1000] for i in range(0,len(text),1000)]
        assert ''.join(chunks)==text
        for index,chunk in enumerate(chunks):rows.append({'title':page['title'],'text':chunk,'url':url,'host':urllib.parse.urlsplit(url).hostname,'topics':['public_services'],'sourceId':source_id,'chunkIndex':index,'chunkCount':len(chunks),'importId':IMPORT_ID})
        pages.append({'url':url,'sourceId':source_id,'title':page['title'],'topics':[t['id'] for t in associated],'chunks':len(chunks)})
        existing.add(url_key(url))
    before=convex('storageCleanup:measure',{})
    estimate=sum(len(json.dumps(row,ensure_ascii=False).encode('utf-8'))+300 for row in rows)*5
    if not before['complete'] or before['databaseBytes']+estimate>400*1048576:raise RuntimeError('Import would exceed the 400 MiB storage budget or existing data is incomplete')
    path=OUT/'priority-direct-import.jsonl';path.write_text(''.join(json.dumps(row,ensure_ascii=False)+'\n' for row in rows),encoding='utf-8')
    print('Appending',len(pages),'pages /',len(rows),'chunks; estimated maximum added storage:',round(estimate/1048576,3),'MiB',flush=True)
    if rows:
        p=subprocess.run(['npx.cmd' if sys.platform=='win32' else 'npx','convex','import','--table','documents','--append',str(path)],cwd=ROOT,capture_output=True,text=True,encoding='utf-8')
        if p.returncode:raise RuntimeError('Convex append failed: '+p.stderr)
        print(p.stdout,flush=True)
    after=convex('storageCleanup:measure',{})
    if not after['complete'] or after['documents']!=before['documents']+len(pages) or after['chunks']!=before['chunks']+len(rows):raise RuntimeError('Import counts/integrity mismatch')
    report={'importId':IMPORT_ID,'pages':pages,'addedPages':len(pages),'addedChunks':len(rows),'before':before,'after':after}
    (OUT/'priority-direct-import-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Verified:',json.dumps({k:v for k,v in after.items()}),flush=True)

if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8');parser=argparse.ArgumentParser();parser.add_argument('--import-pages',action='store_true');args=parser.parse_args()
    if args.import_pages:import_pages()
    else:fetch_all()
