import { readFileSync } from 'node:fs';
import { evaluateLearning } from '../src/lib/gmail/learning-evaluation';

// Input is a private export of reviewed expenses and category metadata only.
// Run with the same Node transform/loader flags as the repository test command.
const path=process.argv[2];
if(!path)throw Error('Pass a private reviewed-transaction JSON export path.');
const data=JSON.parse(readFileSync(path,'utf8'));
const result=evaluateLearning(data.transactions,data.categories);
console.log(JSON.stringify(process.argv.includes('--details')?result:{...result,rows:undefined},null,2));
