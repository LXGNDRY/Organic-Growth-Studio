// Ranks promotable products so the engine chooses its own targets.
//
// This is a COLD START ranker, not a model. The Studio's adaptive model needs
// completed experiments before it can rank anything, and the shop has none
// yet; until it does, something has to decide which of 80 promotable products
// to work on first. Once experiments accumulate the model supersedes this.
//
// Signals were chosen by looking at what the shop's data can actually
// support, not by what would sound thorough. Measured across its 80
// promotable products:
//
//   inventory          median 90,597, max 359,999,962 - print-on-demand
//                      placeholders, not stock. Used ONLY as the
//                      out-of-stock gate in catalog.ts, never scored.
//   descriptionLength  every product 3,946-10,767 characters. No variation,
//                      so it separates nothing.
//   seoDescription     present on 80 of 80. Same.
//
// What remains is four signals that genuinely differ between products, and
// scoring on anything else would be inventing precision the data cannot back.

import type {CatalogProduct} from '@/lib/catalog';
import type {OrderAttribution} from '@/lib/attribution';

export type ScoreFactor={name:string;value:number;weight:number;note:string};
export type ProductScore={
 handle:string;
 title:string;
 url:string|null;
 score:number;
 revenue:number;
 factors:ScoreFactor[];
 reasons:string[];
};

// Deliberate starting weights, not fitted ones - there is no outcome data to
// fit against yet. The ordering encodes one judgement: the engine must be able
// to say something specific and true about a product before anything else
// matters. The shop's 86 existing blog articles are generic and earn roughly
// 1.5 search visits each per month; content that cannot cite a real fabric
// weight reads the same way.
const WEIGHTS={claimable:0.35,value:0.30,proven:0.25,seoGap:0.10} as const;

const clamp01=(n:number)=>Math.min(1,Math.max(0,n));

/** Net revenue per product handle. Refunded money is already excluded upstream. */
export function revenueByHandle(attributions:OrderAttribution[]):Map<string,number>{
 const byHandle=new Map<string,number>();
 for(const row of attributions){
  // An order's net value is not split across its line items: doing so would
  // need per-item revenue Shopify reports separately. Each handle in the
  // order is credited the order's value, so this is "revenue from orders
  // containing this product", which is what a promotion decision needs.
  for(const handle of row.productHandles||[]){
   if(!handle)continue;
   byHandle.set(handle,(byHandle.get(handle)||0)+row.amount);
  }
 }
 return byHandle;
}

export function scoreCatalog(products:CatalogProduct[],attributions:OrderAttribution[]):ProductScore[]{
 const targets=products.filter(p=>p.promotable);
 if(!targets.length)return [];

 const revenue=revenueByHandle(attributions);
 const prices=targets.map(p=>p.price).filter((v):v is number=>typeof v==='number');
 const minPrice=prices.length?Math.min(...prices):0;
 const maxPrice=prices.length?Math.max(...prices):0;
 const priceSpread=maxPrice-minPrice;
 const topRevenue=Math.max(0,...[...revenue.values()]);

 return targets.map(product=>{
  const reasons:string[]=[];

  // Revenue per conversion, relative to this catalog rather than an absolute
  // scale: a $70 item is the shop's top end even though it is not expensive.
  const price=typeof product.price==='number'?product.price:minPrice;
  const value=priceSpread>0?clamp01((price-minPrice)/priceSpread):0.5;
  if(price===maxPrice&&priceSpread>0)reasons.push(`highest price in the catalog at ${price}`);

  // Already converts. Scaled against the best performer so one strong product
  // does not flatten the rest to zero.
  const earned=revenue.get(product.handle)||0;
  const proven=topRevenue>0?clamp01(earned/topRevenue):0;
  if(earned>0)reasons.push(`earned ${earned.toFixed(2)} net in the attributed window`);

  // Can the engine write something specific and true? A stated fabric weight
  // is this shop's core product claim and the one fact its content can anchor
  // on without inventing anything.
  const claimable=product.gsm!==null?1:0;
  if(!claimable)reasons.push('no stated GSM, so content cannot cite a fabric weight');

  // Cheap unrealised upside: Shopify falls back to the raw product title,
  // which is rarely what a customer searches for.
  const seoGap=product.seoTitle?0:1;
  if(seoGap)reasons.push('no SEO title set');

  const factors:ScoreFactor[]=[
   {name:'claimable',value:claimable,weight:WEIGHTS.claimable,note:claimable?`states ${product.gsm}gsm`:'no stated fabric weight'},
   {name:'value',value:value,weight:WEIGHTS.value,note:`price ${price} of ${minPrice}-${maxPrice}`},
   {name:'proven',value:proven,weight:WEIGHTS.proven,note:earned>0?`${earned.toFixed(2)} net attributed`:'no attributed revenue yet'},
   {name:'seoGap',value:seoGap,weight:WEIGHTS.seoGap,note:seoGap?'SEO title missing':'SEO title set'},
  ];
  const score=factors.reduce((total,f)=>total+f.value*f.weight,0);

  if(!reasons.length)reasons.push('solid on every signal, no single standout');
  return{handle:product.handle,title:product.title,url:product.url,score:Number(score.toFixed(4)),revenue:earned,factors,reasons};
 }).sort((a,b)=>b.score-a.score||a.handle.localeCompare(b.handle));
}

export type TargetReport={
 scored:number;
 skipped:number;
 usingRevenueFrom:number;
 targets:ProductScore[];
};

export function targetReport(products:CatalogProduct[],attributions:OrderAttribution[],limit=20):TargetReport{
 const targets=scoreCatalog(products,attributions);
 return{
  scored:targets.length,
  skipped:products.length-targets.length,
  usingRevenueFrom:attributions.length,
  targets:targets.slice(0,Math.max(0,limit)),
 };
}
