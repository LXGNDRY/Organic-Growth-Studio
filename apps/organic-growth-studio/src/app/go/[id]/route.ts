import {NextRequest,NextResponse} from 'next/server';
import {store} from '@/lib/store';
export const runtime='nodejs';
export async function GET(_:NextRequest,{params}:{params:Promise<{id:string}>}){const {id}=await params;const link=(await store.getLink(id));if(!link)return new NextResponse('Tracked link not found',{status:404});await store.recordClick(id);return NextResponse.redirect(link.url,302);}
