'use client';

import React, { useEffect, useState } from 'react';

type Source = {
  id: string;
  name: string;
  domain: string;
  baseUrl: string;
  crawlFrequency: string;
  enabled: boolean;
  lastCrawledAt: string | null;
};

export default function SourcesManagement() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFreq, setEditFreq] = useState('');

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/admin/sources');
      const data = await res.json();
      setSources(data.sources || []);
    } catch (err) {
      console.error('Failed to fetch sources', err);
    } finally {
      setLoading(false);
    }
  };

  const saveCron = async (id: string) => {
    try {
      const res = await fetch(`http://localhost:3001/api/admin/sources/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crawlFrequency: editFreq })
      });
      if (res.ok) {
        setEditingId(null);
        fetchSources();
      }
    } catch (err) {
      console.error('Failed to update source', err);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Sources & Cron Jobs</h1>
        <button className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
          + Add New Source
        </button>
      </div>

      <div className="bg-white dark:bg-[#121820] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">Loading sources...</div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-white/5 text-sm uppercase text-slate-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Domain</th>
                <th className="px-6 py-4 font-semibold w-full">Base URL</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Cron Schedule</th>
                <th className="px-6 py-4 font-semibold">Last Crawled</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/10 text-sm">
              {sources.filter(s => s.domain !== 'manual.local').map((source) => (
                <tr key={source.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 font-medium">{source.domain}</td>
                  <td className="px-6 py-4 text-slate-500 truncate max-w-[200px]">{source.baseUrl}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${source.enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-400'}`}>
                      {source.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {editingId === source.id ? (
                      <div className="flex items-center gap-2">
                        <input 
                          type="text" 
                          value={editFreq} 
                          onChange={e => setEditFreq(e.target.value)}
                          className="px-2 py-1 bg-white dark:bg-[#05070A] text-slate-900 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded text-sm w-32 outline-none focus:ring-1 focus:ring-teal-500"
                        />
                        <button onClick={() => saveCron(source.id)} className="text-teal-600 hover:text-teal-500 font-bold">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-300">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 group">
                        <code className="bg-slate-100 dark:bg-black px-2 py-1 rounded text-slate-700 dark:text-slate-300">{source.crawlFrequency}</code>
                        <button onClick={() => { setEditingId(source.id); setEditFreq(source.crawlFrequency); }} className="text-slate-400 hover:text-teal-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          ✏️
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {source.lastCrawledAt ? new Date(source.lastCrawledAt).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <a href={`/admin/logs?domain=${source.domain}`} className="text-indigo-600 hover:text-indigo-500 font-medium">View Logs</a>
                  </td>
                </tr>
              ))}
              {sources.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No sources found. Add one to start crawling.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
