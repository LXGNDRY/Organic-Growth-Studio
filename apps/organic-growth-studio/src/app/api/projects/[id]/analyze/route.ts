import {NextRequest,NextResponse} from 'next/server';
import {store} from '@/lib/store';
import {analyzeUrl} from '@/lib/analyzer';
export const runtime='nodejs';
export async function POST(_:NextRequest,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;const project=await store.getProject(id);if(!project)return NextResponse.json({error:'Project not found.'},{status:404});const result=await analyzeUrl(project.targetUrl);const saved=await store.addAnalysis(id,result);return NextResponse.json({analysis:{id:saved.id,...result}});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not analyze this page.'},{status:422});}}
