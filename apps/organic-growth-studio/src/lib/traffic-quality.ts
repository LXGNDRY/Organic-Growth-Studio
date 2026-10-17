// Storefront sessions are not all evidence. A live Shopify shop records its
// owner's dev server, theme previews, paid clicks and ad-network placements
// in the same stream as real organic discovery. Anything that learns from the
// raw stream learns from all of it, so every session is classified before it
// reaches the model and only `learnable` verdicts are allowed to count.

export type TrafficVerdict=
 |'local-dev'            // the shop's own development server
 |'store-preview'        // Shopify theme preview or dev-store sessions
 |'free-listing'         // Merchant Center free product listings (Surfaces Across Google)
 |'paid-click'           // arrived on a purchased click
 |'ad-network'           // display/syndication placement
 |'unverified-referral'  // referrer Shopify could not classify
 |'unattributed'         // no referrer at all - Shopify's "direct"
 |'organic';             // search or social on a real storefront host

export type TrafficClass={verdict:TrafficVerdict;reason:string;learnable:boolean};
export type SessionRow={landingPageUrl:string;referrerSource?:string|null;referrerName?:string|null;sessions?:number};

// Only verdicts that represent a person finding the shop through a source the
// Studio can credit. `free-listing` qualifies: Surfaces Across Google is the
// unpaid half of Merchant Center and is exactly the discovery the Studio
// exists to grow. `unattributed` does not: a session with no referrer cannot
// tell the model which action earned it, and on this shop it is also where
// the dev-server and bot traffic lands.
const LEARNABLE=new Set<TrafficVerdict>(['free-listing','organic']);

// Click identifiers that only appear on a purchased click. `gad_source` and
// `gad_campaignid` are deliberately absent: Google stamps both onto FREE
// Shopping listings too, so treating them as paid would discard real organic
// product discovery.
const PAID_CLICK_PARAMS=['gclid','gbraid','wbraid','dclid','msclkid','ttclid','twclid'];

// Networks that resell placements rather than refer visitors. Named only where
// the operator is unambiguous from the referrer itself; every other
// unclassifiable referrer becomes `unverified-referral` for human review
// rather than being guessed at here.
const AD_NETWORKS=new Set(['googlesyndication','syndicatedsearch','taboola','taboolanews','outbrain','mgid','revcontent']);

// Organic is an allow-list, never a fall-through. An earlier revision ended
// with `return organic` for anything it had not already matched, so a session
// Shopify reported as source "unknown" with no referrer name - the exact
// traffic this module exists to quarantine - came back learnable. Unrecognised
// sources must fail closed.
const ORGANIC_SOURCES=new Set(['search','social','referral']);

function hostOf(url:string):string|null{
 try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol))return null;return u.hostname.toLowerCase().replace(/^\[|\]$/g,'');}catch{return null;}
}

function isLocalHost(host:string):boolean{
 if(host==='localhost'||host==='::1'||host.endsWith('.localhost'))return true;
 if(/^127\./.test(host)||/^10\./.test(host)||/^192\.168\./.test(host))return true;
 if(/^172\.(1[6-9]|2\d|3[01])\./.test(host))return true;
 return false;
}

function isPreviewHost(host:string):boolean{
 return host.endsWith('.shopifypreview.com')||host.endsWith('.myshopify.dev');
}

function params(url:string):URLSearchParams{
 try{return new URL(url).searchParams;}catch{return new URLSearchParams();}
}

export function classifySession(row:SessionRow):TrafficClass{
 const decide=(verdict:TrafficVerdict,reason:string):TrafficClass=>({verdict,reason,learnable:LEARNABLE.has(verdict)});
 const host=hostOf(row.landingPageUrl);
 // Host wins over every query marker: a gclid on a loopback URL is a developer
 // replaying a paid landing page, not a customer.
 if(host&&isLocalHost(host))return decide('local-dev',`loopback or private host ${host}`);
 if(host&&isPreviewHost(host))return decide('store-preview',`preview host ${host}`);

 const query=params(row.landingPageUrl);
 const source=(row.referrerSource||'').trim().toLowerCase();
 const name=(row.referrerName||'').trim().toLowerCase();

 // Checked before the paid test because these carry a gclid despite being free.
 if(query.get('utm_content')==='sag_organic'||query.get('utm_medium')==='product_sync')
  return decide('free-listing','Merchant Center free listing markers');

 if(source==='paid')return decide('paid-click',`referrer source ${source}`);
 const paid=PAID_CLICK_PARAMS.find(p=>query.has(p));
 if(paid)return decide('paid-click',`purchased click parameter ${paid}`);

 if(AD_NETWORKS.has(name))return decide('ad-network',`known ad network ${name}`);
 if(ORGANIC_SOURCES.has(source))return decide('organic',`referrer source ${source}`);
 if(source==='unknown')return decide('unverified-referral',name?`unclassified referrer ${name}`:'unclassified referrer source');
 if(source&&source!=='direct')return decide('unverified-referral',`unrecognised referrer source ${source}`);

 return decide('unattributed','no referrer to credit');
}

export type TrafficReport={
 total:number;
 learnable:number;
 excluded:number;
 byVerdict:{verdict:TrafficVerdict;sessions:number;share:number;learnable:boolean}[];
};

// Sessions are weighted by their count so a report reflects traffic, not rows.
export function summarize(rows:SessionRow[]):TrafficReport{
 const tally=new Map<TrafficVerdict,number>();
 let total=0,learnable=0;
 for(const row of rows){
  const weight=Number.isFinite(row.sessions)?Math.max(0,Math.trunc(row.sessions as number)):1;
  if(weight===0)continue;
  const cls=classifySession(row);
  tally.set(cls.verdict,(tally.get(cls.verdict)||0)+weight);
  total+=weight;
  if(cls.learnable)learnable+=weight;
 }
 const byVerdict=[...tally.entries()]
  .map(([verdict,sessions])=>({verdict,sessions,share:total?sessions/total:0,learnable:LEARNABLE.has(verdict)}))
  .sort((a,b)=>b.sessions-a.sessions);
 return{total,learnable,excluded:total-learnable,byVerdict};
}
