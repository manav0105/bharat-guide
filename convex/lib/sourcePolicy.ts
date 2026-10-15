import type { Chunk } from './answerRules';

type State = { name: string; aliases: string[]; hosts: string[] };
const stateRows: [string, string, string][] = [
 ['Andhra Pradesh','andhra pradesh','ap'],['Arunachal Pradesh','arunachal pradesh','arunachal'],['Assam','assam','assam'],['Bihar','bihar','bihar'],['Chhattisgarh','chhattisgarh|chattisgarh','cg|chhattisgarh'],['Goa','goa','goa'],['Gujarat','gujarat','gujarat'],['Haryana','haryana','haryana'],['Himachal Pradesh','himachal pradesh','hp|himachal'],['Jharkhand','jharkhand','jharkhand'],['Karnataka','karnataka','karnataka|kar'],['Kerala','kerala','kerala'],['Madhya Pradesh','madhya pradesh','mp'],['Maharashtra','maharashtra','maharashtra'],['Manipur','manipur','manipur'],['Meghalaya','meghalaya','meghalaya'],['Mizoram','mizoram','mizoram'],['Nagaland','nagaland','nagaland'],['Odisha','odisha|orissa','odisha|orissa'],['Punjab','punjab','punjab'],['Rajasthan','rajasthan','rajasthan|raj'],['Sikkim','sikkim','sikkim'],['Tamil Nadu','tamil nadu|tamilnadu','tn|tamilnadu'],['Telangana','telangana','telangana'],['Tripura','tripura','tripura'],['Uttar Pradesh','uttar pradesh','up'],['Uttarakhand','uttarakhand|uttaranchal','uk|uttarakhand'],['West Bengal','west bengal','wb|westbengal'],
 ['Andaman and Nicobar Islands','andaman and nicobar|andaman|nicobar','andaman|and|andamannicobar'],['Chandigarh','chandigarh','chandigarh|chd'],['Dadra and Nagar Haveli and Daman and Diu','dadra and nagar haveli|daman and diu','dnh|daman|diu'],['Delhi','delhi|new delhi','delhi|delhigovt'],['Jammu and Kashmir','jammu and kashmir|jammu & kashmir|jammu|kashmir','jk|jammukashmir'],['Ladakh','ladakh','ladakh'],['Lakshadweep','lakshadweep','lakshadweep|utl'],['Puducherry','puducherry|pondicherry','py|puducherry|pondicherry'],
];
const states: State[] = stateRows.map(([name,aliases,hosts])=>({name,aliases:aliases.split('|'),hosts:hosts.split('|')}));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const phrase = (text: string, value: string) => new RegExp(`\\b${escape(value)}\\b`,'i').test(text);
export function requestedStates(question: string): State[] {
 return states.filter(state=>state.aliases.some(alias=>phrase(question,alias)));
}
function stateHost(url: string, state: State): boolean {
 try {
  const host=new URL(url).hostname.toLowerCase();
  if(!host.endsWith('.gov.in')&&!host.endsWith('.nic.in'))return false;
  return state.hosts.some(part=>host===`${part}.gov.in`||host.endsWith(`.${part}.gov.in`)||host===`${part}.nic.in`||host.endsWith(`.${part}.nic.in`))
   || state.aliases.filter(a=>!a.includes(' ')).some(a=>host.split('.').some(part=>part===a||part===`ceo${a}`));
 }catch{return false;}
}
export function requestedStatePublisher(url: string, requested: State[]): boolean {
 return requested.some(state=>stateHost(url,state));
}
export function matchesRequestedState(chunk: Pick<Chunk,'url'|'title'|'text'>, requested: State[]): boolean {
 return !requested.length||requested.some(state=>stateHost(chunk.url,state)||state.aliases.some(alias=>phrase(chunk.title,alias)
  ||chunk.text.split(/\n+/).some(line=>phrase(line,alias)&&(line.match(/[a-z]+/gi)||[]).length>=3)));
}
export function stateNotFound(question: string): string | null {
 const requested=requestedStates(question);
 return requested.length?`I couldn't find an official ${requested.map(s=>s.name).join(' or ')} page for this`:null;
}
// Names and common aliases are matched as words, never substrings such as PAN.
const countries=('afghanistan|albania|algeria|andorra|angola|antigua and barbuda|argentina|armenia|australia|austria|azerbaijan|bahamas|bahrain|bangladesh|barbados|belarus|belgium|belize|benin|bhutan|bolivia|bosnia|botswana|brazil|brunei|bulgaria|burkina faso|burundi|cabo verde|cambodia|cameroon|canada|cape verde|central african republic|chad|chile|china|colombia|comoros|congo|costa rica|croatia|cuba|cyprus|czechia|czech republic|denmark|djibouti|dominica|dominican republic|ecuador|egypt|el salvador|equatorial guinea|eritrea|estonia|eswatini|ethiopia|fiji|finland|france|gabon|gambia|georgia|germany|ghana|greece|grenada|guatemala|guinea|guyana|haiti|honduras|hungary|iceland|indonesia|iran|iraq|ireland|israel|italy|ivory coast|cote d ivoire|jamaica|japan|jordan|kazakhstan|kenya|kiribati|north korea|south korea|kosovo|kuwait|kyrgyzstan|laos|latvia|lebanon|lesotho|liberia|libya|liechtenstein|lithuania|luxembourg|madagascar|malawi|malaysia|maldives|mali|malta|marshall islands|mauritania|mauritius|mexico|micronesia|moldova|monaco|mongolia|montenegro|morocco|mozambique|myanmar|namibia|nauru|nepal|netherlands|new zealand|nicaragua|niger|nigeria|north macedonia|norway|oman|pakistan|palau|palestine|panama|papua new guinea|paraguay|peru|philippines|poland|portugal|qatar|romania|russia|rwanda|saint kitts|saint lucia|saint vincent|samoa|san marino|sao tome|saudi arabia|senegal|serbia|seychelles|sierra leone|singapore|slovakia|slovenia|solomon islands|somalia|south africa|south sudan|spain|sri lanka|sudan|suriname|sweden|switzerland|syria|taiwan|tajikistan|tanzania|thailand|timor leste|togo|tonga|trinidad|tunisia|turkey|turkiye|turkmenistan|tuvalu|uganda|ukraine|united arab emirates|united kingdom|united states|uruguay|uzbekistan|vanuatu|vatican|venezuela|vietnam|yemen|zambia|zimbabwe|uk|usa|uae|britain|england|scotland|wales|american|british|french|german|japanese|chinese|australian|canadian|bangladeshi|nepali|sri lankan').split('|');
const countryPattern = new RegExp(`\\b(?:${countries.map(escape).join('|')})\\b`, 'i');
export function countryOrMissionRequested(question: string): boolean {
 return /\b(?:embassy|consulate|high commission)\b/i.test(question)||/\bUS\b/.test(question)||countryPattern.test(question);
}
export function isMission(chunk: Pick<Chunk,'url'|'title'>): boolean {
 try {
  const host=new URL(chunk.url).hostname.replace(/^www\./,'');
  // A national portal can describe embassy services without being an embassy.
  if(['indianvisaonline.gov.in','passportindia.gov.in','mea.gov.in','india.gov.in','services.india.gov.in','myscheme.gov.in'].includes(host))return false;
  return /\b(?:embassy|high commission|consulate|consul general)\b/i.test(chunk.title)
   || /^(?:indianembassy|embassyofindia|indemb|indianhighcommission|indiaconsulate|eoi|hci|cgi|cgisf|cgihouston|cgitoronto|cgivancouver)/i.test(host);
 }catch{return false;}
}
export function sourcePriority(chunk: Pick<Chunk,'url'|'title'>, question: string): number {
 if(countryOrMissionRequested(question))return 1;
 if(isMission(chunk))return 0.2;
 const namedStates=requestedStates(question);
 if(namedStates.length)return namedStates.some(state=>stateHost(chunk.url,state))?4:1;
 try {
  const national=new URL(chunk.url).hostname.endsWith('.gov.in')&&!states.some(state=>stateHost(chunk.url,state))&&!/\b(?:district|municipal|collectorate|zilla|panchayat)\b/i.test(chunk.title);
  return national?3:1;
 }catch{return 1;}
}
export function clarification(question: string): string | null {
 if(!/\bvisas?\b/i.test(question)||countryOrMissionRequested(question))return null;
 const words=question.toLowerCase().match(/[a-z]+/g)||[];
 const vague=new Set('visa visas process procedure application applying apply steps how do does can could i we you to for get obtain a an the please tell me about tourist work student business transit'.split(' '));
 return words.every(word=>vague.has(word))?'Are you an Indian travelling abroad, or a foreign national coming to India?':null;
}
