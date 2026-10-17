import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {Agent, fetch as pinnedFetch} from 'undici';
import {countFeedItems,discoverFeeds,inspectJsonLd,inspectSitemap,parseRobots,type ResourceResult} from '@/lib/source-signals';
export type Finding = { id:string; title:string; detail:string; impact:'High'|'Medium'|'Low'; category:string };
export type Analysis = { url:string; host:string; title:string; description:string; status:number|null; canonical:string|null; robots:string|null; headings:string[]; imageCount:number; imagesWithoutAlt:number; wordCount:number; structuredData:{blocks:number;types:string[];parseErrors:number}; discovery:{robotsTxt:{url:string;status:number|null;contentType:string|null;error:string|null;targetAllowed:boolean|null;sitemapUrls:string[]};sitemap:{url:string|null;status:number|null;kind:string|null;urlCount:number|null;sitemapCount:number|null;containsTarget:boolean|null;valid:boolean|null};feeds:{url:string;type:string;status:number|null;itemCount:number|null}[]}; contentAssessed:boolean; findings:Finding[]; opportunities:{title:string; channel:string; rationale:string; effort:string; score:number}[]; analyzedAt:string };

function textContent(root: ParentNode, selector: string) { return root.querySelector(selector)?.textContent?.trim() ?? ''; }
function meta(doc:Document, name:string) { return doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content')?.trim() ?? ''; }

export async function analyzeUrl(input:string):Promise<Analysis> {
  let parsed = new URL(input);
  for(let redirect=0;redirect<=5;redirect++){
    const agent=pinnedAgent(await resolvePublicAddresses(parsed.hostname));
    let response;
    try{response=await pinnedFetch(parsed.toString(), {dispatcher:agent, redirect:'manual', signal:AbortSignal.timeout(12000), headers:{'User-Agent':'OrganicGrowthStudio/0.1 (+page diagnostics; contact site owner)'}});}
    finally{void agent.close();}
    if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location)throw new Error('The page returned a redirect without a destination.');if(redirect===5)throw new Error('The page redirected too many times.');parsed=new URL(location,parsed);if(!['http:','https:'].includes(parsed.protocol))throw new Error('Redirects must use http or https.');continue;}
    const html=await readLimited(response,2_000_000);
    const finalUrl=parsed.toString();
  const {JSDOM}=await import('jsdom');
  const doc=new JSDOM(html,{url:finalUrl}).window.document;
  const title=textContent(doc,'title');
  const description=meta(doc,'description');
  const canonicalHref=doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
  let canonical:string|null=null;try{const value=canonicalHref?new URL(canonicalHref,finalUrl):null;if(value&&['http:','https:'].includes(value.protocol))canonical=value.toString();}catch{}
  const robots=meta(doc,'robots') || meta(doc,'googlebot') || null;
  const structuredData=inspectJsonLd(doc);
  const headings=[...doc.querySelectorAll('h1,h2')].map(x=>x.textContent?.trim()??'').filter(Boolean).slice(0,12);
  const images=[...doc.images]; const imagesWithoutAlt=images.filter(i=>!i.hasAttribute('alt') || !i.getAttribute('alt')?.trim()).length;
  const mainText=(doc.querySelector('main')??doc.body)?.textContent?.replace(/\s+/g,' ').trim()??'';
  const wordCount=mainText.split(/\s+/).filter(Boolean).length;
  const robotsTxt=await fetchRelatedText(new URL('/robots.txt',finalUrl).toString(),new URL(finalUrl).origin);
  const robotsInfo=robotsTxt.body?parseRobots(robotsTxt.body,finalUrl):{sitemaps:[],targetAllowed:null};
  const sitemapCandidates=robotsInfo.sitemaps.length?robotsInfo.sitemaps:[new URL('/sitemap.xml',finalUrl).toString()];
  const sitemapResults=await Promise.all(sitemapCandidates.slice(0,2).map(url=>fetchRelatedText(url,new URL(finalUrl).origin)));
  const sitemapMatch=sitemapResults.find(x=>x.status!==null&&x.status>=200&&x.status<300&&x.body);
  const sitemapParsed=sitemapMatch?.body?inspectSitemap(sitemapMatch.body,finalUrl):null;
  const feeds=await Promise.all(discoverFeeds(doc,finalUrl).map(async feed=>{const result=await fetchRelatedText(feed.url,new URL(finalUrl).origin);return{url:feed.url,type:feed.type,status:result.status,itemCount:result.body?countFeedItems(result.body,feed.type):null};}));
  const findings:Finding[]=[];
  // A 429/5xx/403 body is the edge's block or error page, not the owner's page.
  // Judging it produced a cascade of false findings ("title is missing", "no H1",
  // "thin content") against pages that were in fact fine, which sends the owner to
  // fix something that is not broken. Report only what we can stand behind.
  const pageReadable=pageBodyIsOwners(response.status);
  if(!response.ok) findings.push({id:'status',title:`Page returned HTTP ${response.status}`,detail:'Search visitors and crawlers may not be able to use this destination reliably.',impact:'High',category:'Technical'});
  if(pageReadable && !title) findings.push({id:'title',title:'Page title is missing',detail:'Add a distinct title that describes this exact page and its product or purpose.',impact:'High',category:'Search appearance'});
  else if(pageReadable && (title.length<25 || title.length>65)) findings.push({id:'title-length',title:'Review the page title length',detail:`Current title is ${title.length} characters. Check that it clearly describes the page and reads naturally in search results.`,impact:'Medium',category:'Search appearance'});
  if(pageReadable && !description) findings.push({id:'description',title:'Meta description is missing',detail:'Write a concise, accurate summary that helps searchers decide whether this page matches their need.',impact:'Medium',category:'Search appearance'});
  if(pageReadable && !doc.querySelector('h1')) findings.push({id:'h1',title:'No main heading found',detail:'Use one clear visible heading that tells shoppers what this page offers.',impact:'Medium',category:'Content'});
  if(pageReadable && imagesWithoutAlt) findings.push({id:'alt',title:`${imagesWithoutAlt} of ${images.length} images lack descriptive alt text`,detail:'Describe informative product imagery accurately; use empty alt text for decorative images.',impact:'Medium',category:'Accessibility'});
  if(pageReadable && robots?.toLowerCase().includes('noindex')) findings.push({id:'noindex',title:'Page asks crawlers not to index it',detail:'Confirm this is intentional before investing in discovery content for this URL.',impact:'High',category:'Indexability'});
  if(pageReadable && !canonical) findings.push({id:'canonical',title:'No canonical link detected',detail:'Confirm the preferred URL if this page can be reached through multiple URL variants.',impact:'Low',category:'Technical'});
  if(robotsInfo.targetAllowed===false) findings.push({id:'robots-block',title:'robots.txt disallows this path for generic crawlers',detail:'The robots.txt rules for user-agent * match this page path with a disallow rule. Confirm the result for the specific crawler before changing it.',impact:'High',category:'Discovery'});
  if(pageReadable && structuredData.parseErrors) findings.push({id:'jsonld-parse',title:'Structured data JSON-LD could not be parsed',detail:`${structuredData.parseErrors} JSON-LD block${structuredData.parseErrors===1?'':'s'} contain invalid JSON syntax. This check does not validate schema.org semantics.`,impact:'Medium',category:'Structured data'});
  if(sitemapMatch&&sitemapParsed&&!sitemapParsed.valid) findings.push({id:'sitemap-invalid',title:'A discovered sitemap could not be parsed',detail:'The sitemap response was reachable but did not contain a recognized urlset or sitemapindex root.',impact:'Medium',category:'Discovery'});
  if(sitemapParsed?.kind==='urlset'&&sitemapParsed.containsTarget===false) findings.push({id:'sitemap-target-missing',title:'The target URL was not found in the fetched sitemap',detail:'This single sitemap response did not list the analyzed URL. Sitemap omission does not prove a page is not indexed.',impact:'Low',category:'Discovery'});
  if(pageReadable && wordCount<100) findings.push({id:'thin-content',title:'Very little readable page text detected',detail:'Consider adding useful, specific product or collection information. This is a heuristic; short product pages can still be useful.',impact:'Low',category:'Content'});
  const opportunities=[
    {title:'Fix high-impact page findings',channel:'Page improvements',rationale:findings.find(x=>x.impact==='High')?.detail??'No high-impact issues detected by this lightweight scan. Review the findings and verify them manually.',effort:'Low',score:findings.some(x=>x.impact==='High')?95:70},
    {title:'Create an original visual discovery set',channel:'Content studio',rationale:'Prepare distinct product, detail, and styling assets, each linking to this exact destination.',effort:'Medium',score:84},
    {title:'Prepare a short product story',channel:'Content studio',rationale:'Show the page subject in context and provide a specific reason for the viewer to visit.',effort:'Medium',score:78},
    {title:'Create a tagged distribution link',channel:'Distribution',rationale:'Track outbound clicks by source and campaign with a Signal redirect and UTM parameters.',effort:'Low',score:74},
  ];
    const discovery={robotsTxt:{url:robotsTxt.url,status:robotsTxt.status,contentType:robotsTxt.contentType,error:robotsTxt.error,targetAllowed:robotsInfo.targetAllowed,sitemapUrls:robotsInfo.sitemaps},sitemap:{url:sitemapMatch?.url??sitemapCandidates[0]??null,status:sitemapMatch?.status??sitemapResults[0]?.status??null,kind:sitemapParsed?.kind??null,urlCount:sitemapParsed?.urlCount??null,sitemapCount:sitemapParsed?.sitemapCount??null,containsTarget:sitemapParsed?.containsTarget??null,valid:sitemapParsed?.valid??null},feeds};
    return {url:finalUrl,host:new URL(finalUrl).host,title,description,status:response.status,canonical,robots,headings,imageCount:images.length,imagesWithoutAlt,wordCount,structuredData,discovery,contentAssessed:pageReadable,findings,opportunities,analyzedAt:new Date().toISOString()};
  }
  throw new Error('Could not safely reach that URL.');
}

// Statuses where the response body is the owner's page rather than an edge
// block or server error. 404 is excluded: its body is an error page too, so the
// missing-page finding stands on its own without content noise beneath it.
export function pageBodyIsOwners(status:number):boolean{return status>=200&&status<300;}

// Returns the address that was checked, so the request can be pinned to it.
// Resolving here and letting fetch resolve again leaves a gap: a hostile DNS
// server can answer with a public address for the check and a private one for
// the connection. The caller connects to exactly what was approved.
async function resolvePublicAddresses(hostname:string):Promise<string[]>{
  const host=hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host==='::1')throw new Error('Private and local network URLs cannot be analyzed.');
  let addresses:string[];
  if(isIP(host))addresses=[host];else{try{addresses=(await lookup(host,{all:true,verbatim:true})).map(x=>x.address)}catch{throw new Error('The target hostname could not be resolved.')}}
  if(!addresses.length||addresses.some(isPrivateAddress))throw new Error('Private and local network URLs cannot be analyzed.');
  return addresses;
}

// TLS still negotiates against the URL's hostname, so certificate validation is
// unchanged; only the set of addresses that may be dialled is fixed. All of
// them are handed over, not just the first, so a dual-stack or load-balanced
// host keeps its normal connection failover between addresses already checked.
function pinnedAgent(addresses:string[]):Agent{
  const pinned=addresses.map(address=>({address,family:isIP(address)}));
  return new Agent({connect:{lookup:(_hostname,_options,cb)=>cb(null,pinned)}});
}
async function fetchRelatedText(input:string,expectedOrigin:string):Promise<ResourceResult>{
 let parsed:URL;try{parsed=new URL(input)}catch{return{url:input,status:null,contentType:null,body:null,error:'Invalid resource URL.'}}
 if(!['http:','https:'].includes(parsed.protocol)||parsed.origin!==expectedOrigin||parsed.username||parsed.password)return{url:input,status:null,contentType:null,body:null,error:'Related resources must remain on the page origin.'};
 for(let redirect=0;redirect<=3;redirect++){
  try{
   const agent=pinnedAgent(await resolvePublicAddresses(parsed.hostname));
   let response;
   try{response=await pinnedFetch(parsed.toString(),{dispatcher:agent,redirect:'manual',signal:AbortSignal.timeout(3500),headers:{'User-Agent':'OrganicGrowthStudio/0.1 (+page diagnostics; contact site owner)'}});}
   finally{void agent.close();}
   if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location)return{url:parsed.toString(),status:response.status,contentType:response.headers.get('content-type'),body:null,error:'Redirect has no destination.'};if(redirect===3)return{url:parsed.toString(),status:response.status,contentType:response.headers.get('content-type'),body:null,error:'Too many redirects.'};const next=new URL(location,parsed);if(!['http:','https:'].includes(next.protocol)||next.origin!==expectedOrigin||next.username||next.password)return{url:parsed.toString(),status:response.status,contentType:response.headers.get('content-type'),body:null,error:'Cross-origin redirects are not followed.'};parsed=next;continue;}
   if(!response.ok)return{url:parsed.toString(),status:response.status,contentType:response.headers.get('content-type'),body:null,error:null};
   const body=await readLimited(response,512_000);return{url:parsed.toString(),status:response.status,contentType:response.headers.get('content-type'),body,error:null};
  }catch(e){return{url:parsed.toString(),status:null,contentType:null,body:null,error:e instanceof Error?e.message:'Related resource request failed.'};}
 }
 return{url:parsed.toString(),status:null,contentType:null,body:null,error:'Could not reach related resource.'};
}
// WHATWG URL canonicalizes [::ffff:127.0.0.1] to ::ffff:7f00:1, so an
// IPv4-mapped address reaches us in hex far more often than in dotted form.
// Decode the low 32 bits and judge them as IPv4; anything we cannot decode is
// treated as private, so an unfamiliar encoding fails closed rather than open.
export function mappedIPv4(ip:string):string|null{
  const match=/^::ffff:(?:0:)?(.+)$/.exec(ip);
  if(!match)return null;
  const tail=match[1];
  if(isIP(tail)===4)return tail;
  const hex=/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(tail);
  if(!hex)return null;
  const high=Number.parseInt(hex[1],16),low=Number.parseInt(hex[2],16);
  return `${(high>>8)&255}.${high&255}.${(low>>8)&255}.${low&255}`;
}

export function isPrivateAddress(address:string):boolean{
  if(isIP(address)===4){const [a,b]=address.split('.').map(Number);return a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===198&&(b===18||b===19));}
  const ip=address.toLowerCase();
  if(ip==='::'||ip==='::1'||ip.startsWith('fc')||ip.startsWith('fd')||/^fe[89ab]/.test(ip))return true;
  if(!ip.startsWith('::ffff:'))return false;
  const mapped=mappedIPv4(ip);
  return mapped===null?true:isPrivateAddress(mapped);
}
// Structural, so it accepts both the global Response and undici's: it only
// reads a header and streams the body.
type ReadableResponse={headers:{get(name:string):string|null};body:{getReader():{read():Promise<{done:boolean;value?:Uint8Array}>;cancel():Promise<unknown>;releaseLock():void}}|null};

async function readLimited(response:ReadableResponse,maxBytes:number){
  const length=Number(response.headers.get('content-length')||0);if(length>maxBytes)throw new Error('The page is too large to analyze (maximum 2 MB).');
  if(!response.body)return '';const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done||!value)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new Error('The page is too large to analyze (maximum 2 MB).');}chunks.push(value);}}finally{reader.releaseLock();}
  const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength;}return new TextDecoder().decode(all);
}
