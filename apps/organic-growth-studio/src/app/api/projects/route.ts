import {NextRequest,NextResponse} from 'next/server';
import {store} from '@/lib/store';
import {normalizeTargetUrl} from '@/lib/url';
export const runtime='nodejs';
export async function GET(){return NextResponse.json({projects:await store.listProjects()});}
export async function POST(req:NextRequest){try{const b=await req.json();if(typeof b.name!=='string'||b.name.trim().length<2||b.name.length>80) return NextResponse.json({error:'Project name must be 2–80 characters.'},{status:400});const targetUrl=normalizeTargetUrl(b.targetUrl);const project=await store.createProject({name:b.name.trim(),targetUrl,goal:typeof b.goal==='string'?b.goal:'qualified_visits'});return NextResponse.json({project},{status:201});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Invalid project.'},{status:400});}}
