/**
 * The parser's built-in vocabulary.
 *
 * This is the cold-start knowledge that makes "450 uber to office" work on
 * day one, before the app has learned anything about you. Every entry here
 * is a *default* — a learned `ClassificationRule` always wins over it.
 */

export interface MerchantEntry {
  /** Canonical display name, e.g. "Uber". */
  name: string;
  /** Lowercase tokens that identify it. */
  aliases: string[];
  categoryId: string;
  contexts?: string[];
}

export const MERCHANTS: MerchantEntry[] = [
  { name: "Uber", aliases: ["uber"], categoryId: "transport.cab" },
  { name: "Ola", aliases: ["ola"], categoryId: "transport.cab" },
  { name: "Rapido", aliases: ["rapido"], categoryId: "transport.cab" },
  { name: "Swiggy", aliases: ["swiggy"], categoryId: "dining.delivery" },
  { name: "Zomato", aliases: ["zomato"], categoryId: "dining.delivery" },
  { name: "Blinkit", aliases: ["blinkit", "grofers"], categoryId: "essentials.groceries" },
  { name: "Zepto", aliases: ["zepto"], categoryId: "essentials.groceries" },
  { name: "Instamart", aliases: ["instamart"], categoryId: "essentials.groceries" },
  { name: "BigBasket", aliases: ["bigbasket"], categoryId: "essentials.groceries" },
  { name: "DMart", aliases: ["dmart"], categoryId: "essentials.groceries" },
  { name: "Amazon", aliases: ["amazon"], categoryId: "shopping.other" },
  { name: "Flipkart", aliases: ["flipkart"], categoryId: "shopping.other" },
  { name: "Myntra", aliases: ["myntra"], categoryId: "shopping.clothes" },
  { name: "Zara", aliases: ["zara"], categoryId: "shopping.clothes" },
  { name: "Uniqlo", aliases: ["uniqlo"], categoryId: "shopping.clothes" },
  { name: "Decathlon", aliases: ["decathlon"], categoryId: "shopping.other" },
  { name: "IKEA", aliases: ["ikea"], categoryId: "shopping.home" },
  { name: "Netflix", aliases: ["netflix"], categoryId: "bills.subscriptions" },
  { name: "Spotify", aliases: ["spotify"], categoryId: "bills.subscriptions" },
  { name: "Hotstar", aliases: ["hotstar", "jiohotstar"], categoryId: "bills.subscriptions" },
  { name: "Prime", aliases: ["primevideo"], categoryId: "bills.subscriptions" },
  { name: "YouTube Premium", aliases: ["youtube"], categoryId: "bills.subscriptions" },
  { name: "Jio", aliases: ["jio"], categoryId: "bills.mobile" },
  { name: "Airtel", aliases: ["airtel"], categoryId: "bills.mobile" },
  { name: "Starbucks", aliases: ["starbucks"], categoryId: "dining.cafe" },
  { name: "Blue Tokai", aliases: ["bluetokai"], categoryId: "dining.cafe" },
  { name: "Third Wave", aliases: ["thirdwave"], categoryId: "dining.cafe" },
  { name: "Domino's", aliases: ["dominos", "domino"], categoryId: "dining.delivery" },
  { name: "McDonald's", aliases: ["mcdonalds", "mcd"], categoryId: "dining.delivery" },
  { name: "KFC", aliases: ["kfc"], categoryId: "dining.delivery" },
  { name: "BookMyShow", aliases: ["bookmyshow", "bms"], categoryId: "entertainment.movies" },
  { name: "PVR", aliases: ["pvr", "inox"], categoryId: "entertainment.movies" },
  { name: "Cult.fit", aliases: ["cult", "cultfit"], categoryId: "health.gym" },
  { name: "Apollo", aliases: ["apollo"], categoryId: "essentials.medicines" },
  { name: "PharmEasy", aliases: ["pharmeasy", "1mg", "tata1mg"], categoryId: "essentials.medicines" },
  { name: "MuscleBlaze", aliases: ["muscleblaze", "optimumnutrition"], categoryId: "essentials.diet" },
  { name: "IndiGo", aliases: ["indigo"], categoryId: "misc.other", contexts: ["travel"] },
  { name: "IRCTC", aliases: ["irctc"], categoryId: "misc.other", contexts: ["travel"] },
  { name: "Steam", aliases: ["steam"], categoryId: "entertainment.games" },
];

export interface ActivityEntry {
  /** Lowercase keywords that trigger this activity. */
  keywords: string[];
  categoryId: string;
  contexts?: string[];
  /**
   * Higher wins when a phrase mentions several activities.
   * A "dinner + drinks" is primarily a dinner.
   */
  weight: number;
}

export const ACTIVITIES: ActivityEntry[] = [
  // Dining
  {
    keywords: ["dinner", "lunch", "breakfast", "brunch", "meal", "restaurant", "ate", "eating", "food", "biryani", "pizza", "burger", "thali", "buffet"],
    categoryId: "dining.restaurant",
    weight: 8,
  },
  {
    keywords: ["coffee", "cafe", "latte", "cappuccino", "chai", "tea", "espresso"],
    categoryId: "dining.cafe",
    weight: 7,
  },
  {
    keywords: ["delivery", "ordered", "order", "takeaway", "takeout", "parcel"],
    categoryId: "dining.delivery",
    weight: 6,
  },
  {
    keywords: ["drinks", "drink", "beer", "wine", "cocktail", "cocktails", "pub", "bar", "whisky", "whiskey", "vodka", "rum", "tequila", "booze", "alcohol", "pint", "pints", "shots"],
    categoryId: "dining.drinks",
    contexts: ["alcohol"],
    weight: 5,
  },
  // Transport
  {
    keywords: ["cab", "taxi", "ride", "auto", "rickshaw"],
    categoryId: "transport.cab",
    weight: 8,
  },
  { keywords: ["metro", "train", "bus"], categoryId: "transport.metro", weight: 8 },
  { keywords: ["petrol", "diesel", "fuel"], categoryId: "transport.fuel", weight: 9 },
  { keywords: ["parking", "toll"], categoryId: "transport.parking", weight: 9 },
  // Entertainment
  {
    keywords: ["movie", "movies", "cinema", "film", "imax"],
    categoryId: "entertainment.movies",
    weight: 8,
  },
  {
    keywords: ["concert", "gig", "standup", "comedy", "show", "festival"],
    categoryId: "entertainment.events",
    weight: 8,
  },
  {
    keywords: ["game", "gaming", "playstation", "xbox", "console"],
    categoryId: "entertainment.games",
    weight: 8,
  },
  // Essentials
  {
    keywords: ["groceries", "grocery", "vegetables", "veggies", "milk", "fruits", "supermarket"],
    categoryId: "essentials.groceries",
    weight: 9,
  },
  {
    keywords: ["protein", "whey", "creatine", "supplement", "supplements", "oats", "diet", "eggs", "gainer"],
    categoryId: "essentials.diet",
    weight: 9,
  },
  {
    keywords: ["shampoo", "soap", "toiletries", "deodorant", "toothpaste", "razor"],
    categoryId: "essentials.toiletries",
    weight: 9,
  },
  {
    keywords: ["skincare", "moisturizer", "moisturiser", "sunscreen", "serum", "facewash"],
    categoryId: "essentials.skincare",
    weight: 9,
  },
  {
    keywords: ["medicine", "medicines", "pharmacy", "tablets", "prescription", "meds"],
    categoryId: "essentials.medicines",
    weight: 9,
  },
  // Shopping
  {
    keywords: ["clothes", "shirt", "tshirt", "jeans", "shoes", "sneakers", "jacket", "kurta", "dress"],
    categoryId: "shopping.clothes",
    weight: 8,
  },
  {
    keywords: ["phone", "laptop", "headphones", "earbuds", "charger", "monitor", "keyboard", "electronics"],
    categoryId: "shopping.electronics",
    weight: 8,
  },
  { keywords: ["furniture", "decor", "kitchen"], categoryId: "shopping.home", weight: 7 },
  {
    keywords: ["gift", "present"],
    categoryId: "shopping.personal",
    contexts: ["gift"],
    weight: 7,
  },
  // Bills
  { keywords: ["rent"], categoryId: "bills.rent", weight: 10 },
  { keywords: ["recharge", "mobile", "postpaid", "prepaid"], categoryId: "bills.mobile", weight: 9 },
  { keywords: ["internet", "wifi", "broadband"], categoryId: "bills.internet", weight: 9 },
  { keywords: ["electricity", "water", "utility", "utilities"], categoryId: "bills.utilities", weight: 9 },
  { keywords: ["subscription", "subscriptions", "renewal"], categoryId: "bills.subscriptions", weight: 8 },
  // Health
  { keywords: ["gym", "workout", "trainer", "fitness"], categoryId: "health.gym", weight: 9 },
  { keywords: ["doctor", "clinic", "consultation", "checkup", "dentist"], categoryId: "health.doctor", weight: 9 },
  { keywords: ["massage", "spa", "therapy", "salon", "haircut"], categoryId: "health.wellness", weight: 8 },
  // Social / occasions
  { keywords: ["party", "houseparty"], categoryId: "social.parties", weight: 8 },
  {
    keywords: ["flight", "hotel", "airbnb", "trip", "vacation", "holiday"],
    categoryId: "misc.other",
    contexts: ["travel"],
    weight: 7,
  },
];

export interface ContextEntry {
  keywords: string[];
  context: string;
}

export const CONTEXT_KEYWORDS: ContextEntry[] = [
  {
    keywords: ["friend", "friends", "gang", "buddies", "squad", "mates", "guys", "boys", "girls"],
    context: "friends",
  },
  {
    keywords: ["date", "dating", "her", "him", "gf", "bf", "girlfriend", "boyfriend", "tinder", "bumble", "hinge", "crush"],
    context: "dating",
  },
  {
    keywords: ["office", "work", "client", "colleague", "colleagues", "team", "boss"],
    context: "work",
  },
  {
    keywords: ["family", "mom", "mum", "dad", "parents", "sister", "brother", "cousin"],
    context: "family",
  },
  { keywords: ["alone", "myself", "solo"], context: "solo" },
  { keywords: ["birthday", "anniversary", "celebration", "diwali", "holi"], context: "celebration" },
  { keywords: ["trip", "travel", "vacation", "holiday"], context: "travel" },
  { keywords: ["impulse", "unplanned"], context: "impulse" },
];

/**
 * How a base activity changes when you were with someone.
 *
 * A dinner is just a dinner. A dinner on a date belongs under Dating, and a
 * dinner with friends belongs under Social — same money, different meaning.
 * Keeping this as data rather than branching logic makes the behaviour easy
 * to inspect and extend.
 */
export const COMPANY_REFINEMENTS: Record<string, Record<string, string>> = {
  dating: {
    "dining.restaurant": "dating.dining",
    "dining.cafe": "dating.dining",
    "dining.delivery": "dating.dining",
    "dining.takeaway": "dating.dining",
    "dining.drinks": "dating.drinks",
    "entertainment.movies": "dating.movies",
    "entertainment.events": "dating.activities",
    "shopping.personal": "dating.gifts",
  },
  friends: {
    "dining.restaurant": "social.dining",
    "dining.delivery": "social.dining",
    "dining.takeaway": "social.dining",
    "dining.drinks": "social.drinks",
    "entertainment.events": "social.events",
  },
};

/** Words that never carry meaning for classification. */
export const STOP_WORDS = new Set([
  "a", "an", "and", "at", "for", "from", "in", "of", "on", "the", "to", "with",
  "was", "were", "is", "it", "my", "me", "i", "we", "some", "few", "got",
  "paid", "spent", "bought", "rs", "rupees", "inr",
]);
