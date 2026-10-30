import { MERCHANTS, type MerchantEntry } from './lexicon';

const normalized = (text: string) => text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Full phrases, never generic locality or person-name matches.
const EXTRA_MERCHANTS: MerchantEntry[] = [
  {name:'Nykaa Fashion', aliases:['nykaa fashion','nykaafashion'], categoryId:'shopping.clothing'},
  {name:'Tea Post', aliases:['tea post','teapost'], categoryId:'dining'},
  {name:'Nariyal Pani', aliases:['nariyal pani','nariyalpani','nariyal paani'], categoryId:'dining'},
  {name:'Shiv Sagar', aliases:['shiv sagar','shivsagar'], categoryId:'dining'},
  {name:'Amar Juice Centre', aliases:['amar juice centre','amar juice center'], categoryId:'dining'},
  {name:'Leopold Cafe', aliases:['leopold cafe'], categoryId:'dining'},
  {name:'Cafe Madras', aliases:['cafe madras'], categoryId:'dining'},
  {name:'Cafe Mondegar', aliases:['cafe mondegar'], categoryId:'dining'},
  {name:'Bademiya', aliases:['bademiya'], categoryId:'dining'},
  {name:"Good Flippin' Burgers", aliases:['good flippin burgers','good flippin'], categoryId:'dining'},
  {name:'Bee Laban', aliases:['bee laban'], categoryId:'dining'},
  {name:'Kanha Sweets', aliases:['kanha sweets'], categoryId:'dining'},
  {name:'Pehlwan Kulcha Shop', aliases:['pehlwan kulcha shop','pehlwan kulcha'], categoryId:'dining'},
  {name:'Ram Ashraya', aliases:['ram ashraya','ramashraya'], categoryId:'dining'},
  {name:'Sardar Pav Bhaji', aliases:['sardar pav bhaji'], categoryId:'dining'},
  {name:'Prithvi Cafe', aliases:['prithvi cafe'], categoryId:'dining'},
  {name:'SodaBottleOpenerWala', aliases:['sodabottleopenerwala','soda bottle opener wala'], categoryId:'dining'},
];

/** Category evidence only: do not use this to merge financial identities or infer location. */
export function recognizedMerchants(text: string): MerchantEntry[] {
  const haystack = ` ${normalized(text)} `;
  const matches = [...MERCHANTS, ...EXTRA_MERCHANTS].filter(merchant =>
    [...merchant.aliases, merchant.name].some(alias => haystack.includes(` ${normalized(alias)} `)));
  // Explicit parent/sub-brand combination; retain the more specific merchant.
  return matches.filter(m => !(m.name === 'Swiggy' && matches.some(v => v.name === 'Instamart'))
    && !(m.name === 'YouTube Premium' && matches.some(v => v.name === 'YouTube Music'))
    && !(m.name === 'Amazon' && matches.some(v => ['Amazon Prime','Prime','Amazon Fresh'].includes(v.name)))
    && !(m.name === 'Amazon Prime' && matches.some(v => v.name === 'Prime'))
    && !(m.name === 'Nykaa' && matches.some(v => v.name === 'Nykaa Fashion')));
}

/** Clear food-business descriptors; ambiguous bar/hotel/social alone are insufficient. */
export function diningBusiness(text: string): boolean {
  const value = normalized(text);
  if (/\b(?:equipment|supplies|supplier|consultancy|software|school|academy|wholesale|furniture)\b/.test(value)) return false;
  return /\b(?:cafe|restaurant|restaurants|eatery|bistro|dhaba|bakery|pizzeria|restobar)\b/.test(value)
    || /\b(?:juice cent(?:re|er)|bar and (?:grill|kitchen)|bar kitchen)\b/.test(value);
}

/** A platform's Dining category does not prove that groceries or tickets were a meal. */
export function mealEligibleMerchant(text: string): boolean {
  return !recognizedMerchants(text).some(m => ['Instamart', 'Zepto', 'District'].includes(m.name));
}
