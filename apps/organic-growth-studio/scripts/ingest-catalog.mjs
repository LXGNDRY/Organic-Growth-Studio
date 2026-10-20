#!/usr/bin/env node
// Pulls the Shopify catalog into a running Studio so the engine has a real
// target list instead of one hand-made project.
//
//   node scripts/ingest-catalog.mjs                 # live from Shopify
//   node scripts/ingest-catalog.mjs products.json   # from a saved Admin API response
//   node scripts/ingest-catalog.mjs --dry-run       # read and report, write nothing
//
// Writes over HTTP rather than touching the store file directly, because the
// Studio runs in a container with its own DATA_DIR: a local file write would
// never reach the instance actually serving the engine.
//
// Needs, for a live pull: SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN (a
// custom-app Admin API token with read_products).
// Needs, to write: PUBLIC_BASE_URL (or STUDIO_URL) and APP_ACCESS_TOKEN.

import {readFileSync} from 'node:fs';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const args=process.argv.slice(2);
const dryRun=args.includes('--dry-run');
const file=args.find(a=>!a.startsWith('--'));
const API_VERSION='2025-07';
const fail=(msg,code=1)=>{console.error(msg);process.exit(code);};

const QUERY=`query($after:String){products(first:50,after:$after){pageInfo{hasNextPage endCursor}nodes{
 id handle title status onlineStoreUrl totalInventory descriptionHtml
 seo{title description}
 priceRangeV2{minVariantPrice{amount currencyCode}}}}}`;

async function fetchLive(){
 const domain=process.env.SHOPIFY_STORE_DOMAIN?.trim();
 const token=process.env.SHOPIFY_ADMIN_TOKEN?.trim();
 if(!domain||!token)fail('live ingest needs SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN,\nor pass a saved Admin API response: ingest-catalog.mjs products.json',2);
 const nodes=[];
 let after=null,page=0;
 // Bounded so a pagination bug cannot loop forever against the shop's API.
 while(page++<40){
  const res=await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`,{
   method:'POST',
   headers:{'content-type':'application/json','x-shopify-access-token':token},
   body:JSON.stringify({query:QUERY,variables:{after}}),
   signal:AbortSignal.timeout(30000),
  });
  if(!res.ok)fail(`Shopify returned ${res.status} ${res.statusText}`);
  const body=await res.json();
  if(body.errors?.length)fail(`Shopify GraphQL errors: ${JSON.stringify(body.errors)}`);
  const products=body.data?.products;
  if(!products)fail('unexpected response: no data.products');
  nodes.push(...(products.nodes||[]));
  process.stderr.write(`  fetched ${nodes.length} products\r`);
  if(!products.pageInfo?.hasNextPage){process.stderr.write('\n');return nodes;}
  after=products.pageInfo.endCursor;
 }
 fail('stopped after 40 pages - pagination did not terminate');
}

// One saved page of a paginated response, or several. An ingest REPLACES the
// catalog, so accepting a truncated file would silently delete every product
// past the last page it contains - a saved first page of 50 would cut a
// 126-product shop down to 50 targets and report success.
function pageOf(value){
 const products=value?.data?.products??value?.products??null;
 const nodes=products?.nodes??value?.nodes??(Array.isArray(value)?value:null);
 if(!Array.isArray(nodes))return null;
 return{nodes,hasNextPage:products?.pageInfo?.hasNextPage===true};
}

function fromFile(path){
 let payload;
 try{payload=JSON.parse(readFileSync(path,'utf8'));}
 catch(err){fail(`cannot read ${path}: ${err.message}`,2);}

 // An array of page responses is treated as the pages in order, so saved
 // pages can be combined; a bare array of product nodes stays a single page.
 const pages=Array.isArray(payload)&&payload.every(v=>v&&typeof v==='object'&&!Array.isArray(v)&&(v.data?.products||v.products||v.nodes))
  ? payload.map(pageOf)
  : [pageOf(payload)];

 if(pages.some(p=>p===null))fail('could not find a product node array in that file',2);
 const last=pages[pages.length-1];
 if(last.hasNextPage)fail(
  `that response ends with pageInfo.hasNextPage = true, so it is only part of the catalog.\n`+
  `An ingest replaces the catalog, so importing it would drop every product past this page.\n`+
  `Run a live ingest, or save each page and pass them as a JSON array of responses.`,2);
 return pages.flatMap(p=>p.nodes);
}

async function writeToStudio(products){
 const base=(process.env.STUDIO_URL||process.env.PUBLIC_BASE_URL||'').trim().replace(/\/$/,'');
 const token=process.env.APP_ACCESS_TOKEN?.trim();
 if(!base||!token)fail('writing needs PUBLIC_BASE_URL (or STUDIO_URL) and APP_ACCESS_TOKEN',2);

 const login=await fetch(`${base}/api/auth/login`,{
  method:'POST',headers:{'content-type':'application/json',origin:base},
  body:JSON.stringify({token}),signal:AbortSignal.timeout(20000),
 });
 if(!login.ok)fail(`sign-in failed: ${login.status} ${login.statusText}`);
 const cookie=(login.headers.getSetCookie?.()||[]).map(c=>c.split(';')[0]).join('; ');
 if(!cookie)fail('sign-in returned no session cookie');

 const res=await fetch(`${base}/api/catalog`,{
  method:'POST',headers:{'content-type':'application/json',origin:base,cookie},
  body:JSON.stringify({products}),signal:AbortSignal.timeout(120000),
 });
 const body=await res.json().catch(()=>({}));
 if(!res.ok)fail(`catalog write failed: ${res.status} ${body.error||res.statusText}`);
 return body;
}

const nodes=file?fromFile(file):await fetchLive();
if(!nodes.length)fail('no products returned - refusing to replace the catalog with nothing');

if(dryRun){
 console.log(`\nproducts read: ${nodes.length}`);
 const live=nodes.filter(n=>n.onlineStoreUrl).length;
 const byStatus=new Map();
 for(const n of nodes)byStatus.set(n.status||'UNKNOWN',(byStatus.get(n.status||'UNKNOWN')||0)+1);
 console.log(`with a storefront URL: ${live}`);
 for(const [status,count] of [...byStatus].sort((a,b)=>b[1]-a[1]))console.log(`  ${String(status).padEnd(10)} ${String(count).padStart(4)}`);
 console.log('\ndry run - nothing written\n');
 process.exit(0);
}

const result=await writeToStudio(nodes);
const s=result.summary||{};
console.log(`\nwritten:           ${result.written}${result.skipped?`  (${result.skipped} skipped: no handle or id)`:''}`);
console.log(`promotable:        ${s.promotable}`);
console.log(`stated GSM:        ${s.withGsm}`);
console.log(`missing SEO title: ${s.missingSeoTitle}\n`);
for(const {reason,count} of s.byReason||[]){
 console.log(`  ${reason==='promotable'?'target':'skip  '} ${reason.padEnd(16)} ${String(count).padStart(4)}`);
}
console.log();
