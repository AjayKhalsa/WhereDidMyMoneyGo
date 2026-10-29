/** Search vocabulary only; never renames saved IDs or labels. */
export const CATEGORY_SEARCH_ALIASES:Record<string,string[]>={
  'health.medicine':['pharmacy','chemist','medicines'],
  'shopping.personal':['personal care','skincare','cosmetics','grooming'],
  'bills.subscription':['subscriptions','netflix','spotify','apple music','youtube premium','icloud','google one','dropbox','microsoft 365','adobe','gaming subscriptions','news and media'],
};
export function categorySearchMatch(id:string,name:string,needle:string):boolean {
  return [name,...(CATEGORY_SEARCH_ALIASES[id]??[])].some(term=>term.toLocaleLowerCase().includes(needle));
}
