import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {mergeCatalog, type CatalogProduct} from '@/lib/catalog';
import type {OrderAttribution} from '@/lib/attribution';

// sourceHandle marks a project the autopilot created from the catalog. Null
// means the owner made it by hand, which keeps it outside catalog targeting
// entirely. lastTargetedAt drives the cooldown.
export type Project={id:string;name:string;targetUrl:string;goal:string;ownershipAttestedAt:string|null;allowedClaims:string[];sourceHandle:string|null;lastTargetedAt:string|null;createdAt:string;updatedAt:string};
export type StoredAnalysis={id:string;projectId:string;payload:unknown;createdAt:string};
export type Draft={id:string;projectId:string;channel:string;format:string;title:string;body:string;destination:string;status:'draft'|'approved'|'archived';createdAt:string;updatedAt:string};
export type TrackingLink={id:string;projectId:string;url:string;source:string;medium:string;campaign:string;content:string|null;createdAt:string};
export type EventRecord={id:string;projectId:string;event:string;pagePath:string;source:string;medium:string;campaign:string;day:string;count:number};
export type Experiment={id:string;projectId:string;action:string;title:string;hypothesis:string;features:number[];status:'planned'|'running'|'completed';outcomes:{sales:number;engagement:number;search:number}|null;createdAt:string;updatedAt:string};
export type AgentRun={id:string;startedAt:string;finishedAt:string;projectsChecked:number;analysesSaved:number;experimentsCreated:number;draftsCreated:number;linksCreated:number;skipped:number;status:'complete'|'partial'|'failed';notes:string[]};
export type AgentConfig={enabled:boolean;cadenceHours:number;nextRunAt:string|null;lastRunAt:string|null};
type AgentEvent={id:string;projectId:string;signature:string;kind:string;title:string;createdAt:string};
type State={projects:Project[];analyses:StoredAnalysis[];drafts:Draft[];links:TrackingLink[];events:EventRecord[];experiments:Experiment[];agentConfig:AgentConfig;agentEvents:AgentEvent[];agentRuns:AgentRun[];catalog:CatalogProduct[];attributions:OrderAttribution[]};
const dataDir=process.env.DATA_DIR?path.resolve(process.env.DATA_DIR):path.join(process.cwd(),'data');
const file=path.join(dataDir,'store.json');
let pending=Promise.resolve();
async function read():Promise<State>{try{const s=JSON.parse(await fs.readFile(file,'utf8')) as Partial<State>;return{projects:(s.projects??[]).map(p=>({...p,ownershipAttestedAt:p.ownershipAttestedAt??null,allowedClaims:Array.isArray(p.allowedClaims)?p.allowedClaims:[],sourceHandle:p.sourceHandle??null,lastTargetedAt:p.lastTargetedAt??null})),analyses:s.analyses??[],drafts:s.drafts??[],links:s.links??[],events:s.events??[],experiments:s.experiments??[],agentConfig:s.agentConfig??{enabled:true,cadenceHours:6,nextRunAt:null,lastRunAt:null},agentEvents:s.agentEvents??[],agentRuns:s.agentRuns??[],catalog:s.catalog??[],attributions:s.attributions??[]}}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return{projects:[],analyses:[],drafts:[],links:[],events:[],experiments:[],agentConfig:{enabled:true,cadenceHours:6,nextRunAt:null,lastRunAt:null},agentEvents:[],agentRuns:[],catalog:[],attributions:[]};throw e}}
async function write(s:State){await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});const temp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(s,null,2),{encoding:'utf8',mode:0o600,flag:'wx'});await fs.rename(temp,file)}
async function mutate<T>(fn:(s:State)=>T|Promise<T>):Promise<T>{let resolve!:()=>void;const previous=pending;pending=new Promise<void>(r=>resolve=r);await previous;try{const s=await read();const result=await fn(s);await write(s);return result}finally{resolve()}}
export const store={
 async listProjects(){const s=await read();const counts=new Map<string,{analyses:number;drafts:number}>();for(const p of s.projects)counts.set(p.id,{analyses:0,drafts:0});for(const a of s.analyses){const c=counts.get(a.projectId);if(c)c.analyses++;}for(const d of s.drafts){const c=counts.get(d.projectId);if(c)c.drafts++;}return [...s.projects].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(p=>({...p,_count:counts.get(p.id)!}))},
 async createProject(v:Pick<Project,'name'|'targetUrl'|'goal'>&Partial<Pick<Project,'sourceHandle'|'lastTargetedAt'>>){return mutate(s=>{const now=new Date().toISOString();const p={id:randomUUID(),sourceHandle:null,lastTargetedAt:null,...v,ownershipAttestedAt:null,allowedClaims:[],createdAt:now,updatedAt:now};s.projects.push(p);return p})},
 // Stamped when the autopilot works a catalog target, so the cooldown can
 // tell "never worked" from "worked recently".
 async markTargeted(id:string,at=new Date().toISOString()){return mutate(s=>{const p=s.projects.find(x=>x.id===id);if(!p)return null;p.lastTargetedAt=at;return p})},
 async updateProject(id:string,v:Partial<Pick<Project,'name'|'targetUrl'|'goal'|'ownershipAttestedAt'|'allowedClaims'>>){return mutate(s=>{const p=s.projects.find(x=>x.id===id);if(!p)return null;for(const [k,val] of Object.entries(v))if(val!==undefined)Object.assign(p,{[k]:val});p.updatedAt=new Date().toISOString();return p})},
 async getProject(id:string){const s=await read();const project=s.projects.find(p=>p.id===id);if(!project)return null;return{...project,analyses:s.analyses.filter(x=>x.projectId===id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,10),drafts:s.drafts.filter(x=>x.projectId===id).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),links:s.links.filter(x=>x.projectId===id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),experiments:s.experiments.filter(x=>x.projectId===id).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))}},
 async deleteProject(id:string){return mutate(s=>{s.projects=s.projects.filter(p=>p.id!==id);s.analyses=s.analyses.filter(x=>x.projectId!==id);s.drafts=s.drafts.filter(x=>x.projectId!==id);s.links=s.links.filter(x=>x.projectId!==id);s.events=s.events.filter(x=>x.projectId!==id);s.experiments=s.experiments.filter(x=>x.projectId!==id);s.agentEvents=s.agentEvents.filter(x=>x.projectId!==id)})},
 async hasProject(id:string){return(await read()).projects.some(p=>p.id===id)},
 async addAnalysis(projectId:string,payload:unknown){return mutate(s=>{const a={id:randomUUID(),projectId,payload,createdAt:new Date().toISOString()};s.analyses.push(a);const p=s.projects.find(x=>x.id===projectId);if(p)p.updatedAt=new Date().toISOString();return a})},
 async listDrafts(projectId:string){return(await read()).drafts.filter(x=>x.projectId===projectId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))},
 async addDraft(v:Omit<Draft,'id'|'status'|'createdAt'|'updatedAt'>){return mutate(s=>{const now=new Date().toISOString();const d={id:randomUUID(),...v,status:'draft' as const,createdAt:now,updatedAt:now};s.drafts.push(d);return d})},
 async updateDraft(id:string,v:Partial<Pick<Draft,'channel'|'format'|'title'|'body'|'destination'|'status'>>){return mutate(s=>{const d=s.drafts.find(x=>x.id===id);if(!d)return null;Object.assign(d,v,{updatedAt:new Date().toISOString()});return d})},
 async deleteDraft(id:string){return mutate(s=>{const before=s.drafts.length;s.drafts=s.drafts.filter(d=>d.id!==id);return s.drafts.length<before})},
 async setDraftStatus(id:string,status:Draft['status']){return mutate(s=>{const d=s.drafts.find(x=>x.id===id);if(!d)return null;d.status=status;d.updatedAt=new Date().toISOString();return d})},
 async listLinks(projectId:string){return(await read()).links.filter(x=>x.projectId===projectId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))},
 async getLink(id:string){return(await read()).links.find(x=>x.id===id)??null},
 async addLink(v:Omit<TrackingLink,'id'|'createdAt'>){return mutate(s=>{const row={id:randomUUID(),...v,createdAt:new Date().toISOString()};s.links.push(row);return row})},
 async recordEvent(v:Omit<EventRecord,'id'|'count'>){return mutate(s=>{const key=[v.projectId,v.event,v.pagePath,v.source,v.medium,v.campaign,v.day].join('|');const existing=s.events.find(e=>[e.projectId,e.event,e.pagePath,e.source,e.medium,e.campaign,e.day].join('|')===key);if(existing){existing.count++;return existing}const e={id:randomUUID(),...v,count:1};s.events.push(e);return e})},
 async listEvents(projectId:string,days=30){const since=new Date(Date.now()-days*86400000).toISOString().slice(0,10);return(await read()).events.filter(e=>e.projectId===projectId&&e.day>=since)},
 async listExperiments(projectId:string){return(await read()).experiments.filter(x=>x.projectId===projectId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))},
 async addExperiment(v:Omit<Experiment,'id'|'status'|'outcomes'|'createdAt'|'updatedAt'>){return mutate(s=>{const now=new Date().toISOString();const e={id:randomUUID(),...v,status:'planned' as const,outcomes:null,createdAt:now,updatedAt:now};s.experiments.push(e);return e})},
 async updateExperiment(id:string,v:Partial<Pick<Experiment,'status'|'outcomes'>>){return mutate(s=>{const e=s.experiments.find(x=>x.id===id);if(!e)return null;Object.assign(e,v,{updatedAt:new Date().toISOString()});return e})},
 async getAgentState(){const s=await read();return{config:s.agentConfig,runs:s.agentRuns.slice(-30).reverse()}},
 async updateAgentConfig(v:Partial<AgentConfig>){return mutate(s=>{s.agentConfig={...s.agentConfig,...v};return s.agentConfig})},
 async agentEventExists(projectId:string,signature:string){return(await read()).agentEvents.some(x=>x.projectId===projectId&&x.signature===signature)},
 async addAgentEvent(v:Omit<AgentEvent,'id'|'createdAt'>){return mutate(s=>{const r={id:randomUUID(),...v,createdAt:new Date().toISOString()};s.agentEvents.push(r);return r})},
 async addAgentRun(v:Omit<AgentRun,'id'>){return mutate(s=>{const r={id:randomUUID(),...v};s.agentRuns.push(r);s.agentRuns=s.agentRuns.slice(-100);s.agentConfig.lastRunAt=r.finishedAt;return r})},
 // Links across every project: attribution matches an order's UTM parameters
 // against all of them, because an order knows nothing about project scoping.
 async listAllLinks(){return [...(await read()).links]},
 async listAttributions(){return [...(await read()).attributions]},
 // Keyed on order name so re-running a sync over an overlapping window
 // updates each order in place instead of double-counting its revenue.
 async replaceAttributions(rows:OrderAttribution[]){return mutate(s=>{const byOrder=new Map(s.attributions.map(r=>[r.order,r]));for(const r of rows)byOrder.set(r.order,r);s.attributions=[...byOrder.values()].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));return s.attributions.length})},
 async listCatalog(){return [...(await read()).catalog]},
 async listPromotableCatalog(){return (await read()).catalog.filter(p=>p.promotable)},
 // An ingest replaces the catalog wholesale rather than appending: a product
 // pulled from the shop and then unpublished must disappear from the engine's
 // target list, which an upsert-only merge would never do.
 async replaceCatalog(products:CatalogProduct[]){return mutate(s=>{s.catalog=mergeCatalog(products);return s.catalog.length})},
 async recordClick(id:string){return mutate(s=>{const link=s.links.find(x=>x.id===id);if(!link)return null;const day=new Date().toISOString().slice(0,10),pagePath=new URL(link.url).pathname;const e=s.events.find(x=>x.projectId===link.projectId&&x.event==='outbound_click'&&x.pagePath===pagePath&&x.source===link.source&&x.medium===link.medium&&x.campaign===link.campaign&&x.day===day);if(e)e.count++;else s.events.push({id:randomUUID(),projectId:link.projectId,event:'outbound_click',pagePath,source:link.source,medium:link.medium,campaign:link.campaign,day,count:1});return link})}
};
