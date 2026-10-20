// Decides which catalog products the autonomous cycle works on this run.
//
// Three numbers govern it, and they exist because an unbounded version of this
// is not a feature but an incident: every selected target is a network fetch
// against the owner's own storefront, repeated on every cycle, forever.
//
//   perCycle      how many catalog products a single cycle may take on
//   cooldownDays  how long before the same product can be selected again
//   maxProjects   a ceiling on catalog-created projects, so a catalog that
//                 grows unexpectedly cannot grow the workload without bound
//
// At the shop's 6-hour cadence, perCycle 3 is 12 slots a day, so its 80
// promotable products are all picked up within about a week. After that the
// cooldown is what binds: 80 products over 14 days is roughly 6 eligible a
// day, well inside the 12 available, so the cycle settles into revisiting
// each product about every two weeks rather than hammering any of them.
//
// Projects the owner made by hand are never governed by this. They are theirs,
// they are worked every cycle as before, and nothing here reaches them.

import type {CatalogProduct} from '@/lib/catalog';
import type {OrderAttribution} from '@/lib/attribution';
import {scoreCatalog,type ProductScore} from '@/lib/scoring';

export type TargetingLimits={perCycle:number;cooldownDays:number;maxProjects:number};
export const DEFAULT_LIMITS:TargetingLimits={perCycle:3,cooldownDays:14,maxProjects:200};

/** The subset of a stored project this module needs, so tests need no store. */
export type ProjectLike={id:string;targetUrl:string;sourceHandle?:string|null;lastTargetedAt?:string|null};

export type Selection={
 product:ProductScore;
 /** An existing catalog project to reuse, or null when one must be created. */
 projectId:string|null;
};

export type TargetingPlan={
 selected:Selection[];
 /** Why nothing more was taken, for the cycle's run notes. */
 notes:string[];
};

function readLimit(name:string,fallback:number,max:number):number{
 const raw=Number(process.env[name]);
 if(!Number.isInteger(raw)||raw<1)return fallback;
 return Math.min(raw,max);
}

// Env overrides are clamped, not trusted: a typo that turns 3 into 300 would
// otherwise point three hundred fetches a cycle at the owner's storefront.
export function limitsFromEnv():TargetingLimits{
 return{
  perCycle:readLimit('AUTOPILOT_TARGETS_PER_CYCLE',DEFAULT_LIMITS.perCycle,10),
  cooldownDays:readLimit('AUTOPILOT_TARGET_COOLDOWN_DAYS',DEFAULT_LIMITS.cooldownDays,365),
  maxProjects:readLimit('AUTOPILOT_MAX_CATALOG_PROJECTS',DEFAULT_LIMITS.maxProjects,1000),
 };
}

export function planTargets(
 catalog:CatalogProduct[],
 attributions:OrderAttribution[],
 projects:ProjectLike[],
 now:number,
 limits:TargetingLimits=DEFAULT_LIMITS,
):TargetingPlan{
 const notes:string[]=[];
 if(!catalog.length)return{selected:[],notes:['No catalog ingested, so no catalog targets were selected.']};

 const catalogProjects=projects.filter(p=>typeof p.sourceHandle==='string'&&p.sourceHandle);
 if(catalogProjects.length>=limits.maxProjects){
  return{selected:[],notes:[`Catalog projects are at the ${limits.maxProjects} ceiling; no new targets were taken.`]};
 }

 const byHandle=new Map(catalogProjects.map(p=>[p.sourceHandle as string,p]));
 // A URL the owner already tracks by hand is theirs. Selecting it would create
 // a second project for the same page and double its scans every cycle.
 const manualUrls=new Set(projects.filter(p=>!p.sourceHandle).map(p=>p.targetUrl));

 const cooldownMs=limits.cooldownDays*86400000;
 const ranked=scoreCatalog(catalog,attributions);
 const selected:Selection[]=[];
 let onCooldown=0,alreadyManual=0;

 for(const product of ranked){
  if(selected.length>=limits.perCycle)break;
  if(catalogProjects.length+selected.filter(s=>!s.projectId).length>=limits.maxProjects)break;
  if(product.url&&manualUrls.has(product.url)){alreadyManual++;continue;}

  const existing=byHandle.get(product.handle);
  if(existing){
   const last=existing.lastTargetedAt?Date.parse(existing.lastTargetedAt):Number.NaN;
   // An unreadable or missing timestamp means it has never been worked under
   // this scheme, so it is due rather than permanently skipped.
   if(Number.isFinite(last)&&now-last<cooldownMs){onCooldown++;continue;}
   selected.push({product,projectId:existing.id});
   continue;
  }
  selected.push({product,projectId:null});
 }

 if(selected.length)notes.push(`Selected ${selected.length} catalog target${selected.length===1?'':'s'} from ${ranked.length} promotable.`);
 else notes.push(`No catalog target was eligible from ${ranked.length} promotable.`);
 if(onCooldown)notes.push(`${onCooldown} skipped inside the ${limits.cooldownDays}-day cooldown.`);
 if(alreadyManual)notes.push(`${alreadyManual} skipped because a hand-made project already tracks that page.`);
 return{selected,notes};
}
