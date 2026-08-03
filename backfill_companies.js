const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

const KNOWN_COMPANIES = new Set([
  "Zomato", "Zoho", "Zetwerk", "Zeta", "Zerodha", "Zepto", "Zenoti", "Yubi", "Xpressbees", "Vedantu", 
  "Urban Company", "Upstox", "upGrad", "Uniphore", "Unacademy", "Udaan", "Swiggy", "Spinny", "Snapdeal", 
  "Slice", "Shopclues", "Shiprocket", "ShareChat", "Rivigo", "ReNew Energy", "CarTrade", "FINO PayTech", 
  "Infibeam Avenues", "Nazara Technologies", "Absolute", "Adda247", "Aequs", "Atlan", "BankBazaar", 
  "BetterPlace", "Bira 91", "Bizongo", "BlueStone", "BluSmart", "BookMyShow", "BrightChamps", 
  "Capillary Technologies", "Capital Float", "Captain Fresh", "Cashfree Payments", "Chaayos", "Chalo", 
  "CityMall", "Classplus", "Clear", "MapmyIndia", "Delhivery", "EaseMyTrip", "Nykaa", "ideaForge", 
  "IndiaMART", "Info Edge", "Paytm", "PolicyBazaar", "RateGain", "Tracxn", "Yatra", "Zaggle", "Mamaearth", 
  "TAC Security", "Digit Insurance", "Awfis", "Ixigo", "Menhood", "Ola Electric", "FirstCry", "Unicommerce",
  "Flipkart", "Ola", "Oyo", "Byjus", "Razorpay", "Pine Labs", "Postman", "Lenskart", "Dream11", "Cred",
  "Meesho", "PharmEasy", "Groww", "BharatPe", "Digit", "Eruditus", "CoinDCX", "CoinSwitch", "MobiKwik",
  "Freshworks", "BrowserStack", "Chargebee", "Darwinbox", "Hasura", "Mindtickle", "Icertis", "Druva",
  "Gupshup", "Amagi", "Innovaccer", "Fractal", "Lead School", "PhysicsWallah", "Purplle", "Livspace",
  "NoBroker", "Cars24", "Droom", "Curefit", "HealthifyMe", "Practo", "1mg", "Netmeds", "Medikabazaar",
  "Licious", "TenderCuts", "FreshToHome", "Country Delight", "Blinkit", "Dunzo", "BigBasket",
  "Grofers", "Pepperfry", "UrbanLadder", "Myntra", "Ajio", "Tata Cliq", "JioMart", "Reliance",
  "TCS", "Infosys", "Wipro", "HCL", "Tech Mahindra", "Mindtree", "LTI", "Mphasis", "Coforge", "Persistent",
  "Google", "Microsoft", "Amazon", "Apple", "Meta", "Facebook", "Netflix", "Tesla", "Nvidia", "AMD",
  "Intel", "IBM", "Oracle", "Salesforce", "Adobe", "Cisco", "SAP", "ServiceNow", "Snowflake", "Palantir",
  "Uber", "Airbnb", "DoorDash", "Instacart", "Stripe", "Square", "PayPal", "Shopify", "Coinbase", "Robinhood",
  "OpenAI", "Anthropic", "Midjourney", "Stability AI", "Hugging Face", "Cohere", "Scale AI", "Glean", "Perplexity",
  "Peak XV Partners", "Blume Ventures", "Venture Catalysts", "Inflection Point Ventures", "Matrix Partners India", 
  "Kalaari Capital", "Mumbai Angels", "9Unicorns", "Indian Angel Network", "Titan Capital", "3one4 Capital", 
  "Elevation Capital", "Brand Capital", "InnoVen Capital", "India Quotient", "Chiratae Ventures", 
  "Trifecta Capital", "Alteria Capital", "Axilor Ventures", "Kae Capital", "100X.VC", "ah! Ventures", 
  "Fireside Ventures", "Lightspeed", "Orios Venture Partners", "Sequoia", "Andreessen Horowitz", "a16z",
  "Y Combinator", "Techstars", "500 Startups", "Founders Fund", "Benchmark", "Greylock", "Kleiner Perkins"
].map(c => c.toLowerCase()));

async function main() {
  console.log("Starting backfill of companies...");
  const articles = await prisma.originalContent.findMany({
    select: { id: true, keywords: true, seoTitle: true }
  });

  let updatedCount = 0;
  for (const article of articles) {
    let extractedCompanies = new Set();
    
    // Check keywords
    if (article.keywords) {
      article.keywords.forEach(k => {
        if (KNOWN_COMPANIES.has(k.toLowerCase().trim())) {
          extractedCompanies.add(k.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
        }
      });
    }

    // Check title just in case
    const titleWords = article.seoTitle ? article.seoTitle.split(/[\s,.-]+/) : [];
    titleWords.forEach(w => {
      if (KNOWN_COMPANIES.has(w.toLowerCase().trim())) {
        extractedCompanies.add(w.charAt(0).toUpperCase() + w.slice(1));
      }
    });

    if (extractedCompanies.size > 0) {
      const companiesArray = Array.from(extractedCompanies);
      await prisma.originalContent.update({
        where: { id: article.id },
        data: { companies: companiesArray }
      });
      updatedCount++;
      console.log(`Updated article ${article.id} with companies:`, companiesArray);
    }
  }

  console.log(`Backfill complete. Updated ${updatedCount} articles.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
