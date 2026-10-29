import { diningBusiness, recognizedMerchants } from './merchant-recognition';

interface SubcategoryEvidence { categoryId:string; parentId:string; reason:string; mealEligible:boolean }
/** Shared by Gmail and quick entry. Category evidence never changes financial identity. */
export function automaticSubcategory(text:string):SubcategoryEvidence|undefined {
  const value=text.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const known=recognizedMerchants(text);
  if(known.length>1)return;
  const name=known[0]?.name;
  const result=(categoryId:string,reason:string,mealEligible=false):SubcategoryEvidence=>({categoryId,parentId:categoryId.split('.')[0]!,reason,mealEligible});
  if(['Instamart','Zepto'].includes(name??''))return result('dining.groceries','Recognised quick-commerce merchant; your Food & Dining preference.');
  if(['Swiggy','Zomato'].includes(name??''))return result('dining.delivery','Recognised food delivery merchant.',true);
  if(['Tea Post','Nariyal Pani','Amar Juice Centre','Chaayos','Chai Point'].includes(name??'')||/\b(?:nariyal paani|coconut water|tea stall|juice centre|juice center)\b/.test(value))return result('dining.tea','Recognised tea or refreshment purchase.');
  // Avoid changing established non-food merchants merely because extra text says restaurant.
  if(!known.length&&diningBusiness(text)&&/\b(?:restaurant|restaurants|eatery|bistro|dhaba|restobar|bar and grill|bar and kitchen)\b/.test(value))return result('dining.restaurant','Explicit restaurant business descriptor.',true);
  if(['Shiv Sagar','Cafe Madras','Leopold Cafe','Cafe Mondegar','Bademiya'].includes(name??''))return result('dining.restaurant','Recognised restaurant merchant.',true);
  const signals:Array<[RegExp,string,string]>=[
    [/\b(?:household supplies|cleaning supplies|detergent|dishwashing liquid)\b/,'essentials.household','Explicit household-supplies description.'],
    [/\b(?:gomechanic|car servicing|vehicle maintenance|tyre replacement|car repair|bike repair)\b/,'transport.maintenance','Explicit vehicle-maintenance evidence.'],
    [/\b(?:toll plaza|toll paid|toll charge)\b/,'transport.tolls','Actual toll-charge wording; a FASTag recharge alone is insufficient.'],
    [/\b(?:income tax payment|property tax|advance tax payment)\b/,'bills.taxes','Explicit tax-payment wording.'],
    [/\b(?:charity donation|charitable donation|giveindia|give india|goonj)\b/,'gifts.donations','Recognised charity or explicit donation wording.'],
    [/\b(?:udemy|coursera|course fee|tuition fee)\b/,'education.courses','Recognised course provider or course-fee wording.'],
    [/\b(?:crossword bookstore|crossword books|kitab khana|textbooks|book purchase)\b/,'education.books','Explicit book purchase or recognised bookstore.'],
    [/\b(?:lal pathlabs|metropolis diagnostics|thyrocare|blood test|medical tests|diagnostic test)\b/,'health.tests','Recognised diagnostic provider or medical-test wording.'],
  ];
  const matches=signals.filter(([pattern,id])=>pattern.test(value) && (!known.length || known[0]!.categoryId.split('.')[0]===id.split('.')[0]));
  if(new Set(matches.map(([,id])=>id)).size!==1)return;
  const [,id,reason]=matches[0]!;
  return result(id,reason);
}
