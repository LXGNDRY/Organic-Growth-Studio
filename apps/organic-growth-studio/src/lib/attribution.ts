// Ties revenue back to the thing that earned it. Without this the engine can
// only count clicks, which is exactly the trap the shop's paid display spend
// is already in: 41,880 sessions, 12 orders, and no way to tell which effort
// produced which dollar.
//
// Shopify records a customer journey on each order, carrying the UTM
// parameters of the visit. A /go/ link mints those parameters, so an order
// whose journey carries a link's campaign is that link's order - first party,
// no pixel, no third party tag.

export type Utm={source?:string|null;medium?:string|null;campaign?:string|null;content?:string|null};
export type Visit={occurredAt?:string|null;source?:string|null;landingPage?:string|null;utmParameters?:Utm|null}|null|undefined;

export type OrderJourney={
 name?:string|null;
 createdAt?:string|null;
 amount?:string|number|null;
 currency?:string|null;
 momentsCount?:number|null;
 firstVisit?:Visit;
 lastVisit?:Visit;
 productHandles?:string[];
};

export type LinkKey={id:string;source:string;medium:string;campaign:string;content:string|null};

export type AttributionTouch='last-click'|'first-click'|'none';
export type RevenueChannel=
 |'tracked-link'   // the engine's own /go/ link
 |'ai-assistant'   // ChatGPT and peers citing the shop
 |'free-listing'   // Merchant Center Surfaces Across Google
 |'paid-click'
 |'referral'
 |'direct'
 |'internal'       // placed through Shopify admin, not a customer journey
 |'unknown';

export type OrderAttribution={
 order:string;
 createdAt:string|null;
 amount:number;
 currency:string|null;
 linkId:string|null;
 touch:AttributionTouch;
 channel:RevenueChannel;
 reason:string;
 productHandles:string[];
};

// Hosts that answer questions and cite shops. Kept explicit: this is the one
// channel in the shop's data that converts without being paid for, so it is
// named rather than folded into "referral".
const AI_ASSISTANTS=['chatgpt.com','chat.openai.com','perplexity.ai','claude.ai','copilot.microsoft.com','gemini.google.com'];
const PAID_CLICK_PARAMS=['gclid','gbraid','wbraid','dclid','msclkid'];
const PAID_MEDIUMS=new Set(['cpc','ppc','paid','paidsearch','paid_search','display','banner','retargeting']);

function amountOf(value:string|number|null|undefined):number{
 const n=Number(value);
 return Number.isFinite(n)&&n>=0?n:0;
}

function clean(value:string|null|undefined):string|null{
 const t=(value||'').trim().toLowerCase();
 return t||null;
}

// A link matches a visit when every parameter the link actually sets is
// present and equal on that visit. Campaign is required: without it any visit
// carrying the same generic source and medium would be credited to the link,
// which would hand the engine other channels' revenue.
export function visitMatchesLink(visit:Visit,link:LinkKey):boolean{
 const utm=visit?.utmParameters;
 if(!utm)return false;
 const campaign=clean(link.campaign);
 if(!campaign||clean(utm.campaign)!==campaign)return false;
 if(clean(link.source)&&clean(utm.source)!==clean(link.source))return false;
 if(clean(link.medium)&&clean(utm.medium)!==clean(link.medium))return false;
 if(clean(link.content)&&clean(utm.content)!==clean(link.content))return false;
 return true;
}

function hostOf(url:string|null|undefined):string|null{
 try{return new URL(url||'').hostname.toLowerCase();}catch{return null;}
}

function queryOf(url:string|null|undefined):URLSearchParams{
 try{return new URL(url||'').searchParams;}catch{return new URLSearchParams();}
}

export function classifyVisit(visit:Visit):{channel:RevenueChannel;reason:string}{
 if(!visit)return{channel:'unknown',reason:'no customer journey recorded'};
 const source=clean(visit.source);
 const utm=visit.utmParameters||{};
 const utmSource=clean(utm.source);
 const utmMedium=clean(utm.medium);

 // Orders created from the Shopify admin are the shop's own staff, not
 // discovery, and must never be credited to a channel.
 const sourceHost=hostOf(visit.source)||'';
 if(sourceHost==='admin.shopify.com'||sourceHost.endsWith('.shopify.com')&&sourceHost.startsWith('admin'))
  return{channel:'internal',reason:'placed through Shopify admin'};

 if(utmSource&&AI_ASSISTANTS.some(h=>utmSource===h||utmSource.endsWith(`.${h}`)))
  return{channel:'ai-assistant',reason:`cited by ${utmSource}`};

 // Checked before paid: Surfaces Across Google is the unpaid half of Merchant
 // Center and still stamps a gclid, so a naive paid test would misread it.
 if(clean(utm.campaign)==='sag_organic'||utmMedium==='product_sync')
  return{channel:'free-listing',reason:'Merchant Center free listing'};

 if(utmMedium&&PAID_MEDIUMS.has(utmMedium))return{channel:'paid-click',reason:`paid medium ${utmMedium}`};
 const paid=PAID_CLICK_PARAMS.find(p=>queryOf(visit.landingPage).has(p));
 if(paid)return{channel:'paid-click',reason:`purchased click parameter ${paid}`};

 if(source==='direct')return{channel:'direct',reason:'no referrer recorded'};
 if(source)return{channel:'referral',reason:`referred by ${source}`};
 return{channel:'unknown',reason:'no usable journey signal'};
}

export function attributeOrder(order:OrderJourney,links:LinkKey[]):OrderAttribution{
 const base={
  order:(order.name||'').trim()||'(unnamed)',
  createdAt:order.createdAt??null,
  amount:amountOf(order.amount),
  currency:order.currency??null,
  productHandles:Array.isArray(order.productHandles)?order.productHandles:[],
 };

 // Last click wins where both touches match a link: it is the visit that
 // carried the customer into the purchase.
 const last=links.find(l=>visitMatchesLink(order.lastVisit,l));
 if(last)return{...base,linkId:last.id,touch:'last-click',channel:'tracked-link',reason:`campaign ${last.campaign}`};
 const first=links.find(l=>visitMatchesLink(order.firstVisit,l));
 if(first)return{...base,linkId:first.id,touch:'first-click',channel:'tracked-link',reason:`campaign ${first.campaign}`};

 const visit=order.lastVisit||order.firstVisit||null;
 const {channel,reason}=classifyVisit(visit);
 return{...base,linkId:null,touch:'none',channel,reason};
}

export type RevenueByChannel={channel:RevenueChannel;orders:number;revenue:number}[];

export function revenueByChannel(rows:OrderAttribution[]):RevenueByChannel{
 const tally=new Map<RevenueChannel,{orders:number;revenue:number}>();
 for(const r of rows){
  const t=tally.get(r.channel)||{orders:0,revenue:0};
  t.orders++;t.revenue+=r.amount;
  tally.set(r.channel,t);
 }
 return [...tally.entries()].map(([channel,t])=>({channel,...t})).sort((a,b)=>b.revenue-a.revenue);
}

// Revenue the engine can claim, kept separate from everything else so a report
// can never imply the Studio earned a dollar some other channel produced.
export function trackedLinkRevenue(rows:OrderAttribution[]):{linkId:string;orders:number;revenue:number}[]{
 const tally=new Map<string,{orders:number;revenue:number}>();
 for(const r of rows){
  if(!r.linkId)continue;
  const t=tally.get(r.linkId)||{orders:0,revenue:0};
  t.orders++;t.revenue+=r.amount;
  tally.set(r.linkId,t);
 }
 return [...tally.entries()].map(([linkId,t])=>({linkId,...t})).sort((a,b)=>b.revenue-a.revenue);
}
