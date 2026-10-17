#!/usr/bin/env node
// Reads a ShopifyQL result (the JSON a `FROM sessions ... GROUP BY` returns)
// and reports how much of it the Studio is allowed to learn from.
//
//   node scripts/traffic-audit.mjs sessions.json
//
// Recognises whichever of landing_page_url / referrer_source / referrer_name
// the query happened to select, so both the landing-page and the referrer
// groupings can be audited with the same tool.

import {readFileSync} from 'node:fs';
import {classifySession,summarize} from '../src/lib/traffic-quality.ts';

const file=process.argv[2];
if(!file){console.error('usage: traffic-audit.mjs <shopifyql-result.json>');process.exit(2);}

let payload;
try{payload=JSON.parse(readFileSync(file,'utf8'));}
catch(err){console.error(`cannot read ${file}: ${err.message}`);process.exit(2);}

const columns=(payload.columns||[]).map(c=>c.name);
const rows=payload.rows||[];
if(!columns.length||!rows.length){console.error('no columns or rows in result');process.exit(2);}

const at=name=>columns.indexOf(name);
const iUrl=at('landing_page_url'),iSource=at('referrer_source'),iName=at('referrer_name'),iSessions=at('sessions');
if(iSessions<0){console.error('result must SHOW sessions');process.exit(2);}
if(iUrl<0&&iSource<0&&iName<0){console.error('result must GROUP BY landing_page_url and/or referrer_source/referrer_name');process.exit(2);}

// Rows come back positional from the Shopify MCP tool and from ShopifyQL's own
// tableData.rowData, but an object keyed by column name is a plausible shape
// from another client. Read either, and never quietly treat an unreadable row
// as zero sessions - a silent zero here reads as "your traffic is clean".
const cell=(row,index,name)=>Array.isArray(row)?row[index]:row?.[name];

const parsed=rows.map(r=>({
 landingPageUrl:iUrl>=0?String(cell(r,iUrl,'landing_page_url')??''):'',
 referrerSource:iSource>=0?cell(r,iSource,'referrer_source')??null:null,
 referrerName:iName>=0?cell(r,iName,'referrer_name')??null:null,
 sessions:Number(cell(r,iSessions,'sessions')),
}));

const unreadable=parsed.filter(r=>!Number.isFinite(r.sessions)).length;
if(unreadable===parsed.length){
 console.error(`could not read a session count from any of ${parsed.length} rows - unexpected row shape`);
 process.exit(2);
}
if(unreadable){console.error(`warning: ${unreadable} of ${parsed.length} rows had no readable session count and were skipped`);}
for(const row of parsed)if(!Number.isFinite(row.sessions))row.sessions=0;

const report=summarize(parsed);
const pct=n=>`${(n*100).toFixed(1)}%`;

console.log(`\nsessions audited: ${report.total.toLocaleString()}`);
console.log(`learnable:        ${report.learnable.toLocaleString()} (${pct(report.total?report.learnable/report.total:0)})`);
console.log(`excluded:         ${report.excluded.toLocaleString()} (${pct(report.total?report.excluded/report.total:0)})\n`);
for(const row of report.byVerdict){
 console.log(`  ${row.learnable?'keep  ':'drop  '} ${row.verdict.padEnd(20)} ${String(row.sessions).padStart(8)}  ${pct(row.share).padStart(6)}`);
}

// Name the biggest excluded contributors so the operator can go fix the source
// rather than just admire the number.
const worst=parsed.map(r=>({row:r,cls:classifySession(r)})).filter(x=>!x.cls.learnable&&x.row.sessions>0)
 .sort((a,b)=>b.row.sessions-a.row.sessions).slice(0,10);
if(worst.length){
 console.log('\nlargest excluded sources:');
 for(const {row,cls} of worst){
  const label=row.referrerName||row.landingPageUrl||'(blank)';
  console.log(`  ${String(row.sessions).padStart(7)}  ${cls.verdict.padEnd(20)} ${label.slice(0,78)}`);
 }
}
console.log();
