import {NextRequest,NextResponse} from 'next/server';
import {store} from '@/lib/store';
import {summarizeCatalog,toCatalogProduct,type ShopifyProductNode} from '@/lib/catalog';
export const runtime='nodejs';

// Guards a hand-made or looping request from replacing the catalog with
// something the shop could never contain.
const MAX_PRODUCTS=5000;

export async function GET(){
 const catalog=await store.listCatalog();
 return NextResponse.json({catalog,summary:summarizeCatalog(catalog)});
}

export async function POST(req:NextRequest){
 let body:unknown;
 try{body=await req.json();}catch{return NextResponse.json({error:'Body must be JSON.'},{status:400});}
 const nodes=(body as {products?:unknown})?.products;
 if(!Array.isArray(nodes))return NextResponse.json({error:'Body must be {"products":[...]}.'},{status:400});
 if(nodes.length>MAX_PRODUCTS)return NextResponse.json({error:`Refusing more than ${MAX_PRODUCTS} products.`},{status:400});
 // An empty list would silently wipe the engine's entire target list, so it is
 // rejected rather than obeyed: a failed Shopify fetch must not look like an
 // empty shop.
 if(!nodes.length)return NextResponse.json({error:'Refusing to replace the catalog with an empty list.'},{status:400});

 const ingestedAt=new Date().toISOString();
 const products=nodes.map(n=>toCatalogProduct(n as ShopifyProductNode,ingestedAt)).filter(p=>p!==null);
 if(!products.length)return NextResponse.json({error:'No product had a handle or id.'},{status:400});

 const written=await store.replaceCatalog(products);
 const catalog=await store.listCatalog();
 return NextResponse.json({written,skipped:nodes.length-products.length,summary:summarizeCatalog(catalog)});
}
