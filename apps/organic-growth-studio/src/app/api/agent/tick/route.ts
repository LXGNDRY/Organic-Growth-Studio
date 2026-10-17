import {NextResponse} from 'next/server';
import {runAutonomousCycle} from '@/lib/autopilot';
export const runtime='nodejs';
let running=false;
export async function POST(req:Request){
 const token=process.env.AUTOPILOT_TOKEN;
 if(!token||req.headers.get('authorization')!==`Bearer ${token}`)return NextResponse.json({error:'Unauthorized.'},{status:401});
 if(running)return NextResponse.json({error:'An autopilot cycle is already running.'},{status:409});
 running=true;try{return NextResponse.json(await runAutonomousCycle())}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Autopilot cycle failed.'},{status:500})}finally{running=false}
}
