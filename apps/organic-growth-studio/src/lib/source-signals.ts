import {JSDOM} from 'jsdom';

export type FeedCandidate={url:string;type:string};
export type ResourceResult={url:string;status:number|null;contentType:string|null;body:string|null;error:string|null};

export function discoverFeeds(doc:Document,pageUrl:string):FeedCandidate[]{
 const base=new URL(pageUrl);const supported=new Set(['application/rss+xml','application/atom+xml','application/feed+json','application/json']);const found:FeedCandidate[]=[];
 for(const link of doc.querySelectorAll('link[rel~="alternate"][type][href]')){
  const type=(link.getAttribute('type')||'').split(';')[0].trim().toLowerCase();if(!supported.has(type))continue;
  try{const u=new URL(link.getAttribute('href')!,base);if(!['http:','https:'].includes(u.protocol)||u.origin!==base.origin||u.username||u.password)continue;found.push({url:u.toString(),type});}catch{}
 }
 return [...new Map(found.map(x=>[x.url,x])).values()].slice(0,3);
}

export function inspectJsonLd(doc:Document){
 const types=new Set<string>();let blocks=0,parseErrors=0;
 const visit=(value:unknown,depth=0)=>{if(depth>32||value===null||typeof value!=='object')return;if(Array.isArray(value)){for(const x of value)visit(x,depth+1);return;}const obj=value as Record<string,unknown>;const t=obj['@type'];for(const item of Array.isArray(t)?t:[t])if(typeof item==='string')types.add(item);for(const [key,child]of Object.entries(obj))if(key==='@graph'||key==='mainEntity'||key==='itemListElement'||typeof child==='object')visit(child,depth+1);};
 for(const script of doc.querySelectorAll('script[type="application/ld+json"]')){blocks++;try{visit(JSON.parse(script.textContent||''));}catch{parseErrors++;}}
 return{blocks,types:[...types].sort().slice(0,30),parseErrors};
}

export function parseRobots(text:string,targetUrl:string):{sitemaps:string[];targetAllowed:boolean|null}{
 const groups:{agents:string[];rules:{allow:boolean;path:string}[]}[]=[];let agents:string[]=[];let rules:{allow:boolean;path:string}[]=[];
 const flush=()=>{if(agents.length||rules.length)groups.push({agents,rules});agents=[];rules=[];};
 for(const raw of text.split(/\r?\n/)){const line=raw.replace(/#.*/, '').trim();if(!line)continue;const split=line.indexOf(':');if(split<0)continue;const name=line.slice(0,split).trim().toLowerCase(),value=line.slice(split+1).trim();if(name==='user-agent'){if(rules.length)flush();agents.push(value.toLowerCase());}else if(name==='allow'||name==='disallow'){if(!agents.length)continue;if(name==='allow'||value)rules.push({allow:name==='allow',path:value});}}
 flush();
 const sitemaps=[...new Set(text.split(/\r?\n/).map(line=>line.replace(/#.*/, '').trim()).filter(line=>/^sitemap\s*:/i.test(line)).map(line=>line.slice(line.indexOf(':')+1).trim()).filter(Boolean))].slice(0,5);
 const applicable=groups.filter(g=>g.agents.includes('*')).flatMap(g=>g.rules);if(!applicable.length||applicable.some(rule=>rule.path.includes('*')||rule.path.includes('$')))return{sitemaps,targetAllowed:null};
 const url=new URL(targetUrl);const path=url.pathname+url.search;const matching=applicable.filter(rule=>path.startsWith(rule.path)).sort((a,b)=>b.path.length-a.path.length);if(!matching.length)return{sitemaps,targetAllowed:true};
 const longest=matching[0].path.length;const tied=matching.filter(x=>x.path.length===longest);return{sitemaps,targetAllowed:tied.some(x=>x.allow)};
}

export function inspectSitemap(xml:string,targetUrl:string){
 try{const doc=new JSDOM(xml,{contentType:'application/xml'}).window.document;const root=doc.documentElement?.localName.toLowerCase();const locs=[...doc.getElementsByTagName('loc')].map(x=>x.textContent?.trim()||'').filter(Boolean);const target=new URL(targetUrl);const targetKey=`${target.hostname}${target.pathname.replace(/\/$/,'')}`;const containsTarget=locs.some(value=>{try{const u=new URL(value);return`${u.hostname}${u.pathname.replace(/\/$/,'')}`===targetKey}catch{return false}});return{kind:root==='sitemapindex'?'index':root==='urlset'?'urlset':'unknown',urlCount:root==='urlset'?locs.length:null,sitemapCount:root==='sitemapindex'?locs.length:null,containsTarget:root==='urlset'?containsTarget:null,valid:root==='urlset'||root==='sitemapindex'};}catch{return{kind:'invalid',urlCount:null,sitemapCount:null,containsTarget:null,valid:false};}
}

export function countFeedItems(body:string,type:string){
 try{if(type==='application/feed+json'||type==='application/json'){const value=JSON.parse(body);return Array.isArray(value.items)?value.items.length:null;}const doc=new JSDOM(body,{contentType:'application/xml'}).window.document;const root=doc.documentElement?.localName.toLowerCase();if(root==='rss')return doc.getElementsByTagName('item').length;if(root==='feed')return doc.getElementsByTagName('entry').length;return null;}catch{return null;}
}
