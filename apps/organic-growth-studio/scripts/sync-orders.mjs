#!/usr/bin/env node
// Pulls Shopify orders into the Studio and attributes their revenue, so the
// engine learns from dollars rather than clicks.
//
//   node scripts/sync-orders.mjs                  # last 60 days, live
//   node scripts/sync-orders.mjs --days 30
//   node scripts/sync-orders.mjs orders.json      # from a saved Admin API response
//   node scripts/sync-orders.mjs --dry-run
//
// Live pull needs SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN. A read_orders
// token only reaches the last 60 days, which is why that is the default; going
// further needs read_all_orders, which Shopify grants on request.
// Writing needs PUBLIC_BASE_URL (or STUDIO_URL) and APP_ACCESS_TOKEN.

import {readFileSync} from 'node:fs';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const args=process.argv.slice(2);
const dryRun=args.includes('--dry-run');
const daysArg=args.indexOf('--days');
const days=daysArg>=0?Number(args[daysArg+1]):60;
// Guard the -1 case: without --days, daysArg+1 is 0, which would skip a
// filename passed as the first argument and silently fall back to a live pull.
const daysValueIndex=daysArg>=0?daysArg+1:-1;
const file=args.find((a,i)=>!a.startsWith('--')&&i!==daysValueIndex);
const API_VERSION='2025-07';
const fail=(msg,code=1)=>{console.error(msg);process.exit(code);};

if(!Number.isFinite(days)||days<1||days>730)fail('--days must be between 1 and 730',2);
// Shopify caps read_orders at the last 60 days. Beyond that it returns what it
// is allowed to and says nothing, so a 90-day request would quietly report a
// 60-day answer as if it covered 90.
const ORDER_SCOPE_DAYS=60;
if(days>ORDER_SCOPE_DAYS&&!file)
 console.error(`note: ${days} days requested. A read_orders token only reaches ${ORDER_SCOPE_DAYS} days`
  +` and Shopify truncates silently, so this needs read_all_orders to be complete.`);

const QUERY=`query($after:String,$q:String){orders(first:50,after:$after,query:$q,sortKey:CREATED_AT,reverse:true){
 pageInfo{hasNextPage endCursor}
 nodes{name createdAt
  totalPriceSet{shopMoney{amount currencyCode}}
  netPaymentSet{shopMoney{amount}}
  customerJourneySummary{momentsCount{count}
   firstVisit{occurredAt source landingPage utmParameters{source medium campaign content}}
   lastVisit{occurredAt source landingPage utmParameters{source medium campaign content}}}
  lineItems(first:25){nodes{product{handle}}}}}}`;

// Flattens Shopify's nesting into the shape src/lib/attribution.ts reads.
const toJourney=n=>({
 name:n?.name??null,
 createdAt:n?.createdAt??null,
 amount:n?.totalPriceSet?.shopMoney?.amount??null,
 netAmount:n?.netPaymentSet?.shopMoney?.amount??null,
 currency:n?.totalPriceSet?.shopMoney?.currencyCode??null,
 momentsCount:n?.customerJourneySummary?.momentsCount?.count??null,
 firstVisit:n?.customerJourneySummary?.firstVisit??null,
 lastVisit:n?.customerJourneySummary?.lastVisit??null,
 productHandles:[...new Set((n?.lineItems?.nodes||[]).map(li=>li?.product?.handle).filter(Boolean))],
});

async function fetchLive(){
 const domain=process.env.SHOPIFY_STORE_DOMAIN?.trim();
 const token=process.env.SHOPIFY_ADMIN_TOKEN?.trim();
 if(!domain||!token)fail('live sync needs SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN,\nor pass a saved Admin API response: sync-orders.mjs orders.json',2);
 const since=new Date(Date.now()-days*86400000).toISOString().slice(0,10);
 const nodes=[];
 let after=null,page=0;
 while(page++<60){
  const res=await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`,{
   method:'POST',
   headers:{'content-type':'application/json','x-shopify-access-token':token},
   body:JSON.stringify({query:QUERY,variables:{after,q:`created_at:>=${since}`}}),
   signal:AbortSignal.timeout(30000),
  });
  if(!res.ok)fail(`Shopify returned ${res.status} ${res.statusText}`);
  const body=await res.json();
  if(body.errors?.length)fail(`Shopify GraphQL errors: ${JSON.stringify(body.errors)}`);
  const orders=body.data?.orders;
  if(!orders)fail('unexpected response: no data.orders');
  nodes.push(...(orders.nodes||[]));
  process.stderr.write(`  fetched ${nodes.length} orders\r`);
  if(!orders.pageInfo?.hasNextPage){process.stderr.write('\n');return nodes;}
  after=orders.pageInfo.endCursor;
 }
 fail('stopped after 60 pages - pagination did not terminate');
}

function fromFile(path){
 let payload;
 try{payload=JSON.parse(readFileSync(path,'utf8'));}
 catch(err){fail(`cannot read ${path}: ${err.message}`,2);}
 const nodes=payload?.data?.orders?.nodes??payload?.orders?.nodes??payload?.nodes??(Array.isArray(payload)?payload:null);
 if(!Array.isArray(nodes))fail('could not find an order node array in that file',2);
 return nodes;
}

async function postToStudio(orders){
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
 const res=await fetch(`${base}/api/attribution`,{
  method:'POST',headers:{'content-type':'application/json',origin:base,cookie},
  body:JSON.stringify({orders}),signal:AbortSignal.timeout(120000),
 });
 const body=await res.json().catch(()=>({}));
 if(!res.ok)fail(`attribution sync failed: ${res.status} ${body.error||res.statusText}`);
 return body;
}

const nodes=file?fromFile(file):await fetchLive();
const orders=nodes.map(toJourney);
console.log(`\norders read: ${orders.length}`);

if(dryRun){
 const gross=orders.reduce((t,o)=>t+(Number(o.amount)||0),0);
 const net=orders.reduce((t,o)=>t+(Number(o.netAmount??o.amount)||0),0);
 console.log(`gross:       ${gross.toFixed(2)}`);
 console.log(`net of refunds: ${net.toFixed(2)}`);
 console.log(`no journey:  ${orders.filter(o=>!o.firstVisit&&!o.lastVisit).length}`);
 console.log('\ndry run - nothing written\n');
 process.exit(0);
}

const result=await postToStudio(orders);
console.log(`synced:      ${result.synced}   stored: ${result.stored}   links considered: ${result.linksConsidered}\n`);
console.log('revenue by channel (net of refunds):');
for(const c of result.byChannel||[])console.log(`  ${c.channel.padEnd(15)} ${String(c.orders).padStart(4)} orders  ${c.revenue.toFixed(2)}`);
console.log('\nrevenue the engine earned:');
if(!(result.byLink||[]).length)console.log('  none yet - no order carried a tracked link');
for(const l of result.byLink||[])console.log(`  ${l.linkId}  ${l.orders} orders  ${l.revenue.toFixed(2)}`);
console.log();
