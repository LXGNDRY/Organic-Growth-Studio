import {createHash} from 'node:crypto';
import {analyzeUrl, type Analysis} from '@/lib/analyzer';
import {rankActions} from '@/lib/adaptive';
import {mapConcurrent} from '@/lib/concurrency';
import {store} from '@/lib/store';

const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,24);
const allowedCadences=[1,3,6,12,24];
const DEFAULT_SCAN_CONCURRENCY=3;
const MAX_SCAN_CONCURRENCY=8;

function scanConcurrency(){
 const configured=Number(process.env.AUTOPILOT_MAX_CONCURRENCY);
 if(!Number.isInteger(configured)||configured<1)return DEFAULT_SCAN_CONCURRENCY;
 return Math.min(configured,MAX_SCAN_CONCURRENCY);
}

export async function runAutonomousCycle(){
 const startedAt=new Date().toISOString();
 const {config}=await store.getAgentState();
 if(!config.enabled)return {skipped:true,reason:'Autopilot is paused.'};

 const projects=await store.listProjects();
 const analysisJobs=new Map<string,Promise<Analysis>>();
 const result=await mapConcurrent(projects,scanConcurrency(),async(row)=>{
  try{
   const project=await store.getProject(row.id);
   if(!project)return {analysesSaved:0,experimentsCreated:0,draftsCreated:0,linksCreated:0,skipped:1,note:null as string|null};

   // Multiple project records can point at the same page. Share one network scan
   // within this cycle while still saving a project-specific analysis record.
   const scanKey=project.targetUrl;
   let analysisJob=analysisJobs.get(scanKey);
   if(!analysisJob){analysisJob=analyzeUrl(scanKey);analysisJobs.set(scanKey,analysisJob);}
   const analysis=await analysisJob;
   await store.addAnalysis(project.id,analysis);

   const signature=digest({url:analysis.url,title:analysis.title,description:analysis.description,headings:analysis.headings,findings:analysis.findings.map(f=>[f.id,f.impact]),wordCount:analysis.wordCount,imageCount:analysis.imageCount,imagesWithoutAlt:analysis.imagesWithoutAlt});
   const recommendation=rankActions(project.experiments,analysis)[0];
   if(!recommendation)return {analysesSaved:1,experimentsCreated:0,draftsCreated:0,linksCreated:0,skipped:1,note:null as string|null};

   const experimentSignature=digest([signature,'experiment',recommendation.action]);
   if(await store.agentEventExists(project.id,experimentSignature))return {analysesSaved:1,experimentsCreated:0,draftsCreated:0,linksCreated:0,skipped:1,note:null as string|null};

   const hypothesis=`The current page scan indicates an opportunity for “${recommendation.title.toLowerCase()}”. Test this action against the page's current baseline and record sales, engagement, and search usefulness after a consistent measurement window.`;
   await store.addExperiment({projectId:project.id,action:recommendation.action,title:`Autopilot: ${recommendation.title}`,hypothesis,features:recommendation.features});
   await store.addAgentEvent({projectId:project.id,signature:experimentSignature,kind:'experiment',title:recommendation.title});

   let linksCreated=0,draftsCreated=0;
   if(recommendation.action==='tracked_distribution'){
    const linkSignature=digest([signature,'link',recommendation.action]);
    if(!(await store.agentEventExists(project.id,linkSignature))){
     await store.addLink({projectId:project.id,url:analysis.url,source:'signal_autopilot',medium:'organic',campaign:`discovery-${signature}`,content:'recommended-test'});
     await store.addAgentEvent({projectId:project.id,signature:linkSignature,kind:'link',title:'Prepared a tagged organic distribution link'});
     linksCreated++;
    }
   }

   if(['educational_content','visual_content','short_video'].includes(recommendation.action)){
    const draftSignature=digest([signature,'draft',recommendation.action]);
    if(!(await store.agentEventExists(project.id,draftSignature))){
     const subject=analysis.title||analysis.headings[0]||analysis.host;
     const observed=analysis.headings.length?`Observed page headings (source text, not independently fact-checked):\n${analysis.headings.map(x=>`- ${x}`).join('\n')}`:'No page headings were detected; confirm the subject before use.';
     const claims=project.allowedClaims?.length?`Owner-provided facts to recheck before use:\n${project.allowedClaims.map((x:string)=>`- ${x}`).join('\n')}`:'No owner-provided claims are on file. Do not assert product-specific facts without adding and checking an approved source.';
     await store.addDraft({projectId:project.id,channel:'Website',format:recommendation.action==='educational_content'?'FAQ article':recommendation.action==='short_video'?'Short video script':'Collection intro',title:`Draft: ${recommendation.title} — ${subject}`,body:`Purpose: prepare an original asset that answers a real visitor question and points naturally to the target page.\n\n${observed}\n\n${claims}\n\nEditorial guardrails: verify every product, material, fit, price, availability, and performance claim before publishing. Do not invent details. Add useful original information; avoid keyword stuffing. Review and edit before publishing.\n\nAutopilot recommendation: ${recommendation.reason}`,destination:analysis.url});
     await store.addAgentEvent({projectId:project.id,signature:draftSignature,kind:'draft',title:recommendation.title});
     draftsCreated++;
    }
   }

   return {analysesSaved:1,experimentsCreated:1,draftsCreated,linksCreated,skipped:0,note:null as string|null};
  }catch(error){
   return {analysesSaved:0,experimentsCreated:0,draftsCreated:0,linksCreated:0,skipped:0,note:`${row.name}: ${error instanceof Error?error.message:'unexpected scan failure'}`};
  }
 });

 const totals=result.reduce((sum,item)=>({
  analysesSaved:sum.analysesSaved+item.analysesSaved,
  experimentsCreated:sum.experimentsCreated+item.experimentsCreated,
  draftsCreated:sum.draftsCreated+item.draftsCreated,
  linksCreated:sum.linksCreated+item.linksCreated,
  skipped:sum.skipped+item.skipped,
 }),{analysesSaved:0,experimentsCreated:0,draftsCreated:0,linksCreated:0,skipped:0});
 const notes=result.flatMap(item=>item.note?[item.note]:[]);
 const finishedAt=new Date().toISOString();
 const status=notes.length?(totals.analysesSaved?'partial':'failed'):'complete';
 await store.addAgentRun({startedAt,finishedAt,projectsChecked:projects.length,...totals,status,notes});
 const latest=(await store.getAgentState()).config;
 await store.updateAgentConfig({nextRunAt:latest.enabled?new Date(Date.now()+(allowedCadences.includes(latest.cadenceHours)?latest.cadenceHours:6)*3600000).toISOString():null});
 return {startedAt,finishedAt,projectsChecked:projects.length,...totals,status,notes};
}

export function validCadence(value:number){return allowedCadences.includes(value);}
