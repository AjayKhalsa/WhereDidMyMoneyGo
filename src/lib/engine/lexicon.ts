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
  { name: "Myntra", aliases: ["myntra"], categoryId: "shopping.clothing" },
  { name: "Zara", aliases: ["zara"], categoryId: "shopping.clothing" },
  { name: "Uniqlo", aliases: ["uniqlo"], categoryId: "shopping.clothing" },
  { name: "Levi's", aliases: ["levis"], categoryId: "shopping.clothing" },
  { name: "Westside", aliases: ["westside"], categoryId: "shopping.clothing" },
  { name: "Pantaloons", aliases: ["pantaloons"], categoryId: "shopping.clothing" },
  { name: "Allen Solly", aliases: ["allensolly"], categoryId: "shopping.clothing" },
  { name: "Van Heusen", aliases: ["vanheusen"], categoryId: "shopping.clothing" },
  { name: "Louis Philippe", aliases: ["louisphilippe"], categoryId: "shopping.clothing" },
  { name: "Peter England", aliases: ["peterengland"], categoryId: "shopping.clothing" },
  { name: "Rare Rabbit", aliases: ["rarerabbit"], categoryId: "shopping.clothing" },
  { name: "Snitch", aliases: ["snitch"], categoryId: "shopping.clothing" },
  { name: "Bewakoof", aliases: ["bewakoof"], categoryId: "shopping.clothing" },
  // Shopping — electronics
  { name: "Croma", aliases: ["croma"], categoryId: "shopping.electronics" },
  { name: "Reliance Digital", aliases: ["reliancedigital"], categoryId: "shopping.electronics" },
  { name: "Vijay Sales", aliases: ["vijaysales"], categoryId: "shopping.electronics" },
  { name: "Samsung", aliases: ["samsung"], categoryId: "shopping.electronics" },
  { name: "OnePlus", aliases: ["oneplus"], categoryId: "shopping.electronics" },
  // Home
  { name: "IKEA", aliases: ["ikea"], categoryId: "shopping.home" },
  { name: "Urban Company", aliases: ["urbancompany", "uc"], categoryId: "shopping.home" },
  { name: "Housejoy", aliases: ["housejoy"], categoryId: "shopping.home" },
  { name: "NoBroker", aliases: ["nobroker"], categoryId: "shopping.home" },
  // Subscriptions / OTT
  { name: "Netflix", aliases: ["netflix"], categoryId: "bills.subscription" },
  { name: "Spotify", aliases: ["spotify"], categoryId: "bills.subscription" },
  { name: "Hotstar", aliases: ["hotstar", "jiohotstar"], categoryId: "bills.subscription" },
  { name: "Prime", aliases: ["primevideo"], categoryId: "bills.subscription" },
  { name: "YouTube Premium", aliases: ["youtube"], categoryId: "bills.subscription" },
  { name: "Disney+", aliases: ["disneyplus"], categoryId: "bills.subscription" },
  { name: "SonyLIV", aliases: ["sonyliv"], categoryId: "bills.subscription" },
  { name: "ZEE5", aliases: ["zee5"], categoryId: "bills.subscription" },
  { name: "JioCinema", aliases: ["jiocinema"], categoryId: "bills.subscription" },
  { name: "Voot", aliases: ["voot"], categoryId: "bills.subscription" },
  { name: "MX Player", aliases: ["mxplayer"], categoryId: "bills.subscription" },
  { name: "Aha", aliases: ["ahavideo"], categoryId: "bills.subscription" },
  { name: "ALTBalaji", aliases: ["altbalaji"], categoryId: "bills.subscription" },
  { name: "Apple TV", aliases: ["appletv"], categoryId: "bills.subscription" },
  { name: "Apple Music", aliases: ["applemusic"], categoryId: "bills.subscription" },
  { name: "Audible", aliases: ["audible"], categoryId: "bills.subscription" },
  { name: "Notion", aliases: ["notion"], categoryId: "bills.subscription" },
  { name: "Dropbox", aliases: ["dropbox"], categoryId: "bills.subscription" },
  { name: "Google One", aliases: ["googleone"], categoryId: "bills.subscription" },
  { name: "iCloud", aliases: ["icloud"], categoryId: "bills.subscription" },
  { name: "Microsoft 365", aliases: ["microsoft365"], categoryId: "bills.subscription" },
  { name: "Adobe", aliases: ["adobe"], categoryId: "bills.subscription" },
  { name: "Canva", aliases: ["canva"], categoryId: "bills.subscription" },
  { name: "ChatGPT", aliases: ["chatgpt", "openai"], categoryId: "bills.subscription" },
  { name: "Claude", aliases: ["claude", "anthropic"], categoryId: "bills.subscription" },
  { name: "Gemini", aliases: ["geminiapi"], categoryId: "bills.subscription" },
  // Mobile / telecom
  { name: "Jio", aliases: ["jio"], categoryId: "bills.mobile" },
  { name: "Airtel", aliases: ["airtel"], categoryId: "bills.mobile" },
  { name: "Vodafone Idea", aliases: ["vodafone", "vi"], categoryId: "bills.mobile" },
  { name: "BSNL", aliases: ["bsnl"], categoryId: "bills.mobile" },
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
  { name: "BookMyShow", aliases: ["bookmyshow", "bms"], categoryId: "entertainment.movie" },
  { name: "PVR", aliases: ["pvr", "inox"], categoryId: "entertainment.movie" },
  { name: "Cinepolis", aliases: ["cinepolis"], categoryId: "entertainment.movie" },
  { name: "Carnival Cinemas", aliases: ["carnivalcinemas"], categoryId: "entertainment.movie" },
  { name: "MovieMax", aliases: ["moviemax"], categoryId: "entertainment.movie" },
  // Gaming
  { name: "Steam", aliases: ["steam"], categoryId: "entertainment.games" },
  { name: "Epic Games", aliases: ["epicgames"], categoryId: "entertainment.games" },
  { name: "Nintendo", aliases: ["nintendo"], categoryId: "entertainment.games" },
  // Fitness
  { name: "Cult.fit", aliases: ["cult", "cultfit"], categoryId: "health.gym" },
  // Pharmacy / health
  { name: "Apollo", aliases: ["apollo"], categoryId: "essentials" },
  { name: "PharmEasy", aliases: ["pharmeasy", "1mg", "tata1mg"], categoryId: "essentials" },
  { name: "Netmeds", aliases: ["netmeds"], categoryId: "essentials" },
  { name: "MedPlus", aliases: ["medplus"], categoryId: "essentials" },
  { name: "Practo", aliases: ["practo"], categoryId: "health.doctor" },
  // Insurance
  { name: "LIC", aliases: ["lic"], categoryId: "bills.insurance" },
  { name: "HDFC Life", aliases: ["hdfclife"], categoryId: "bills.insurance" },
  { name: "ICICI Prudential", aliases: ["iciciprudential", "icicipru"], categoryId: "bills.insurance" },
  { name: "Star Health", aliases: ["starhealth"], categoryId: "bills.insurance" },
  { name: "Niva Bupa", aliases: ["nivabupa"], categoryId: "bills.insurance" },
  { name: "Bajaj Allianz", aliases: ["bajajallianz"], categoryId: "bills.insurance" },
  { name: "Tata AIG", aliases: ["tataaig"], categoryId: "bills.insurance" },
  { name: "ACKO", aliases: ["acko"], categoryId: "bills.insurance" },
  { name: "Digit Insurance", aliases: ["digitinsurance", "godigit"], categoryId: "bills.insurance" },
  // Education
  { name: "BYJU'S", aliases: ["byjus"], categoryId: "education" },
  { name: "Unacademy", aliases: ["unacademy"], categoryId: "education" },
  { name: "Vedantu", aliases: ["vedantu"], categoryId: "education" },
  { name: "PhysicsWallah", aliases: ["physicswallah", "pw"], categoryId: "education" },
  { name: "upGrad", aliases: ["upgrad"], categoryId: "education" },
  { name: "Coursera", aliases: ["coursera"], categoryId: "education" },
  { name: "Udemy", aliases: ["udemy"], categoryId: "education" },
  { name: "Scaler", aliases: ["scaler"], categoryId: "education" },
  { name: "GeeksforGeeks", aliases: ["geeksforgeeks", "gfg"], categoryId: "education" },
  // Protein / diet
  { name: "MuscleBlaze", aliases: ["muscleblaze", "optimumnutrition"], categoryId: "essentials" },
  { name: "MyProtein", aliases: ["myprotein"], categoryId: "essentials" },
  { name: "Avvatar", aliases: ["avvatar"], categoryId: "essentials" },
  { name: "The Whole Truth", aliases: ["wholetruth"], categoryId: "essentials" },
  { name: "Epigamia", aliases: ["epigamia"], categoryId: "essentials" },
  // Travel
  { name: "IndiGo", aliases: ["indigo"], categoryId: "travel.flight" },
  { name: "IRCTC", aliases: ["irctc"], categoryId: "travel" },
  { name: "MakeMyTrip", aliases: ["makemytrip", "mmt"], categoryId: "travel" },
  { name: "Goibibo", aliases: ["goibibo"], categoryId: "travel" },
  { name: "Booking.com", aliases: ["bookingcom"], categoryId: "travel.hotel" },
  { name: "Agoda", aliases: ["agoda"], categoryId: "travel.hotel" },
  { name: "Airbnb", aliases: ["airbnb"], categoryId: "travel.hotel" },
  { name: "Cleartrip", aliases: ["cleartrip"], categoryId: "travel" },
  { name: "Yatra", aliases: ["yatra"], categoryId: "travel" },
  { name: "Ixigo", aliases: ["ixigo"], categoryId: "travel" },
  { name: "EaseMyTrip", aliases: ["easemytrip"], categoryId: "travel" },
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
  // Dining — meal-time-specific, so the parser can hand back a Type leaf
  // directly ("lunch with friends" → dining.lunch) instead of just the
  // parent category, matching how confident a human would be from the word.
  { keywords: ["breakfast", "brunch"], categoryId: "dining.breakfast", weight: 8 },
  { keywords: ["lunch"], categoryId: "dining.lunch", weight: 8 },
  { keywords: ["dinner", "supper"], categoryId: "dining.dinner", weight: 8 },
  {
    keywords: ["coffee", "cafe", "cafes", "latte", "cappuccino", "chai", "tea", "espresso", "americano", "mocha", "macchiato", "frappe", "frappuccino", "matcha", "boba"],
    categoryId: "dining.coffee",
    weight: 7,
  },
  {
    keywords: [
      "bakery", "bakeries", "bakehouse", "bakes", "cake", "cakes", "cupcake", "cupcakes",
      "pastry", "pastries", "brownie", "brownies", "cookie", "cookies", "donut", "donuts",
      "doughnut", "doughnuts", "muffin", "muffins", "tart", "tarts", "cheesecake", "macaron",
      "macarons", "confectionery", "patisserie", "croissant", "dessert", "desserts",
    ],
    categoryId: "dining.snacks",
    weight: 7,
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
  // Dining — meal-time-agnostic: no way to tell breakfast from dinner from
  // "biryani" alone, so these stay at the parent category with no Type.
  {
    keywords: [
      "meal", "restaurant", "restaurants", "eatery", "diner", "bistro", "canteen", "dhaba",
      "ate", "eating", "food", "biryani", "pizza", "burger", "thali", "buffet", "tandoor",
      "tandoori", "kebab", "kabab", "paratha", "naan", "roti", "dosa", "idli", "vada",
      "uttapam", "chole", "bhature", "chaat", "golgappa", "bhel", "misal", "poha", "frankie",
      "momos", "chowmein", "manchurian", "bhaji",
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
    keywords: ["delivery", "delivered", "ordered", "order", "takeaway", "takeout", "parcel"],
    categoryId: "dining",
    weight: 6,
  },
  // Transport
  {
    keywords: ["cab", "cabs", "taxi", "taxis", "ride", "auto", "autorickshaw", "rickshaw"],
    categoryId: "transport.cab",
    weight: 8,
  },
  { keywords: ["metro"], categoryId: "transport.metro", weight: 8 },
  { keywords: ["train", "railway"], categoryId: "transport.train", weight: 8 },
  { keywords: ["bus"], categoryId: "transport.bus", weight: 8 },
  { keywords: ["petrol", "diesel", "fuel", "cng"], categoryId: "transport.fuel", weight: 9 },
  { keywords: ["parking", "toll", "fastag"], categoryId: "transport.parking", weight: 9 },
  // Entertainment
  {
    keywords: ["movie", "movies", "cinema", "film", "films", "imax", "theatre", "theater"],
    categoryId: "entertainment.movie",
    weight: 8,
  },
  {
    keywords: ["concert", "concerts", "gig", "standup", "comedy", "show", "shows", "festival", "festivals", "exhibition", "karaoke", "bowling"],
    categoryId: "entertainment.event",
    weight: 8,
  },
  {
    keywords: ["game", "games", "gaming", "playstation", "xbox", "console", "arcade"],
    categoryId: "entertainment.games",
    weight: 8,
  },
  {
    keywords: ["party", "houseparty"],
    categoryId: "entertainment.event",
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
    categoryId: "shopping.clothing",
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
    keywords: [
      "furniture", "decor", "kitchen", "sofa", "mattress", "curtain", "utensils", "cookware",
      "plumber", "electrician", "carpenter", "repair", "repairs", "handyman",
    ],
    categoryId: "shopping.home",
    weight: 7,
  },
  // Gifts
  {
    keywords: ["gift", "gifts", "present", "presents", "voucher"],
    categoryId: "gifts",
    weight: 7,
  },
  // Bills
  { keywords: ["rent"], categoryId: "bills.rent", weight: 10 },
  { keywords: ["recharge", "mobile", "postpaid", "prepaid"], categoryId: "bills.mobile", weight: 9 },
  { keywords: ["internet", "wifi", "broadband", "fiber", "fibre"], categoryId: "bills.internet", weight: 9 },
  { keywords: ["electricity", "water", "utility", "utilities", "lpg", "cylinder", "maintenance"], categoryId: "bills.utilities", weight: 9 },
  { keywords: ["subscription", "subscriptions", "renewal"], categoryId: "bills.subscription", weight: 8 },
  { keywords: ["insurance", "premium", "policy", "mediclaim"], categoryId: "bills.insurance", weight: 9 },
  { keywords: ["fee", "fees", "penalty", "surcharge"], categoryId: "bills.fees", weight: 9 },
  // Health
  {
    keywords: ["gym", "workout", "workouts", "trainer", "training", "fitness", "membership", "boxing", "yoga", "pilates", "crossfit", "zumba", "swimming"],
    categoryId: "health.gym",
    weight: 9,
  },
  {
    keywords: ["dentist", "dental", "dentistry"],
    categoryId: "health.dental",
    weight: 9,
  },
  {
    keywords: ["doctor", "clinic", "hospital", "consultation", "checkup", "diagnostic", "scan", "lab"],
    categoryId: "health.doctor",
    weight: 9,
  },
  { keywords: ["massage", "spa", "therapy", "salon", "haircut", "facial", "grooming", "barber"], categoryId: "health", weight: 8 },
  // Travel
  { keywords: ["flight"], categoryId: "travel.flight", weight: 7 },
  { keywords: ["hotel", "airbnb"], categoryId: "travel.hotel", weight: 7 },
  { keywords: ["trip", "vacation", "holiday"], categoryId: "travel", weight: 6 },
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
  // People
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
  // Purpose
  { keywords: ["commute", "commuting"], context: "commute" },
  { keywords: ["airport"], context: "airport" },
  { keywords: ["personal"], context: "personal" },
  // Occasion
  { keywords: ["birthday"], context: "birthday" },
  { keywords: ["wedding", "marriage"], context: "wedding" },
  { keywords: ["anniversary"], context: "anniversary" },
  { keywords: ["party", "houseparty"], context: "party" },
  { keywords: ["trip", "vacation", "holiday"], context: "vacation" },
  { keywords: ["celebration", "festival", "diwali", "holi"], context: "celebration" },
  // Attributes
  { keywords: ["shared", "split"], context: "shared" },
  { keywords: ["reimbursable", "reimburse", "reimbursed"], context: "reimbursable" },
  { keywords: ["impulse", "impulsive"], context: "impulse" },
];

/** Words that never carry meaning for classification. */
export const STOP_WORDS = new Set([
  "a", "an", "and", "at", "for", "from", "in", "of", "on", "the", "to", "with",
  "was", "were", "is", "it", "my", "me", "i", "we", "some", "few", "got",
  "paid", "spent", "bought", "rs", "rupees", "inr",
]);
