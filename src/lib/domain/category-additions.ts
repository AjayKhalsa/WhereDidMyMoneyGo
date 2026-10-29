/** Approved additive subcategories. Existing categories and labels are never rewritten. */
export const CATEGORY_ADDITIONS = [
  {id:'dining.delivery', parentId:'dining', name:'Food delivery'},
  {id:'dining.restaurant', parentId:'dining', name:'Restaurants'},
  {id:'dining.groceries', parentId:'dining', name:'Groceries'},
  {id:'dining.tea', parentId:'dining', name:'Tea & refreshments'},
  {id:'essentials.household', parentId:'essentials', name:'Household supplies'},
  {id:'transport.maintenance', parentId:'transport', name:'Vehicle maintenance'},
  {id:'transport.tolls', parentId:'transport', name:'Tolls'},
  {id:'bills.taxes', parentId:'bills', name:'Taxes'},
  {id:'gifts.donations', parentId:'gifts', name:'Donations'},
  {id:'education.courses', parentId:'education', name:'Courses'},
  {id:'education.books', parentId:'education', name:'Books'},
  {id:'health.tests', parentId:'health', name:'Medical tests'},
] as const;
