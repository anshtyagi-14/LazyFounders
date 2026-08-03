import React from 'react';
import { PrismaClient } from '@prisma/client';
import Link from 'next/link';
import { SafeImage } from '../../../components/SafeImage';

const prisma = new PrismaClient();

const UNICORNS = ["Zomato", "Zoho", "Zetwerk", "Zeta", "Zerodha", "Zepto", "Zenoti", "Yubi", "Xpressbees", "Vedantu", "Urban Company", "Upstox", "upGrad", "Uniphore", "Unacademy", "Udaan", "Swiggy", "Spinny", "Snapdeal", "Slice", "Shopclues", "Shiprocket", "ShareChat", "Rivigo", "ReNew Energy"];
const SOONICORNS = ["CarTrade", "FINO PayTech", "Infibeam Avenues", "Nazara Technologies", "Absolute", "Adda247", "Aequs", "Atlan", "BankBazaar", "BetterPlace", "Bira 91", "Bizongo", "BlueStone", "BluSmart", "BookMyShow", "BrightChamps", "Capillary Technologies", "Capital Float", "Captain Fresh", "Cashfree Payments", "Chaayos", "Chalo", "CityMall", "Classplus", "Clear"];
const LISTED_TECH = ["MapmyIndia", "CarTrade", "Delhivery", "FINO PayTech", "EaseMyTrip", "Nykaa", "ideaForge", "IndiaMART", "Infibeam Avenues", "Info Edge", "Nazara Technologies", "Paytm", "PolicyBazaar", "RateGain", "Tracxn", "Yatra", "Zaggle", "Zomato", "Mamaearth", "TAC Security", "Digit Insurance", "Awfis", "Ixigo", "Menhood", "Ola Electric", "FirstCry", "Unicommerce"];
const INVESTORS = ["Peak XV Partners", "Blume Ventures", "Venture Catalysts", "Inflection Point Ventures", "Matrix Partners India", "Kalaari Capital", "Mumbai Angels", "9Unicorns Accelerator Fund", "Indian Angel Network", "Titan Capital", "3one4 Capital", "Elevation Capital", "Brand Capital", "InnoVen Capital", "India Quotient", "Chiratae Ventures", "Trifecta Capital Advisors", "Alteria Capital", "Axilor Ventures", "Kae Capital", "100X.VC", "ah! Ventures", "Fireside Ventures", "Lightspeed India Partners", "Orios Venture Partners"];

const ALL_COMPANIES = [...UNICORNS, ...SOONICORNS, ...LISTED_TECH, ...INVESTORS];

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

export default async function CompanyNewsPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug || '';

  // 1. Find the exact case-sensitive company name from our constants, or fallback to capitalized slug
  const matchedCompany = ALL_COMPANIES.find(c => slugify(c) === slug) || 
                         slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

  // 2. Fetch articles mentioning this company
  let articles: any[] = [];
  try {
    articles = await prisma.originalContent.findMany({
      where: {
        companies: {
          hasSome: [matchedCompany, matchedCompany.toLowerCase()]
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 50
    });
  } catch (error) {
    console.error(`Error fetching articles for company ${matchedCompany}:`, error);
  }

  // 3. Render the UI
  return (
    <div className="min-h-screen bg-[#05070A] text-slate-200 font-sans pb-20">
      {/* Header */}
      <div className="border-b border-white/5 bg-[#0a0d14]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Link href="/" className="text-teal-500 hover:text-teal-400 text-sm font-medium flex items-center gap-2 mb-4 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Home
          </Link>
          <h1 className="text-4xl font-extrabold text-white tracking-tight flex items-center gap-4">
            <span className="bg-teal-500/20 text-teal-400 p-3 rounded-xl border border-teal-500/30">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </span>
            {matchedCompany} Intelligence
          </h1>
          <p className="text-slate-400 mt-3 text-lg">Latest news, articles, and AI insights covering {matchedCompany}.</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 mt-12">
        {articles.length === 0 ? (
          <div className="bg-[#0c1017] border border-white/5 rounded-3xl p-12 text-center flex flex-col items-center justify-center">
            <div className="bg-white/5 p-4 rounded-full mb-4">
              <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5L18.5 7H20" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">No active intelligence found</h3>
            <p className="text-slate-500 max-w-md">Our AI scrapers haven't picked up any recent articles or news covering {matchedCompany} yet. Check back soon!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map((article: any) => (
              <Link href={`/news/article/${article.slug}`} key={article.id} className="group">
                <div className="bg-[#0c1017] border border-white/5 rounded-2xl overflow-hidden hover:border-teal-500/30 transition-all duration-300 h-full flex flex-col shadow-lg hover:shadow-teal-500/10 hover:-translate-y-1">
                  
                  {/* Article Image Placeholder */}
                  <div className="h-48 bg-slate-900 w-full relative overflow-hidden border-b border-white/5">
                    {article.headerImage ? (
                      <SafeImage src={article.headerImage} alt={article.seoTitle} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-300" />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-teal-900/40 to-slate-900 flex items-center justify-center">
                        <svg className="w-10 h-10 text-teal-500/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5L18.5 7H20" />
                        </svg>
                      </div>
                    )}
                    <div className="absolute top-4 left-4">
                       <span className="bg-black/60 backdrop-blur-md text-teal-400 text-xs font-bold px-3 py-1.5 rounded-full border border-teal-500/20 uppercase tracking-wider">
                         AI Optimized
                       </span>
                    </div>
                  </div>
                  
                  {/* Article Content */}
                  <div className="p-6 flex flex-col flex-grow">
                    <h2 className="text-lg font-bold text-slate-200 group-hover:text-teal-400 transition-colors leading-tight mb-3 line-clamp-3">
                      {article.seoTitle}
                    </h2>
                    <p className="text-slate-500 text-sm line-clamp-3 mb-6">
                      {article.metaDescription}
                    </p>
                    
                    <div className="mt-auto flex items-center justify-between">
                      <span className="text-xs text-slate-500 font-medium">
                        {new Date(article.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span className="text-teal-500 group-hover:translate-x-1 transition-transform">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
