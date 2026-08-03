import React from 'react';
import Link from 'next/link';
import { PrismaClient } from '@prisma/client';
import { ExpandableCompanyList } from './ExpandableCompanyList';

const prisma = new PrismaClient();

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

export async function Footer() {
  // Fetch active companies from the database, populated by the Intelligence Engine's LLM
  let activeCompaniesSet = new Set<string>();
  try {
    const articles = await prisma.originalContent.findMany({
      select: { companies: true },
      take: 2000 // Scan deeply
    });
    
    articles.forEach(a => {
      if (a.companies && Array.isArray(a.companies)) {
        a.companies.forEach(c => activeCompaniesSet.add(c.trim()));
      }
    });
  } catch (e) {
    console.error("Failed to fetch active companies for footer:", e);
  }

  let activeCompanies = Array.from(activeCompaniesSet);

  // Capitalize properly based on dictionary or fallback to Title Case
  activeCompanies = activeCompanies.map(c => {
    return c.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  });

  // If DB doesn't have many known companies yet, inject some defaults so the footer isn't empty
  if (activeCompanies.length < 12) {
    const defaults = ["Zomato", "Swiggy", "Zerodha", "Zoho", "Paytm", "Delhivery", "Nykaa", "PolicyBazaar", "CarTrade", "MapmyIndia", "Freshworks", "Postman"];
    activeCompanies = [...new Set([...activeCompanies, ...defaults])];
  }

  // Split into 4 columns
  const colSize = Math.ceil(activeCompanies.length / 4);
  const columns = [
    { title: "Trending Companies", items: activeCompanies.slice(0, colSize) },
    { title: "Active Startups", items: activeCompanies.slice(colSize, colSize * 2) },
    { title: "Tech Ecosystem", items: activeCompanies.slice(colSize * 2, colSize * 3) },
    { title: "Market Leaders", items: activeCompanies.slice(colSize * 3) }
  ];


  return (
    <footer style={{ width: '100%', backgroundColor: '#030407', borderTop: '1px solid #27272a', textAlign: 'left', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '1160px', margin: '0 auto', padding: '3rem 24px 2rem 24px' }}>
        
        {/* Dynamic Companies Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', borderBottom: '1px solid #27272a', paddingBottom: '3rem', marginBottom: '3rem' }}>
          {columns.map((col, index) => (
            col.items.length > 0 && (
              <div key={index} style={{ textAlign: 'left' }}>
                <h3 style={{ color: '#ffffff', fontWeight: 800, textTransform: 'uppercase', fontSize: '1.1rem', marginBottom: '1rem', letterSpacing: '0.5px' }}>
                  {col.title}
                </h3>
                <ExpandableCompanyList companies={col.items} initialVisible={15} />
              </div>
            )
          ))}
        </div>

        {/* Main Footer Links */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3rem', justifyContent: 'space-between', paddingBottom: '3rem', borderBottom: '1px solid #27272a', marginBottom: '3rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', textAlign: 'left', minWidth: '130px' }}>
            <h3 style={{ color: '#14b8a6', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.9rem', marginBottom: '0.5rem', letterSpacing: '0.5px' }}>Media</h3>
            <Link href="/coming-soon" style={{ color: '#a1a1aa', fontSize: '0.9rem', textDecoration: 'none' }}>News</Link>
            <Link href="/coming-soon" style={{ color: '#a1a1aa', fontSize: '0.9rem', textDecoration: 'none' }}>In-Depth</Link>
            <Link href="/coming-soon" style={{ color: '#a1a1aa', fontSize: '0.9rem', textDecoration: 'none' }}>Startup Spotlight</Link>
            <Link href="/coming-soon" style={{ color: '#a1a1aa', fontSize: '0.9rem', textDecoration: 'none' }}>Newsletter</Link>
            <Link href="/coming-soon" style={{ color: '#a1a1aa', fontSize: '0.9rem', textDecoration: 'none' }}>Resources</Link>
            <Link href="/coming-soon" style={{ color: '#a1a1aa', fontSize: '0.9rem', textDecoration: 'none' }}>Events</Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', textAlign: 'left', minWidth: '130px' }}>
            <h3 style={{ color: '#14b8a6', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.9rem', marginBottom: '0.5rem', letterSpacing: '0.5px' }}>Intel</h3>
            <Link href="/coming-soon" style={{ color: '#a1a1aa', fontSize: '0.9rem', textDecoration: 'none' }}>Reports</Link>
            <Link href="/coming-soon" style={{ color: '#a1a1aa', fontSize: '0.9rem', textDecoration: 'none' }}>Data</Link>
            <Link href="/coming-soon" style={{ color: '#a1a1aa', fontSize: '0.9rem', textDecoration: 'none' }}>Analysis</Link>
            <Link href="/coming-soon" style={{ color: '#a1a1aa', fontSize: '0.9rem', textDecoration: 'none' }}>Insights</Link>
            <Link href="/coming-soon" style={{ color: '#a1a1aa', fontSize: '0.9rem', textDecoration: 'none' }}>Trends</Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', textAlign: 'left', minWidth: '130px' }}>
            <h3 style={{ color: '#14b8a6', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.9rem', marginBottom: '0.5rem', letterSpacing: '0.5px' }}>Company</h3>
            <Link href="/coming-soon" style={{ color: '#a1a1aa', fontSize: '0.9rem', textDecoration: 'none' }}>About Us</Link>
            <Link href="/coming-soon" style={{ color: '#a1a1aa', fontSize: '0.9rem', textDecoration: 'none' }}>Careers</Link>
            <Link href="/coming-soon" style={{ color: '#a1a1aa', fontSize: '0.9rem', textDecoration: 'none' }}>Contact</Link>
            <Link href="/coming-soon" style={{ color: '#a1a1aa', fontSize: '0.9rem', textDecoration: 'none' }}>Advertise</Link>
            <Link href="/coming-soon" style={{ color: '#a1a1aa', fontSize: '0.9rem', textDecoration: 'none' }}>Partnerships</Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', textAlign: 'left', minWidth: '130px' }}>
            <h3 style={{ color: '#14b8a6', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.9rem', marginBottom: '0.5rem', letterSpacing: '0.5px' }}>Legal</h3>
            <Link href="/coming-soon" style={{ color: '#a1a1aa', fontSize: '0.9rem', textDecoration: 'none' }}>Privacy Policy</Link>
            <Link href="/coming-soon" style={{ color: '#a1a1aa', fontSize: '0.9rem', textDecoration: 'none' }}>Terms of Service</Link>
            <Link href="/coming-soon" style={{ color: '#a1a1aa', fontSize: '0.9rem', textDecoration: 'none' }}>Cookie Policy</Link>
            <Link href="/coming-soon" style={{ color: '#a1a1aa', fontSize: '0.9rem', textDecoration: 'none' }}>Disclaimer</Link>
          </div>

          {/* Socials & Subscribe Placeholder */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '200px' }}>
             <h3 style={{ color: '#14b8a6', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.9rem', marginBottom: '0.5rem', letterSpacing: '0.5px' }}>Stay Updated</h3>
             <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input type="email" placeholder="Your email address" style={{ backgroundColor: '#18181b', border: '1px solid #27272a', padding: '0.5rem 1rem', borderRadius: '4px', color: '#fff', fontSize: '0.9rem', outline: 'none', flex: 1 }} />
                <button style={{ backgroundColor: '#14b8a6', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}>Subscribe</button>
             </div>
             <p style={{ color: '#71717a', fontSize: '0.8rem', margin: 0 }}>Get the latest updates directly to your inbox.</p>
          </div>
        </div>

        {/* Copyright */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <p style={{ color: '#71717a', fontSize: '0.85rem', margin: 0 }}>
            © {new Date().getFullYear()} SEO Toolkit by LazyFounders. All rights reserved.
          </p>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <span style={{ color: '#71717a', fontSize: '0.85rem' }}>Built for scale.</span>
          </div>
        </div>

      </div>
    </footer>
  );
}
