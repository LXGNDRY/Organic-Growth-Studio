import {NextRequest,NextResponse} from 'next/server';
import {store} from '@/lib/store';
import {normalizeTargetUrl} from '@/lib/url';
const channels=['Pinterest','TikTok','Instagram','YouTube Shorts','Website'];
const formats=['Pin concept','Short video script','Caption','FAQ article','Collection intro'];
export const runtime='nodejs';
export async function GET(_:NextRequest,{params}:{params:Promise<{id:string}>}){const {id}=await params;return NextResponse.json({drafts:await store.listDrafts(id)});}
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;const b=await req.json();if(!channels.includes(b.channel)||!formats.includes(b.format))return NextResponse.json({error:'Unsupported channel or format.'},{status:400});if(typeof b.title!=='string'||typeof b.body!=='string'||b.title.length>180||b.body.length>6000)return NextResponse.json({error:'Draft fields are missing or too long.'},{status:400});const project=await store.getProject(id);if(!project)return NextResponse.json({error:'Project not found.'},{status:404});const destination=b.destination?normalizeTargetUrl(b.destination):project.targetUrl;const draft=await store.addDraft({projectId:id,channel:b.channel,format:b.format,title:b.title,body:b.body,destination});return NextResponse.json({draft},{status:201});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not save draft.'},{status:400});}}
