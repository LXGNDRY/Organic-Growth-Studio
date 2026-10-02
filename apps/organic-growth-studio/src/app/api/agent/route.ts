import {NextResponse} from 'next/server';
import {store} from '@/lib/store';
import {validCadence} from '@/lib/autopilot';
export const runtime='nodejs';
export async function GET(){return NextResponse.json(await store.getAgentState())}
export async function PATCH(req:Request){
 try{const body=await req.json();const current=(await store.getAgentState()).config;const patch:{enabled?:boolean;cadenceHours?:number;nextRunAt?:string|null}={};
  if(body.enabled!==undefined){if(typeof body.enabled!=='boolean')return NextResponse.json({error:'enabled must be a boolean.'},{status:400});patch.enabled=body.enabled;patch.nextRunAt=body.enabled?new Date().toISOString():null;}
  if(body.cadenceHours!==undefined){if(typeof body.cadenceHours!=='number'||!validCadence(body.cadenceHours))return NextResponse.json({error:'Cadence must be 1, 3, 6, 12, or 24 hours.'},{status:400});patch.cadenceHours=body.cadenceHours;patch.nextRunAt=current.enabled?new Date().toISOString():null;}
  return NextResponse.json({config:await store.updateAgentConfig(patch)});
 }catch{return NextResponse.json({error:'Invalid autopilot settings.'},{status:400})}
}
