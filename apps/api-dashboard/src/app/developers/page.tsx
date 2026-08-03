'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function DevelopersDashboard() {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  const fetchKeys = async () => {
    try {
      const res = await fetch('/api/keys');
      const data = await res.json();
      if (data.success) {
        setKeys(data.keys);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName })
      });
      const data = await res.json();
      if (data.success) {
        setNewKeyName('');
        fetchKeys();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/keys/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus })
      });
      const data = await res.json();
      if (data.success) {
        fetchKeys();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const totalRequests = keys.reduce((sum, k) => sum + k.requestsCount, 0);
  const activeKeysCount = keys.filter(k => k.isActive).length;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#05070A] text-slate-900 dark:text-white p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10 border-b border-slate-200 dark:border-white/10 pb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Developer API Hub</h1>
            <p className="text-slate-500 dark:text-slate-400">Programmatic API Gateway for direct access to internal microservices.</p>
          </div>
          <Link href="/dashboard" className="px-4 py-2 border border-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors">
            &larr; Back to Dashboard
          </Link>
        </header>

        {/* Top Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-slate-50 dark:bg-[#121820] rounded-xl p-6 ring-1 ring-slate-200 dark:ring-white/10">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">Total API Requests</h3>
            <p className="text-4xl font-black text-teal-500 font-mono">{totalRequests}</p>
          </div>
          <div className="bg-slate-50 dark:bg-[#121820] rounded-xl p-6 ring-1 ring-slate-200 dark:ring-white/10">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">Active API Keys</h3>
            <p className="text-4xl font-black font-mono">{activeKeysCount}</p>
          </div>
          <div className="bg-slate-50 dark:bg-[#121820] rounded-xl p-6 ring-1 ring-slate-200 dark:ring-white/10">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">Available Endpoints</h3>
            <p className="text-4xl font-black font-mono">4</p>
          </div>
        </div>

        {/* Key Management — Full Width */}
        <section className="bg-slate-50 dark:bg-[#121820] rounded-2xl p-6 ring-1 ring-slate-200 dark:ring-white/10 mb-10">
          <h2 className="text-xl font-bold mb-6">Manage API Keys</h2>
          
          <form onSubmit={handleCreateKey} className="flex gap-3 mb-8">
            <input 
              type="text" 
              placeholder="Enter key name (e.g. Production Scraper)" 
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="flex-1 px-4 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-teal-500"
              style={{ backgroundColor: '#1e293b', color: '#f8fafc', borderColor: '#334155' }}
            />
            <button type="submit" className="px-6 py-2 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap">
              Generate New Key
            </button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="py-3 px-2 text-sm font-semibold text-slate-500">NAME</th>
                  <th className="py-3 px-2 text-sm font-semibold text-slate-500 w-full">API KEY</th>
                  <th className="py-3 px-2 text-sm font-semibold text-slate-500">REQUESTS</th>
                  <th className="py-3 px-2 text-sm font-semibold text-slate-500">STATUS</th>
                  <th className="py-3 px-2 text-sm font-semibold text-slate-500 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-500">Loading keys...</td></tr>
                ) : keys.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-500">No API keys found. Generate one above.</td></tr>
                ) : (
                  keys.map((k) => (
                    <tr key={k.id} className="border-b border-slate-200 dark:border-slate-800/50 transition-colors hover:bg-slate-50/50 dark:hover:bg-[#151c24]">
                      <td className="py-4 px-2 font-medium">{k.name}</td>
                      <td className="py-4 px-2">
                        <div className="flex items-center gap-2">
                          <code 
                            className="px-3 py-1.5 rounded text-xs text-teal-400 font-mono tracking-wider transition-all duration-300" 
                            style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', width: '340px', display: 'inline-block', overflow: 'hidden' }}
                          >
                            {visibleKeys.has(k.id) ? k.key : '••••••••••••••••••••••••••••••••••••••••'}
                          </code>
                          <button
                            onClick={() => toggleKeyVisibility(k.id)}
                            className="text-slate-400 hover:text-teal-400 transition-colors duration-200 focus:outline-none"
                            title={visibleKeys.has(k.id) ? "Hide key" : "Show key"}
                          >
                            {visibleKeys.has(k.id) ? (
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
                                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
                                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
                                <line x1="2" y1="2" x2="22" y2="22"/>
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                                <circle cx="12" cy="12" r="3"/>
                              </svg>
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="py-4 px-2 font-mono">{k.requestsCount}</td>
                      <td className="py-4 px-2">
                        {k.isActive ? (
                          <span className="bg-green-500/10 text-green-500 text-xs px-2 py-1 rounded-full font-bold">ACTIVE</span>
                        ) : (
                          <span className="bg-red-500/10 text-red-500 text-xs px-2 py-1 rounded-full font-bold">REVOKED</span>
                        )}
                      </td>
                      <td className="py-4 px-2 text-right">
                        <button 
                          onClick={() => handleToggleStatus(k.id, k.isActive)}
                          className={`text-xs px-3 py-1 rounded font-bold transition-colors ${k.isActive ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'}`}
                        >
                          {k.isActive ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* API Reference — Horizontal Cards */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
            </div>
            <span className="text-xs text-slate-500 font-mono">README.md — API Reference</span>
          </div>

          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Use your API keys to directly trigger background microservices. All endpoints expect a <code className="text-teal-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">POST</code> request with the <code className="text-teal-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">Authorization: Bearer &lt;KEY&gt;</code> header.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { id: 'discovery', number: '1', title: 'Discovery', endpoint: '/api/v1/discovery', accent: 'from-teal-400 to-teal-600', badge: 'bg-teal-500/15 text-teal-400', curl: `curl -X POST http://localhost:3000/api/v1/discovery \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"url":"https://example.com"}'` },
              { id: 'scraper', number: '2', title: 'Scraper', endpoint: '/api/v1/scrape', accent: 'from-blue-400 to-blue-600', badge: 'bg-blue-500/15 text-blue-400', curl: `curl -X POST http://localhost:3000/api/v1/scrape \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"url":"https://example.com/article"}'` },
              { id: 'categorize', number: '3', title: 'Categorization AI', endpoint: '/api/v1/categorize', accent: 'from-purple-400 to-purple-600', badge: 'bg-purple-500/15 text-purple-400', curl: `curl -X POST http://localhost:3000/api/v1/categorize \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"text":"Raw scraped article text..."}'` },
              { id: 'intelligence', number: '4', title: 'Intelligence AI', endpoint: '/api/v1/intelligence', accent: 'from-amber-400 to-amber-600', badge: 'bg-amber-500/15 text-amber-400', curl: `curl -X POST http://localhost:3000/api/v1/intelligence \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"text":"Article text...", "category":"Finance"}'` },
            ].map((api) => (
              <div key={api.id} className="bg-black rounded-xl border border-slate-800 overflow-hidden flex flex-col hover:border-slate-700 transition-colors group">
                {/* Color accent bar */}
                <div className={`h-1 bg-gradient-to-r ${api.accent}`} />
                {/* Header */}
                <div className="p-4 pb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-500 font-mono text-xs">#{api.number}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${api.badge}`}>POST</span>
                  </div>
                  <h3 className="text-white font-bold text-sm mb-1">{api.title}</h3>
                  <code className="text-slate-500 text-[11px] font-mono">{api.endpoint}</code>
                </div>
                {/* Code block */}
                <div className="px-4 pb-3 flex-1 relative">
                  <pre className="bg-slate-900/80 rounded-lg p-3 text-[11px] text-slate-300 font-mono overflow-x-auto whitespace-pre border border-slate-800/50 max-h-[120px]">
                    {api.curl}
                  </pre>
                </div>
                {/* Copy button */}
                <div className="px-4 pb-4">
                  <button
                    onClick={() => handleCopy(api.curl, api.id)}
                    className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                      copiedId === api.id
                        ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                        : 'bg-slate-800/80 text-slate-400 border border-slate-700 hover:text-white hover:border-slate-600'
                    }`}
                  >
                    {copiedId === api.id ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        Copy curl
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
