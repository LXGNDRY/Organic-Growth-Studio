// The engine can only promote what a customer can actually reach. The shop's
// 126 products include drafts and unlisted items that return nothing useful to
// a visitor, so every product carries an explicit promotable verdict and the
// reason behind it. Nothing downstream is allowed to infer that from status
// alone: an ACTIVE product with no storefront URL is still unreachable.

export type ProductStatus='ACTIVE'|'DRAFT'|'ARCHIVED'|'UNLISTED'|'UNKNOWN';
export type PromotableReason=
 |'promotable'
 |'not-published'      // no storefront URL a visitor could open
 |'draft'
 |'archived'
 |'unlisted'           // reachable by direct link, absent from search and collections
 |'out-of-stock';

export type CatalogProduct={
 id:string;
 handle:string;
 title:string;
 status:ProductStatus;
 url:string|null;
 price:number|null;
 currency:string|null;
 gsm:number|null;
 inventory:number|null;
 seoTitle:string|null;
 seoDescription:string|null;
 descriptionLength:number;
 promotable:boolean;
 reason:PromotableReason;
 ingestedAt:string;
};

// Shopify's Admin API shape, as the products query returns it. Every field is
// optional because a partial selection is normal and must not throw.
export type ShopifyProductNode={
 id?:string|null;
 handle?:string|null;
 title?:string|null;
 status?:string|null;
 onlineStoreUrl?:string|null;
 totalInventory?:number|null;
 descriptionHtml?:string|null;
 seo?:{title?:string|null;description?:string|null}|null;
 priceRangeV2?:{minVariantPrice?:{amount?:string|number|null;currencyCode?:string|null}|null}|null;
};

const STATUSES=new Set<ProductStatus>(['ACTIVE','DRAFT','ARCHIVED','UNLISTED']);

export function normalizeStatus(value:string|null|undefined):ProductStatus{
 const upper=(value||'').trim().toUpperCase() as ProductStatus;
 return STATUSES.has(upper)?upper:'UNKNOWN';
}

// Grams per square metre is the shop's core product claim and appears only in
// free text - "| 460GSM", "460 GSM", "460gsm". It is read from the title and
// SEO fields, never invented: a product with no stated GSM gets null so that
// content built from this catalog cannot assert a weight the shop never
// published.
export function parseGsm(...sources:(string|null|undefined)[]):number|null{
 for(const source of sources){
  if(!source)continue;
  const match=/(\d{2,4})\s*gsm\b/i.exec(source);
  if(!match)continue;
  const value=Number(match[1]);
  // Garment weights outside this band are a parse artefact, not a claim.
  if(value>=80&&value<=900)return value;
 }
 return null;
}

function parsePrice(value:string|number|null|undefined):number|null{
 if(value===null||value===undefined||value==='')return null;
 const amount=Number(value);
 return Number.isFinite(amount)&&amount>=0?amount:null;
}

function judge(status:ProductStatus,url:string|null,inventory:number|null):{promotable:boolean;reason:PromotableReason}{
 if(status==='ARCHIVED')return{promotable:false,reason:'archived'};
 if(status==='DRAFT')return{promotable:false,reason:'draft'};
 // Checked before UNLISTED: an unlisted product that still serves a URL is
 // reachable by a link the engine mints, which is exactly how the engine works.
 if(!url)return{promotable:false,reason:status==='UNLISTED'?'unlisted':'not-published'};
 if(inventory!==null&&inventory<=0)return{promotable:false,reason:'out-of-stock'};
 return{promotable:true,reason:'promotable'};
}

export function toCatalogProduct(node:ShopifyProductNode,ingestedAt:string):CatalogProduct|null{
 const handle=(node.handle||'').trim();
 const id=(node.id||'').trim();
 // A product with neither identifier cannot be linked to or deduplicated.
 if(!handle&&!id)return null;
 const status=normalizeStatus(node.status);
 const url=(node.onlineStoreUrl||'').trim()||null;
 const inventory=Number.isFinite(node.totalInventory as number)?Number(node.totalInventory):null;
 const seoTitle=(node.seo?.title||'').trim()||null;
 const seoDescription=(node.seo?.description||'').trim()||null;
 const title=(node.title||'').trim();
 const {promotable,reason}=judge(status,url,inventory);
 return{
  id:id||handle,
  handle,
  title,
  status,
  url,
  price:parsePrice(node.priceRangeV2?.minVariantPrice?.amount),
  currency:(node.priceRangeV2?.minVariantPrice?.currencyCode||'').trim()||null,
  gsm:parseGsm(title,seoTitle,seoDescription),
  inventory,
  seoTitle,
  seoDescription,
  descriptionLength:(node.descriptionHtml||'').length,
  promotable,
  reason,
  ingestedAt,
 };
}

export type CatalogSummary={
 total:number;
 promotable:number;
 withGsm:number;
 missingSeoTitle:number;
 byReason:{reason:PromotableReason;count:number}[];
};

export function summarizeCatalog(products:CatalogProduct[]):CatalogSummary{
 const tally=new Map<PromotableReason,number>();
 for(const p of products)tally.set(p.reason,(tally.get(p.reason)||0)+1);
 return{
  total:products.length,
  promotable:products.filter(p=>p.promotable).length,
  withGsm:products.filter(p=>p.gsm!==null).length,
  missingSeoTitle:products.filter(p=>!p.seoTitle).length,
  byReason:[...tally.entries()].map(([reason,count])=>({reason,count})).sort((a,b)=>b.count-a.count),
 };
}

// Later ingests replace earlier ones for the same product rather than stacking,
// keyed on handle where there is one so a re-ingest after a Shopify ID change
// does not duplicate the row.
export function mergeCatalog(products:CatalogProduct[]):CatalogProduct[]{
 const byKey=new Map<string,CatalogProduct>();
 for(const p of products)byKey.set(p.handle||p.id,p);
 return [...byKey.values()].sort((a,b)=>a.title.localeCompare(b.title));
}
