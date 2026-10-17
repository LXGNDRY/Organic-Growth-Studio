import {NextRequest,NextResponse} from 'next/server';
import {store} from '@/lib/store';
import {attributeOrder,revenueByChannel,trackedLinkRevenue,type LinkKey,type OrderJourney} from '@/lib/attribution';
export const runtime='nodejs';

const MAX_ORDERS=5000;

export async function GET(){
 const rows=await store.listAttributions();
 return NextResponse.json({
  orders:rows.length,
  revenue:Number(rows.reduce((t:number,r)=>t+r.amount,0).toFixed(2)),
  byChannel:revenueByChannel(rows),
  byLink:trackedLinkRevenue(rows),
  attributions:rows,
 });
}

export async function POST(req:NextRequest){
 let body:unknown;
 try{body=await req.json();}catch{return NextResponse.json({error:'Body must be JSON.'},{status:400});}
 const orders=(body as {orders?:unknown})?.orders;
 if(!Array.isArray(orders))return NextResponse.json({error:'Body must be {"orders":[...]}.'},{status:400});
 if(orders.length>MAX_ORDERS)return NextResponse.json({error:`Refusing more than ${MAX_ORDERS} orders.`},{status:400});

 // Unlike the catalog, an empty order list is a legitimate answer: a shop can
 // genuinely have no orders in the window. It merges nothing rather than
 // clearing what is already attributed.
 const links:LinkKey[]=(await store.listAllLinks()).map(l=>({id:l.id,source:l.source,medium:l.medium,campaign:l.campaign,content:l.content}));
 const rows=(orders as OrderJourney[]).map(o=>attributeOrder(o,links));
 const total=await store.replaceAttributions(rows);
 const all=await store.listAttributions();
 return NextResponse.json({
  synced:rows.length,
  stored:total,
  linksConsidered:links.length,
  byChannel:revenueByChannel(all),
  byLink:trackedLinkRevenue(all),
 });
}
