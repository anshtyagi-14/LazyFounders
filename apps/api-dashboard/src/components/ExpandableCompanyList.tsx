'use client';

import React, { useState } from 'react';
import Link from 'next/link';

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

interface ExpandableCompanyListProps {
  companies: string[];
  initialVisible?: number;
}

export function ExpandableCompanyList({ companies, initialVisible = 15 }: ExpandableCompanyListProps) {
  const [expanded, setExpanded] = useState(false);

  const visibleCompanies = expanded ? companies : companies.slice(0, initialVisible);
  const hasMore = companies.length > initialVisible;

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', color: '#a1a1aa', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '0.75rem', fontWeight: 400 }}>
        {visibleCompanies.map((c, i) => (
          <React.Fragment key={c}>
            <Link 
              href={`/company/${slugify(c)}`} 
              style={{ color: '#14b8a6', textDecoration: 'none', transition: 'color 0.2s' }}
              className="hover:text-teal-400"
            >
              {c}
            </Link>
            {i < visibleCompanies.length - 1 && <span>, </span>}
          </React.Fragment>
        ))}
      </div>

      {hasMore && (
        <button 
          onClick={() => setExpanded(!expanded)}
          style={{ display: 'inline-flex', alignItems: 'center', color: '#ffffff', fontSize: '0.8rem', fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer', letterSpacing: '0.5px', marginTop: '0.5rem' }}
        >
          <span style={{ border: '1px solid #ffffff', borderRadius: '2px', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: '6px', fontSize: '14px', paddingBottom: '2px' }}>
            {expanded ? '-' : '+'}
          </span> 
          {expanded ? 'READ LESS' : 'READ MORE'}
        </button>
      )}
    </>
  );
}
