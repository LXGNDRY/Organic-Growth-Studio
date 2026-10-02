import nextEnv from '@next/env';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

nextEnv.loadEnvConfig(process.cwd());
if(!process.env.AUTOPILOT_TOKEN){console.error('Set AUTOPILOT_TOKEN in .env.local before starting the personal runner.');process.exit(1)}

const port=String(process.env.PORT||3010);
const base=(process.env.AUTOPILOT_BASE_URL||'http://127.0.0.1:'+port).replace(/\/$/,'');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-H','127.0.0.1','-p',port],{stdio:'inherit',env:process.env});
let stopping=false,ticking=false;

async function stop(){if(stopping)return;stopping=true;server.kill('SIGTERM');process.exit(0)}
process.on('SIGINT',stop);
process.on('SIGTERM',stop);
server.on('exit',code=>{if(!stopping)process.exit(code??1)});

console.log('Personal app starting at '+base+'; the autopilot checks every 30 seconds.');
while(!stopping){
 try{
  if(!ticking){
   const response=await fetch(base+'/api/agent',{signal:AbortSignal.timeout(3000)});
   if(response.ok){
    const state=await response.json();
    const due=state.config?.enabled&&(!state.config.nextRunAt||Date.parse(state.config.nextRunAt)<=Date.now());
    if(due){
     ticking=true;
     try{
      const result=await fetch(base+'/api/agent/tick',{method:'POST',headers:{authorization:'Bearer '+process.env.AUTOPILOT_TOKEN},signal:AbortSignal.timeout(180000)});
      console.log('Autopilot cycle: '+result.status+' '+await result.text());
     }finally{ticking=false}
    }
   }
  }
 }catch(e){if(!stopping)console.log('Autopilot waiting for app: '+(e instanceof Error?e.message:'connection error'))}
 await delay(30_000);
}
