import {NextResponse} from 'next/server';
import {store} from '@/lib/store';
import {buildAgentConfigPatch} from '@/lib/agent-settings';
export const runtime='nodejs';
export async function GET(){return NextResponse.json(await store.getAgentState())}
export async function PATCH(req:Request){
 let body:unknown;
 try{body=await req.json()}catch{return NextResponse.json({error:'Invalid autopilot settings.'},{status:400})}
 const current=(await store.getAgentState()).config;
 const result=buildAgentConfigPatch(body,current);
 if(!result.ok)return NextResponse.json({error:result.error},{status:400});
 return NextResponse.json({config:await store.updateAgentConfig(result.patch)});
}
