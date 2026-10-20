import {NextRequest,NextResponse} from 'next/server';
import {store} from '@/lib/store';
import {targetReport} from '@/lib/scoring';
export const runtime='nodejs';

const DEFAULT_LIMIT=20;
const MAX_LIMIT=200;

export async function GET(req:NextRequest){
 const raw=Number(req.nextUrl.searchParams.get('limit'));
 const limit=Number.isInteger(raw)&&raw>0?Math.min(raw,MAX_LIMIT):DEFAULT_LIMIT;
 const [catalog,attributions]=await Promise.all([store.listCatalog(),store.listAttributions()]);
 // Says so rather than returning an empty list that reads like "no good
 // targets exist" when the real answer is "nothing has been ingested yet".
 if(!catalog.length)return NextResponse.json({error:'No catalog ingested. Run pnpm catalog:ingest first.'},{status:409});
 return NextResponse.json(targetReport(catalog,attributions,limit));
}
