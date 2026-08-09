/**
 * The parser's built-in vocabulary.
 *
 * This is the cold-start knowledge that makes "450 uber to office" work on
 * day one, before the app has learned anything about you. Every entry here
 * is a *default* — a learned `ClassificationRule` always wins over it.
 *
 * Deliberately excludes words that are common in other contexts (e.g. "house",
 * "market", "order", "bought") even where a real-world merchant list would
 * include them — a single generic token deciding a category is how you get
 * silently wrong classifications. See `ClassificationRule` for how those gaps
 * get closed per-user instead: teach it once, it remembers.
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
  // Cabs / ride-hailing
  { name: "Uber", aliases: ["uber"], categoryId: "transport.cab" },
  { name: "Ola", aliases: ["ola"], categoryId: "transport.cab" },
  { name: "Rapido", aliases: ["rapido"], categoryId: "transport.cab" },
  { name: "BluSmart", aliases: ["blusmart"], categoryId: "transport.cab" },
  { name: "Namma Yatri", aliases: ["nammayatri"], categoryId: "transport.cab" },
  { name: "inDrive", aliases: ["indrive"], categoryId: "transport.cab" },
  { name: "Meru", aliases: ["meru"], categoryId: "transport.cab" },
  // Fuel
  { name: "HPCL", aliases: ["hpcl"], categoryId: "transport.fuel" },
  { name: "BPCL", aliases: ["bpcl"], categoryId: "transport.fuel" },
  { name: "Indian Oil", aliases: ["ioc", "indianoil"], categoryId: "transport.fuel" },
  // Food delivery
  { name: "Swiggy", aliases: ["swiggy"], categoryId: "dining.delivery" },
  { name: "Zomato", aliases: ["zomato"], categoryId: "dining.delivery" },
  // Groceries / quick-commerce
  { name: "Blinkit", aliases: ["blinkit", "grofers"], categoryId: "essentials.groceries" },
  { name: "Zepto", aliases: ["zepto"], categoryId: "essentials.groceries" },
  { name: "Instamart", aliases: ["instamart"], categoryId: "essentials.groceries" },
  { name: "BigBasket", aliases: ["bigbasket"], categoryId: "essentials.groceries" },
  { name: "DMart", aliases: ["dmart"], categoryId: "essentials.groceries" },
  { name: "Reliance Fresh", aliases: ["reliancefresh", "reliancesmart"], categoryId: "essentials.groceries" },
  { name: "Nature's Basket", aliases: ["naturesbasket"], categoryId: "essentials.groceries" },
  { name: "Star Bazaar", aliases: ["starbazaar"], categoryId: "essentials.groceries" },
  { name: "Spencer's", aliases: ["spencers"], categoryId: "essentials.groceries" },
  { name: "JioMart", aliases: ["jiomart"], categoryId: "essentials.groceries" },
  { name: "Amazon Fresh", aliases: ["amazonfresh"], categoryId: "essentials.groceries" },
  // Shopping — general / marketplaces
  { name: "Amazon", aliases: ["amazon"], categoryId: "shopping.other" },
  { name: "Flipkart", aliases: ["flipkart"], categoryId: "shopping.other" },
  { name: "Decathlon", aliases: ["decathlon"], categoryId: "shopping.other" },
  { name: "Ajio", aliases: ["ajio"], categoryId: "shopping.clothes" },
  { name: "Tata Cliq", aliases: ["tatacliq"], categoryId: "shopping.other" },
  { name: "Nykaa", aliases: ["nykaa"], categoryId: "essentials.skincare" },
  // Shopping — clothes
  { name: "Myntra", aliases: ["myntra"], categoryId: "shopping.clothes" },
  { name: "Zara", aliases: ["zara"], categoryId: "shopping.clothes" },
  { name: "Uniqlo", aliases: ["uniqlo"], categoryId: "shopping.clothes" },
  { name: "Levi's", aliases: ["levis"], categoryId: "shopping.clothes" },
  { name: "Westside", aliases: ["westside"], categoryId: "shopping.clothes" },
  { name: "Pantaloons", aliases: ["pantaloons"], categoryId: "shopping.clothes" },
  { name: "Allen Solly", aliases: ["allensolly"], categoryId: "shopping.clothes" },
  { name: "Van Heusen", aliases: ["vanheusen"], categoryId: "shopping.clothes" },
  { name: "Louis Philippe", aliases: ["louisphilippe"], categoryId: "shopping.clothes" },
  { name: "Peter England", aliases: ["peterengland"], categoryId: "shopping.clothes" },
  { name: "Rare Rabbit", aliases: ["rarerabbit"], categoryId: "shopping.clothes" },
  { name: "Snitch", aliases: ["snitch"], categoryId: "shopping.clothes" },
  { name: "Bewakoof", aliases: ["bewakoof"], categoryId: "shopping.clothes" },
  // Shopping — electronics
  { name: "Croma", aliases: ["croma"], categoryId: "shopping.electronics" },
  { name: "Reliance Digital", aliases: ["reliancedigital"], categoryId: "shopping.electronics" },
  { name: "Vijay Sales", aliases: ["vijaysales"], categoryId: "shopping.electronics" },
  { name: "Samsung", aliases: ["samsung"], categoryId: "shopping.electronics" },
  { name: "OnePlus", aliases: ["oneplus"], categoryId: "shopping.electronics" },
  // Home
  { name: "IKEA", aliases: ["ikea"], categoryId: "shopping.home" },
  // Subscriptions / OTT
  { name: "Netflix", aliases: ["netflix"], categoryId: "bills.subscriptions" },
  { name: "Spotify", aliases: ["spotify"], categoryId: "bills.subscriptions" },
  { name: "Hotstar", aliases: ["hotstar", "jiohotstar"], categoryId: "bills.subscriptions" },
  { name: "Prime", aliases: ["primevideo"], categoryId: "bills.subscriptions" },
  { name: "YouTube Premium", aliases: ["youtube"], categoryId: "bills.subscriptions" },
  { name: "Disney+", aliases: ["disneyplus"], categoryId: "bills.subscriptions" },
  { name: "SonyLIV", aliases: ["sonyliv"], categoryId: "bills.subscriptions" },
  { name: "ZEE5", aliases: ["zee5"], categoryId: "bills.subscriptions" },
  { name: "JioCinema", aliases: ["jiocinema"], categoryId: "bills.subscriptions" },
  { name: "Apple TV", aliases: ["appletv"], categoryId: "bills.subscriptions" },
  { name: "Apple Music", aliases: ["applemusic"], categoryId: "bills.subscriptions" },
  { name: "Audible", aliases: ["audible"], categoryId: "bills.subscriptions" },
  { name: "Notion", aliases: ["notion"], categoryId: "bills.subscriptions" },
  { name: "Dropbox", aliases: ["dropbox"], categoryId: "bills.subscriptions" },
  { name: "Google One", aliases: ["googleone"], categoryId: "bills.subscriptions" },
  { name: "iCloud", aliases: ["icloud"], categoryId: "bills.subscriptions" },
  { name: "Microsoft 365", aliases: ["microsoft365"], categoryId: "bills.subscriptions" },
  { name: "Adobe", aliases: ["adobe"], categoryId: "bills.subscriptions" },
  { name: "Canva", aliases: ["canva"], categoryId: "bills.subscriptions" },
  { name: "ChatGPT", aliases: ["chatgpt", "openai"], categoryId: "bills.subscriptions" },
  { name: "Claude", aliases: ["claude", "anthropic"], categoryId: "bills.subscriptions" },
  { name: "Gemini", aliases: ["geminiapi"], categoryId: "bills.subscriptions" },
  // Mobile / telecom
  { name: "Jio", aliases: ["jio"], categoryId: "bills.mobile" },
  { name: "Airtel", aliases: ["airtel"], categoryId: "bills.mobile" },
  { name: "Vodafone Idea", aliases: ["vodafone", "vi"], categoryId: "bills.mobile" },
  { name: "BSNL", aliases: ["bsnl"], categoryId: "bills.mobile" },
  // Cafes
  { name: "Starbucks", aliases: ["starbucks"], categoryId: "dining.cafe" },
  { name: "Blue Tokai", aliases: ["bluetokai"], categoryId: "dining.cafe" },
  { name: "Third Wave", aliases: ["thirdwave"], categoryId: "dining.cafe" },
  { name: "Tim Hortons", aliases: ["timhortons"], categoryId: "dining.cafe" },
  { name: "Costa Coffee", aliases: ["costa", "costacoffee"], categoryId: "dining.cafe" },
  { name: "Chaayos", aliases: ["chaayos"], categoryId: "dining.cafe" },
  { name: "Chai Point", aliases: ["chaipoint"], categoryId: "dining.cafe" },
  { name: "Cafe Coffee Day", aliases: ["ccd", "cafecoffeeday"], categoryId: "dining.cafe" },
  { name: "Barista", aliases: ["barista"], categoryId: "dining.cafe" },
  { name: "Dunkin'", aliases: ["dunkin"], categoryId: "dining.cafe" },
  { name: "Keventers", aliases: ["keventers"], categoryId: "dining.cafe" },
  { name: "Subko", aliases: ["subko"], categoryId: "dining.cafe" },
  { name: "Pret", aliases: ["pret"], categoryId: "dining.cafe" },
  // Bakeries
  { name: "Magnolia Bakery", aliases: ["magnolia"], categoryId: "dining.cafe" },
  { name: "Theobroma", aliases: ["theobroma"], categoryId: "dining.cafe" },
  { name: "Monginis", aliases: ["monginis"], categoryId: "dining.cafe" },
  { name: "Mio Amore", aliases: ["mioamore"], categoryId: "dining.cafe" },
  { name: "Smoor", aliases: ["smoor"], categoryId: "dining.cafe" },
  { name: "Bakingo", aliases: ["bakingo"], categoryId: "dining.cafe" },
  { name: "Paris Baguette", aliases: ["parisbaguette"], categoryId: "dining.cafe" },
  // Fast food
  { name: "Domino's", aliases: ["dominos", "domino"], categoryId: "dining.delivery" },
  { name: "McDonald's", aliases: ["mcdonalds", "mcd"], categoryId: "dining.delivery" },
  { name: "KFC", aliases: ["kfc"], categoryId: "dining.delivery" },
  { name: "Burger King", aliases: ["burgerking", "bk"], categoryId: "dining.delivery" },
  { name: "Subway", aliases: ["subway"], categoryId: "dining.delivery" },
  { name: "Pizza Hut", aliases: ["pizzahut"], categoryId: "dining.delivery" },
  { name: "Wendy's", aliases: ["wendys"], categoryId: "dining.delivery" },
  { name: "Taco Bell", aliases: ["tacobell"], categoryId: "dining.delivery" },
  // Restaurants / bars known by name
  { name: "Toit", aliases: ["toit"], categoryId: "dining.restaurant" },
  { name: "Doolally", aliases: ["doolally"], categoryId: "dining.restaurant" },
  { name: "Farzi Cafe", aliases: ["farzicafe"], categoryId: "dining.restaurant" },
  { name: "Smoke House Deli", aliases: ["smokehousedeli"], categoryId: "dining.restaurant" },
  { name: "Haldiram's", aliases: ["haldirams"], categoryId: "dining.restaurant" },
  // Cinema
  { name: "BookMyShow", aliases: ["bookmyshow", "bms"], categoryId: "entertainment.movies" },
  { name: "PVR", aliases: ["pvr", "inox"], categoryId: "entertainment.movies" },
  { name: "Cinepolis", aliases: ["cinepolis"], categoryId: "entertainment.movies" },
  { name: "Carnival Cinemas", aliases: ["carnivalcinemas"], categoryId: "entertainment.movies" },
  { name: "MovieMax", aliases: ["moviemax"], categoryId: "entertainment.movies" },
  // Gaming
  { name: "Steam", aliases: ["steam"], categoryId: "entertainment.games" },
  { name: "Epic Games", aliases: ["epicgames"], categoryId: "entertainment.games" },
  { name: "Nintendo", aliases: ["nintendo"], categoryId: "entertainment.games" },
  // Fitness
  { name: "Cult.fit", aliases: ["cult", "cultfit"], categoryId: "health.gym" },
  // Pharmacy / health
  { name: "Apollo", aliases: ["apollo"], categoryId: "essentials.medicines" },
  { name: "PharmEasy", aliases: ["pharmeasy", "1mg", "tata1mg"], categoryId: "essentials.medicines" },
  { name: "Netmeds", aliases: ["netmeds"], categoryId: "essentials.medicines" },
  { name: "MedPlus", aliases: ["medplus"], categoryId: "essentials.medicines" },
  { name: "Practo", aliases: ["practo"], categoryId: "health.doctor" },
  // Protein / diet
  { name: "MuscleBlaze", aliases: ["muscleblaze", "optimumnutrition"], categoryId: "essentials.diet" },
  { name: "MyProtein", aliases: ["myprotein"], categoryId: "essentials.diet" },
  { name: "Avvatar", aliases: ["avvatar"], categoryId: "essentials.diet" },
  { name: "The Whole Truth", aliases: ["wholetruth"], categoryId: "essentials.diet" },
  { name: "Epigamia", aliases: ["epigamia"], categoryId: "essentials.diet" },
  // Travel
  { name: "IndiGo", aliases: ["indigo"], categoryId: "misc.other", contexts: ["travel"] },
  { name: "IRCTC", aliases: ["irctc"], categoryId: "misc.other", contexts: ["travel"] },
  { name: "MakeMyTrip", aliases: ["makemytrip", "mmt"], categoryId: "misc.other", contexts: ["travel"] },
  { name: "Goibibo", aliases: ["goibibo"], categoryId: "misc.other", contexts: ["travel"] },
  { name: "Booking.com", aliases: ["bookingcom"], categoryId: "misc.other", contexts: ["travel"] },
  { name: "Agoda", aliases: ["agoda"], categoryId: "misc.other", contexts: ["travel"] },
  { name: "Airbnb", aliases: ["airbnb"], categoryId: "misc.other", contexts: ["travel"] },
  { name: "Cleartrip", aliases: ["cleartrip"], categoryId: "misc.other", contexts: ["travel"] },
  { name: "Yatra", aliases: ["yatra"], categoryId: "misc.other", contexts: ["travel"] },
  { name: "Ixigo", aliases: ["ixigo"], categoryId: "misc.other", contexts: ["travel"] },
  { name: "EaseMyTrip", aliases: ["easemytrip"], categoryId: "misc.other", contexts: ["travel"] },
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
  // Dining — restaurants & Indian food
  {
    keywords: [
      "dinner", "lunch", "breakfast", "brunch", "supper", "meal", "restaurant", "restaurants",
      "eatery", "diner", "bistro", "canteen", "dhaba", "ate", "eating", "food", "biryani",
      "pizza", "burger", "thali", "buffet", "tandoor", "tandoori", "kebab", "kabab", "paratha",
      "naan", "roti", "dosa", "idli", "vada", "uttapam", "chole", "bhature", "chaat", "golgappa",
      "bhel", "misal", "poha", "frankie", "momos", "chowmein", "manchurian", "bhaji",
    ],
    categoryId: "dining.restaurant",
    weight: 8,
  },
  // Dining — fast food, folded into restaurant since it's the same money question
  {
    keywords: ["fries", "sandwich", "sandwiches", "wrap", "wraps", "taco", "tacos", "burrito", "burritos", "shawarma", "nuggets", "hotdog"],
    categoryId: "dining.restaurant",
    weight: 6,
  },
  {
    keywords: ["coffee", "cafe", "cafes", "latte", "cappuccino", "chai", "tea", "espresso", "americano", "mocha", "macchiato", "frappe", "frappuccino", "matcha", "boba"],
    categoryId: "dining.cafe",
    weight: 7,
  },
  {
    keywords: [
      "bakery", "bakeries", "bakehouse", "bakes", "cake", "cakes", "cupcake", "cupcakes",
      "pastry", "pastries", "brownie", "brownies", "cookie", "cookies", "donut", "donuts",
      "doughnut", "doughnuts", "muffin", "muffins", "tart", "tarts", "cheesecake", "macaron",
      "macarons", "confectionery", "patisserie", "croissant", "dessert", "desserts",
    ],
    categoryId: "dining.cafe",
    weight: 7,
  },
  {
    keywords: ["delivery", "delivered", "ordered", "order", "takeaway", "takeout", "parcel"],
    categoryId: "dining.delivery",
    weight: 6,
  },
  {
    keywords: [
      "drinks", "drink", "beer", "wine", "cocktail", "cocktails", "mocktail", "pub", "bar",
      "whisky", "whiskey", "vodka", "rum", "tequila", "booze", "alcohol", "pint", "pints",
      "shots", "brewery", "brewpub", "taproom", "liquor", "nightclub",
    ],
    categoryId: "dining.drinks",
    contexts: ["alcohol"],
    weight: 5,
  },
  // Transport
  {
    keywords: ["cab", "cabs", "taxi", "taxis", "ride", "auto", "autorickshaw", "rickshaw"],
    categoryId: "transport.cab",
    weight: 8,
  },
  { keywords: ["metro", "train", "railway", "bus"], categoryId: "transport.metro", weight: 8 },
  { keywords: ["petrol", "diesel", "fuel", "cng"], categoryId: "transport.fuel", weight: 9 },
  { keywords: ["parking", "toll", "fastag"], categoryId: "transport.parking", weight: 9 },
  // Entertainment
  {
    keywords: ["movie", "movies", "cinema", "film", "films", "imax", "theatre", "theater"],
    categoryId: "entertainment.movies",
    weight: 8,
  },
  {
    keywords: ["concert", "concerts", "gig", "standup", "comedy", "show", "shows", "festival", "festivals", "exhibition", "karaoke", "bowling"],
    categoryId: "entertainment.events",
    weight: 8,
  },
  {
    keywords: ["game", "games", "gaming", "playstation", "xbox", "console", "arcade"],
    categoryId: "entertainment.games",
    weight: 8,
  },
  // Essentials
  {
    keywords: [
      "groceries", "grocery", "kirana", "provisions", "ration", "vegetables", "vegetable",
      "veggies", "milk", "fruits", "fruit", "supermarket", "rice", "atta", "flour", "dal",
      "lentils", "pulses", "oil", "ghee", "butter", "cheese", "curd", "yogurt", "paneer",
      "tofu", "spices", "masala", "sugar", "salt", "cereal", "cereals", "noodles", "pasta",
      "snacks", "chips", "biscuits", "biscuit", "juice",
    ],
    categoryId: "essentials.groceries",
    weight: 9,
  },
  {
    keywords: [
      "protein", "whey", "casein", "creatine", "supplement", "supplements", "oats", "diet",
      "eggs", "gainer", "bcaa", "electrolytes", "nutrition", "muesli",
    ],
    categoryId: "essentials.diet",
    weight: 9,
  },
  {
    keywords: ["shampoo", "conditioner", "soap", "toiletries", "deodorant", "toothpaste", "toothbrush", "mouthwash", "razor", "razors", "shaving"],
    categoryId: "essentials.toiletries",
    weight: 9,
  },
  {
    keywords: ["skincare", "moisturizer", "moisturiser", "sunscreen", "serum", "facewash", "toner", "cream", "lotion", "cleanser"],
    categoryId: "essentials.skincare",
    weight: 9,
  },
  {
    keywords: ["medicine", "medicines", "pharmacy", "chemist", "tablet", "tablets", "capsule", "capsules", "syrup", "prescription", "meds"],
    categoryId: "essentials.medicines",
    weight: 9,
  },
  // Shopping
  {
    keywords: [
      "clothes", "clothing", "apparel", "fashion", "shirt", "tshirt", "jeans", "trousers",
      "pants", "suit", "blazer", "jacket", "coat", "kurta", "dress", "shoes", "sneakers",
      "boots", "sandals", "slippers", "belt", "socks",
    ],
    categoryId: "shopping.clothes",
    weight: 8,
  },
  {
    keywords: [
      "phone", "laptop", "headphones", "earbuds", "airpods", "charger", "monitor", "keyboard",
      "electronics", "gadget", "gadgets", "speaker", "router", "printer", "powerbank",
    ],
    categoryId: "shopping.electronics",
    weight: 8,
  },
  {
    keywords: ["furniture", "decor", "kitchen", "sofa", "mattress", "curtain", "utensils", "cookware"],
    categoryId: "shopping.home",
    weight: 7,
  },
  {
    keywords: ["gift", "gifts", "present", "presents", "voucher"],
    categoryId: "shopping.personal",
    contexts: ["gift"],
    weight: 7,
  },
  // Bills
  { keywords: ["rent"], categoryId: "bills.rent", weight: 10 },
  { keywords: ["recharge", "mobile", "postpaid", "prepaid"], categoryId: "bills.mobile", weight: 9 },
  { keywords: ["internet", "wifi", "broadband", "fiber", "fibre"], categoryId: "bills.internet", weight: 9 },
  { keywords: ["electricity", "water", "utility", "utilities", "lpg", "cylinder", "maintenance"], categoryId: "bills.utilities", weight: 9 },
  { keywords: ["subscription", "subscriptions", "renewal"], categoryId: "bills.subscriptions", weight: 8 },
  // Health
  {
    keywords: ["gym", "workout", "workouts", "trainer", "training", "fitness", "membership", "boxing", "yoga", "pilates", "crossfit", "zumba", "swimming"],
    categoryId: "health.gym",
    weight: 9,
  },
  {
    keywords: ["doctor", "clinic", "hospital", "consultation", "checkup", "dentist", "dental", "dentistry", "diagnostic", "scan", "lab"],
    categoryId: "health.doctor",
    weight: 9,
  },
  { keywords: ["massage", "spa", "therapy", "salon", "haircut", "facial", "grooming", "barber"], categoryId: "health.wellness", weight: 8 },
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
    keywords: ["friend", "friends", "gang", "buddies", "squad", "mates", "guys", "boys", "girls", "crew"],
    context: "friends",
  },
  {
    keywords: ["date", "dating", "her", "him", "gf", "bf", "girlfriend", "boyfriend", "tinder", "bumble", "hinge", "crush"],
    context: "dating",
  },
  {
    keywords: ["office", "work", "client", "colleague", "colleagues", "team", "boss", "manager"],
    context: "work",
  },
  {
    keywords: ["family", "mom", "mum", "dad", "parents", "sister", "brother", "cousin", "wife", "husband"],
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
