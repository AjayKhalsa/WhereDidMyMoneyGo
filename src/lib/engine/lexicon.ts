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
  { name: "Uber", aliases: ["uber"], categoryId: "transport" },
  { name: "Ola", aliases: ["ola"], categoryId: "transport" },
  { name: "Rapido", aliases: ["rapido"], categoryId: "transport" },
  { name: "BluSmart", aliases: ["blusmart"], categoryId: "transport" },
  { name: "Namma Yatri", aliases: ["nammayatri"], categoryId: "transport" },
  { name: "inDrive", aliases: ["indrive"], categoryId: "transport" },
  { name: "Meru", aliases: ["meru"], categoryId: "transport" },
  // Fuel
  { name: "HPCL", aliases: ["hpcl"], categoryId: "transport" },
  { name: "BPCL", aliases: ["bpcl"], categoryId: "transport" },
  { name: "Indian Oil", aliases: ["ioc", "indianoil"], categoryId: "transport" },
  // Food delivery
  { name: "Swiggy", aliases: ["swiggy"], categoryId: "dining" },
  { name: "Zomato", aliases: ["zomato"], categoryId: "dining" },
  // Groceries / quick-commerce
  { name: "Blinkit", aliases: ["blinkit", "grofers"], categoryId: "essentials" },
  { name: "Zepto", aliases: ["zepto"], categoryId: "essentials" },
  { name: "Instamart", aliases: ["instamart"], categoryId: "essentials" },
  { name: "BigBasket", aliases: ["bigbasket"], categoryId: "essentials" },
  { name: "DMart", aliases: ["dmart"], categoryId: "essentials" },
  { name: "Reliance Fresh", aliases: ["reliancefresh", "reliancesmart"], categoryId: "essentials" },
  { name: "Nature's Basket", aliases: ["naturesbasket"], categoryId: "essentials" },
  { name: "Star Bazaar", aliases: ["starbazaar"], categoryId: "essentials" },
  { name: "Spencer's", aliases: ["spencers"], categoryId: "essentials" },
  { name: "JioMart", aliases: ["jiomart"], categoryId: "essentials" },
  { name: "Amazon Fresh", aliases: ["amazonfresh"], categoryId: "essentials" },
  // Shopping — general / marketplaces
  { name: "Amazon", aliases: ["amazon"], categoryId: "shopping" },
  { name: "Flipkart", aliases: ["flipkart"], categoryId: "shopping" },
  { name: "Decathlon", aliases: ["decathlon"], categoryId: "shopping" },
  { name: "Ajio", aliases: ["ajio"], categoryId: "shopping" },
  { name: "Tata Cliq", aliases: ["tatacliq"], categoryId: "shopping" },
  { name: "Nykaa", aliases: ["nykaa"], categoryId: "essentials" },
  // Shopping — clothes
  { name: "Myntra", aliases: ["myntra"], categoryId: "shopping" },
  { name: "Zara", aliases: ["zara"], categoryId: "shopping" },
  { name: "Uniqlo", aliases: ["uniqlo"], categoryId: "shopping" },
  { name: "Levi's", aliases: ["levis"], categoryId: "shopping" },
  { name: "Westside", aliases: ["westside"], categoryId: "shopping" },
  { name: "Pantaloons", aliases: ["pantaloons"], categoryId: "shopping" },
  { name: "Allen Solly", aliases: ["allensolly"], categoryId: "shopping" },
  { name: "Van Heusen", aliases: ["vanheusen"], categoryId: "shopping" },
  { name: "Louis Philippe", aliases: ["louisphilippe"], categoryId: "shopping" },
  { name: "Peter England", aliases: ["peterengland"], categoryId: "shopping" },
  { name: "Rare Rabbit", aliases: ["rarerabbit"], categoryId: "shopping" },
  { name: "Snitch", aliases: ["snitch"], categoryId: "shopping" },
  { name: "Bewakoof", aliases: ["bewakoof"], categoryId: "shopping" },
  // Shopping — electronics
  { name: "Croma", aliases: ["croma"], categoryId: "shopping" },
  { name: "Reliance Digital", aliases: ["reliancedigital"], categoryId: "shopping" },
  { name: "Vijay Sales", aliases: ["vijaysales"], categoryId: "shopping" },
  { name: "Samsung", aliases: ["samsung"], categoryId: "shopping" },
  { name: "OnePlus", aliases: ["oneplus"], categoryId: "shopping" },
  // Home
  { name: "IKEA", aliases: ["ikea"], categoryId: "shopping" },
  // Subscriptions / OTT
  { name: "Netflix", aliases: ["netflix"], categoryId: "bills" },
  { name: "Spotify", aliases: ["spotify"], categoryId: "bills" },
  { name: "Hotstar", aliases: ["hotstar", "jiohotstar"], categoryId: "bills" },
  { name: "Prime", aliases: ["primevideo"], categoryId: "bills" },
  { name: "YouTube Premium", aliases: ["youtube"], categoryId: "bills" },
  { name: "Disney+", aliases: ["disneyplus"], categoryId: "bills" },
  { name: "SonyLIV", aliases: ["sonyliv"], categoryId: "bills" },
  { name: "ZEE5", aliases: ["zee5"], categoryId: "bills" },
  { name: "JioCinema", aliases: ["jiocinema"], categoryId: "bills" },
  { name: "Apple TV", aliases: ["appletv"], categoryId: "bills" },
  { name: "Apple Music", aliases: ["applemusic"], categoryId: "bills" },
  { name: "Audible", aliases: ["audible"], categoryId: "bills" },
  { name: "Notion", aliases: ["notion"], categoryId: "bills" },
  { name: "Dropbox", aliases: ["dropbox"], categoryId: "bills" },
  { name: "Google One", aliases: ["googleone"], categoryId: "bills" },
  { name: "iCloud", aliases: ["icloud"], categoryId: "bills" },
  { name: "Microsoft 365", aliases: ["microsoft365"], categoryId: "bills" },
  { name: "Adobe", aliases: ["adobe"], categoryId: "bills" },
  { name: "Canva", aliases: ["canva"], categoryId: "bills" },
  { name: "ChatGPT", aliases: ["chatgpt", "openai"], categoryId: "bills" },
  { name: "Claude", aliases: ["claude", "anthropic"], categoryId: "bills" },
  { name: "Gemini", aliases: ["geminiapi"], categoryId: "bills" },
  // Mobile / telecom
  { name: "Jio", aliases: ["jio"], categoryId: "bills" },
  { name: "Airtel", aliases: ["airtel"], categoryId: "bills" },
  { name: "Vodafone Idea", aliases: ["vodafone", "vi"], categoryId: "bills" },
  { name: "BSNL", aliases: ["bsnl"], categoryId: "bills" },
  // Cafes
  { name: "Starbucks", aliases: ["starbucks"], categoryId: "dining" },
  { name: "Blue Tokai", aliases: ["bluetokai"], categoryId: "dining" },
  { name: "Third Wave", aliases: ["thirdwave"], categoryId: "dining" },
  { name: "Tim Hortons", aliases: ["timhortons"], categoryId: "dining" },
  { name: "Costa Coffee", aliases: ["costa", "costacoffee"], categoryId: "dining" },
  { name: "Chaayos", aliases: ["chaayos"], categoryId: "dining" },
  { name: "Chai Point", aliases: ["chaipoint"], categoryId: "dining" },
  { name: "Cafe Coffee Day", aliases: ["ccd", "cafecoffeeday"], categoryId: "dining" },
  { name: "Barista", aliases: ["barista"], categoryId: "dining" },
  { name: "Dunkin'", aliases: ["dunkin"], categoryId: "dining" },
  { name: "Keventers", aliases: ["keventers"], categoryId: "dining" },
  { name: "Subko", aliases: ["subko"], categoryId: "dining" },
  { name: "Pret", aliases: ["pret"], categoryId: "dining" },
  // Bakeries
  { name: "Magnolia Bakery", aliases: ["magnolia"], categoryId: "dining" },
  { name: "Theobroma", aliases: ["theobroma"], categoryId: "dining" },
  { name: "Monginis", aliases: ["monginis"], categoryId: "dining" },
  { name: "Mio Amore", aliases: ["mioamore"], categoryId: "dining" },
  { name: "Smoor", aliases: ["smoor"], categoryId: "dining" },
  { name: "Bakingo", aliases: ["bakingo"], categoryId: "dining" },
  { name: "Paris Baguette", aliases: ["parisbaguette"], categoryId: "dining" },
  // Fast food
  { name: "Domino's", aliases: ["dominos", "domino"], categoryId: "dining" },
  { name: "McDonald's", aliases: ["mcdonalds", "mcd"], categoryId: "dining" },
  { name: "KFC", aliases: ["kfc"], categoryId: "dining" },
  { name: "Burger King", aliases: ["burgerking", "bk"], categoryId: "dining" },
  { name: "Subway", aliases: ["subway"], categoryId: "dining" },
  { name: "Pizza Hut", aliases: ["pizzahut"], categoryId: "dining" },
  { name: "Wendy's", aliases: ["wendys"], categoryId: "dining" },
  { name: "Taco Bell", aliases: ["tacobell"], categoryId: "dining" },
  // Restaurants / bars known by name
  { name: "Toit", aliases: ["toit"], categoryId: "dining" },
  { name: "Doolally", aliases: ["doolally"], categoryId: "dining" },
  { name: "Farzi Cafe", aliases: ["farzicafe"], categoryId: "dining" },
  { name: "Smoke House Deli", aliases: ["smokehousedeli"], categoryId: "dining" },
  { name: "Haldiram's", aliases: ["haldirams"], categoryId: "dining" },
  // Cinema
  { name: "BookMyShow", aliases: ["bookmyshow", "bms"], categoryId: "entertainment" },
  { name: "PVR", aliases: ["pvr", "inox"], categoryId: "entertainment" },
  { name: "Cinepolis", aliases: ["cinepolis"], categoryId: "entertainment" },
  { name: "Carnival Cinemas", aliases: ["carnivalcinemas"], categoryId: "entertainment" },
  { name: "MovieMax", aliases: ["moviemax"], categoryId: "entertainment" },
  // Gaming
  { name: "Steam", aliases: ["steam"], categoryId: "entertainment" },
  { name: "Epic Games", aliases: ["epicgames"], categoryId: "entertainment" },
  { name: "Nintendo", aliases: ["nintendo"], categoryId: "entertainment" },
  // Fitness
  { name: "Cult.fit", aliases: ["cult", "cultfit"], categoryId: "health" },
  // Pharmacy / health
  { name: "Apollo", aliases: ["apollo"], categoryId: "essentials" },
  { name: "PharmEasy", aliases: ["pharmeasy", "1mg", "tata1mg"], categoryId: "essentials" },
  { name: "Netmeds", aliases: ["netmeds"], categoryId: "essentials" },
  { name: "MedPlus", aliases: ["medplus"], categoryId: "essentials" },
  { name: "Practo", aliases: ["practo"], categoryId: "health" },
  // Protein / diet
  { name: "MuscleBlaze", aliases: ["muscleblaze", "optimumnutrition"], categoryId: "essentials" },
  { name: "MyProtein", aliases: ["myprotein"], categoryId: "essentials" },
  { name: "Avvatar", aliases: ["avvatar"], categoryId: "essentials" },
  { name: "The Whole Truth", aliases: ["wholetruth"], categoryId: "essentials" },
  { name: "Epigamia", aliases: ["epigamia"], categoryId: "essentials" },
  // Travel
  { name: "IndiGo", aliases: ["indigo"], categoryId: "travel", contexts: ["travel"] },
  { name: "IRCTC", aliases: ["irctc"], categoryId: "travel", contexts: ["travel"] },
  { name: "MakeMyTrip", aliases: ["makemytrip", "mmt"], categoryId: "travel", contexts: ["travel"] },
  { name: "Goibibo", aliases: ["goibibo"], categoryId: "travel", contexts: ["travel"] },
  { name: "Booking.com", aliases: ["bookingcom"], categoryId: "travel", contexts: ["travel"] },
  { name: "Agoda", aliases: ["agoda"], categoryId: "travel", contexts: ["travel"] },
  { name: "Airbnb", aliases: ["airbnb"], categoryId: "travel", contexts: ["travel"] },
  { name: "Cleartrip", aliases: ["cleartrip"], categoryId: "travel", contexts: ["travel"] },
  { name: "Yatra", aliases: ["yatra"], categoryId: "travel", contexts: ["travel"] },
  { name: "Ixigo", aliases: ["ixigo"], categoryId: "travel", contexts: ["travel"] },
  { name: "EaseMyTrip", aliases: ["easemytrip"], categoryId: "travel", contexts: ["travel"] },
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
    categoryId: "dining",
    weight: 8,
  },
  // Dining — fast food, folded into dining since it's the same money question
  {
    keywords: ["fries", "sandwich", "sandwiches", "wrap", "wraps", "taco", "tacos", "burrito", "burritos", "shawarma", "nuggets", "hotdog"],
    categoryId: "dining",
    weight: 6,
  },
  {
    keywords: ["coffee", "cafe", "cafes", "latte", "cappuccino", "chai", "tea", "espresso", "americano", "mocha", "macchiato", "frappe", "frappuccino", "matcha", "boba"],
    categoryId: "dining",
    weight: 7,
  },
  {
    keywords: [
      "bakery", "bakeries", "bakehouse", "bakes", "cake", "cakes", "cupcake", "cupcakes",
      "pastry", "pastries", "brownie", "brownies", "cookie", "cookies", "donut", "donuts",
      "doughnut", "doughnuts", "muffin", "muffins", "tart", "tarts", "cheesecake", "macaron",
      "macarons", "confectionery", "patisserie", "croissant", "dessert", "desserts",
    ],
    categoryId: "dining",
    weight: 7,
  },
  {
    keywords: ["delivery", "delivered", "ordered", "order", "takeaway", "takeout", "parcel"],
    categoryId: "dining",
    weight: 6,
  },
  {
    keywords: [
      "drinks", "drink", "beer", "wine", "cocktail", "cocktails", "mocktail", "pub", "bar",
      "whisky", "whiskey", "vodka", "rum", "tequila", "booze", "alcohol", "pint", "pints",
      "shots", "brewery", "brewpub", "taproom", "liquor", "nightclub",
    ],
    categoryId: "dining",
    contexts: ["alcohol"],
    weight: 5,
  },
  // Transport
  {
    keywords: ["cab", "cabs", "taxi", "taxis", "ride", "auto", "autorickshaw", "rickshaw"],
    categoryId: "transport",
    weight: 8,
  },
  { keywords: ["metro", "train", "railway", "bus"], categoryId: "transport", weight: 8 },
  { keywords: ["petrol", "diesel", "fuel", "cng"], categoryId: "transport", weight: 9 },
  { keywords: ["parking", "toll", "fastag"], categoryId: "transport", weight: 9 },
  // Entertainment
  {
    keywords: ["movie", "movies", "cinema", "film", "films", "imax", "theatre", "theater"],
    categoryId: "entertainment",
    weight: 8,
  },
  {
    keywords: ["concert", "concerts", "gig", "standup", "comedy", "show", "shows", "festival", "festivals", "exhibition", "karaoke", "bowling"],
    categoryId: "entertainment",
    weight: 8,
  },
  {
    keywords: ["game", "games", "gaming", "playstation", "xbox", "console", "arcade"],
    categoryId: "entertainment",
    weight: 8,
  },
  {
    keywords: ["party", "houseparty"],
    categoryId: "entertainment",
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
    categoryId: "essentials",
    weight: 9,
  },
  {
    keywords: [
      "protein", "whey", "casein", "creatine", "supplement", "supplements", "oats", "diet",
      "eggs", "gainer", "bcaa", "electrolytes", "nutrition", "muesli",
    ],
    categoryId: "essentials",
    weight: 9,
  },
  {
    keywords: ["shampoo", "conditioner", "soap", "toiletries", "deodorant", "toothpaste", "toothbrush", "mouthwash", "razor", "razors", "shaving"],
    categoryId: "essentials",
    weight: 9,
  },
  {
    keywords: ["skincare", "moisturizer", "moisturiser", "sunscreen", "serum", "facewash", "toner", "cream", "lotion", "cleanser"],
    categoryId: "essentials",
    weight: 9,
  },
  {
    keywords: ["medicine", "medicines", "pharmacy", "chemist", "tablet", "tablets", "capsule", "capsules", "syrup", "prescription", "meds"],
    categoryId: "essentials",
    weight: 9,
  },
  // Shopping
  {
    keywords: [
      "clothes", "clothing", "apparel", "fashion", "shirt", "tshirt", "jeans", "trousers",
      "pants", "suit", "blazer", "jacket", "coat", "kurta", "dress", "shoes", "sneakers",
      "boots", "sandals", "slippers", "belt", "socks",
    ],
    categoryId: "shopping",
    weight: 8,
  },
  {
    keywords: [
      "phone", "laptop", "headphones", "earbuds", "airpods", "charger", "monitor", "keyboard",
      "electronics", "gadget", "gadgets", "speaker", "router", "printer", "powerbank",
    ],
    categoryId: "shopping",
    weight: 8,
  },
  {
    keywords: ["furniture", "decor", "kitchen", "sofa", "mattress", "curtain", "utensils", "cookware"],
    categoryId: "shopping",
    weight: 7,
  },
  // Gifts
  {
    keywords: ["gift", "gifts", "present", "presents", "voucher"],
    categoryId: "gifts",
    contexts: ["gift"],
    weight: 7,
  },
  // Bills
  { keywords: ["rent"], categoryId: "bills", weight: 10 },
  { keywords: ["recharge", "mobile", "postpaid", "prepaid"], categoryId: "bills", weight: 9 },
  { keywords: ["internet", "wifi", "broadband", "fiber", "fibre"], categoryId: "bills", weight: 9 },
  { keywords: ["electricity", "water", "utility", "utilities", "lpg", "cylinder", "maintenance"], categoryId: "bills", weight: 9 },
  { keywords: ["subscription", "subscriptions", "renewal"], categoryId: "bills", weight: 8 },
  // Health
  {
    keywords: ["gym", "workout", "workouts", "trainer", "training", "fitness", "membership", "boxing", "yoga", "pilates", "crossfit", "zumba", "swimming"],
    categoryId: "health",
    weight: 9,
  },
  {
    keywords: ["doctor", "clinic", "hospital", "consultation", "checkup", "dentist", "dental", "dentistry", "diagnostic", "scan", "lab"],
    categoryId: "health",
    weight: 9,
  },
  { keywords: ["massage", "spa", "therapy", "salon", "haircut", "facial", "grooming", "barber"], categoryId: "health", weight: 8 },
  // Travel
  {
    keywords: ["flight", "hotel", "airbnb", "trip", "vacation", "holiday"],
    categoryId: "travel",
    contexts: ["travel"],
    weight: 7,
  },
  // Education
  {
    keywords: [
      "tuition", "course", "courses", "class", "classes", "workshop", "bootcamp",
      "certification", "textbook", "textbooks", "coaching",
    ],
    categoryId: "education",
    weight: 8,
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

/** Words that never carry meaning for classification. */
export const STOP_WORDS = new Set([
  "a", "an", "and", "at", "for", "from", "in", "of", "on", "the", "to", "with",
  "was", "were", "is", "it", "my", "me", "i", "we", "some", "few", "got",
  "paid", "spent", "bought", "rs", "rupees", "inr",
]);
