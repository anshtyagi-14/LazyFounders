/**
 * The company universe the site navigates by.
 *
 * These lists were inlined in the company page; the masthead dropdown and the
 * footer need them too, so they live here and are imported in all three places.
 * They are a curated directory, not a table: there is no Company model in the
 * schema, only an `Article.companies` string array that stories are matched against.
 */

export const UNICORNS = ["Zomato", "Zoho", "Zetwerk", "Zeta", "Zerodha", "Zepto", "Zenoti", "Yubi", "Xpressbees", "Vedantu", "Urban Company", "Upstox", "upGrad", "Uniphore", "Unacademy", "Udaan", "Swiggy", "Spinny", "Snapdeal", "Slice", "Shopclues", "Shiprocket", "ShareChat", "Rivigo", "ReNew Energy"];

export const SOONICORNS = ["CarTrade", "FINO PayTech", "Infibeam Avenues", "Nazara Technologies", "Absolute", "Adda247", "Aequs", "Atlan", "BankBazaar", "BetterPlace", "Bira 91", "Bizongo", "BlueStone", "BluSmart", "BookMyShow", "BrightChamps", "Capillary Technologies", "Capital Float", "Captain Fresh", "Cashfree Payments", "Chaayos", "Chalo", "CityMall", "Classplus", "Clear"];

export const LISTED_TECH = ["MapmyIndia", "CarTrade", "Delhivery", "FINO PayTech", "EaseMyTrip", "Nykaa", "ideaForge", "IndiaMART", "Infibeam Avenues", "Info Edge", "Nazara Technologies", "Paytm", "PolicyBazaar", "RateGain", "Tracxn", "Yatra", "Zaggle", "Zomato", "Mamaearth", "TAC Security", "Digit Insurance", "Awfis", "Ixigo", "Menhood", "Ola Electric", "FirstCry", "Unicommerce"];

export const INVESTORS = ["Peak XV Partners", "Blume Ventures", "Venture Catalysts", "Inflection Point Ventures", "Matrix Partners India", "Kalaari Capital", "Mumbai Angels", "9Unicorns Accelerator Fund", "Indian Angel Network", "Titan Capital", "3one4 Capital", "Elevation Capital", "Brand Capital", "InnoVen Capital", "India Quotient", "Chiratae Ventures", "Trifecta Capital Advisors", "Alteria Capital", "Axilor Ventures", "Kae Capital", "100X.VC", "ah! Ventures", "Fireside Ventures", "Lightspeed India Partners", "Orios Venture Partners"];

/** Every name the /company/[slug] route will resolve, de-duplicated. */
export const ALL_COMPANIES: string[] = [...new Set([...UNICORNS, ...SOONICORNS, ...LISTED_TECH, ...INVESTORS])];

/** The groups shown in the masthead Companies dropdown. */
export const COMPANY_GROUPS: { title: string; items: string[] }[] = [
  { title: 'Unicorns', items: UNICORNS },
  { title: 'Soonicorns', items: SOONICORNS },
  { title: 'Listed tech', items: LISTED_TECH },
  { title: 'Investors', items: INVESTORS },
];

/** A company hub is listed in the sitemap once at least this many stories mention it. */
export const MIN_COMPANY_STORIES = 1;
