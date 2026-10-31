/** Explicit opt-in smoke only. Uses synthetic public data; never reads the DB.
 * The key stays in the deployment environment and no response/body is logged. */
import {createRequire,registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const hook=registerHooks({resolve(s,c,n){return n(s==='next/server'?pathToFileURL(require.resolve('next/server.js')).href:s,c);}});
try {
  const {generateAIInsights}=await import('../src/lib/ai/gemini.ts');
  const {buildAIFacts}=await import('../src/lib/ai/facts.ts');
  const {buildCategorySeed}=await import('../src/lib/domain/categories.ts');
  const transactions=[
    ['synthetic-old','2026-09-25',90000,'Zomato','dining.delivery'],
    ['synthetic-current','2026-10-25',120000,'Zomato','dining.delivery'],
    ['synthetic-tea','2026-10-26',10000,'Tea Post','dining.tea'],
    ['synthetic-shopping','2026-10-27',50000,'Amazon','shopping'],
  ].map(([id,date,amount,merchant,categoryId])=>({id,date,type:'EXPENSE',amount,merchant,categoryId,description:'Synthetic test purchase',accountId:'synthetic-bank',contexts:[],source:'manual',createdAt:date,updatedAt:date}));
  const context=buildAIFacts({transactions,categories:buildCategorySeed(),accounts:[{id:'synthetic-bank',name:'Synthetic account',type:'BANK',openingBalance:0,isActive:true,createdAt:'2026-01-01'}],month:'2026-10-24',cycleStartDay:24,now:new Date('2026-10-31T08:00:00Z')});
  const result=await generateAIInsights('synthetic-provider-smoke',context,'overview');
  console.log(`AI provider smoke PASS: ${result.insights.length} validated insights; synthetic data only; ${result.model}.`);
} catch(error) {
  console.error(`AI provider smoke FAILED: ${typeof error?.code==='string'?error.code:'unexpected'}. No financial data was used.`);
  process.exitCode=1;
} finally {hook.deregister();}
