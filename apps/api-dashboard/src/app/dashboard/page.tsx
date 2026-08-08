'use client';
import React, { useState, useEffect, useRef } from "react";
import Link from 'next/link';

export default function ApiDashboard() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('IDLE');
  const [finalData, setFinalData] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [queueStats, setQueueStats] = useState<any[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const statsRes = await fetch('/api/stats');
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          if (statsData.success) setStats(statsData.stats);
        }
        
        const queuesRes = await fetch('/api/queues');
        if (queuesRes.ok) {
          const queuesData = await queuesRes.json();
          if (queuesData.success) setQueueStats(queuesData.stats);
        }
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      }
    };
    
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (consoleEndRef.current) {
        consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handlePipelineTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setStatus('STARTING');
    setLogs([`> Initializing pipeline for: ${url}`]);
    setFinalData(null);

    try {
      const response = await fetch('/api/pipeline/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await response.json();
      
      if (data.success) {
        if (data.cached && data.data) {
          // Already processed — show result immediately, no polling needed
          setLogs(prev => [...prev, '> Found existing article in database. Skipping queues...']);
          if (data.pipelineStats) {
            const s = data.pipelineStats;
            setLogs(prev => [...prev,
              `> ── Pipeline Summary ──────────────────`,
              `>   Total Scraped:    ${s.totalScraped} URLs`,
              `>   Duplicates Found: ${s.duplicates}`,
              `>   New Articles:     ${s.newArticles}`,
              `> ─────────────────────────────────────`,
            ]);
          }
          setFinalData(data.data);
          setLogs(prev => [...prev, '> Loaded cached result. No pipeline triggered.']);
          setStatus('DONE');
        } else {
          // Fresh run — start polling
          startPolling(data.urlHash);
        }
      } else {
        setStatus('ERROR');
        setLogs(prev => [...prev, `> ERROR: ${data.error || 'Failed to trigger pipeline'}`]);
      }
    } catch (err: any) {
      setStatus('ERROR');
      setLogs(prev => [...prev, `> ERROR: ${err.message}`]);
    }
  };

  const handleDiscoverSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setStatus('POLLING');
    setLogs([`> Initializing full site discovery for: ${url}`, `> Discovery service tracking sitemaps...`]);
    setFinalData(null);
    try {
      const res = await fetch('/api/pipeline/discover-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (!data.success) {
        setStatus('ERROR');
        setLogs(prev => [...prev, `> ERROR: ${data.error}`]);
      } else {
        setStatus('DONE');
        const s = data.stats;
        if (s) {
          setLogs(prev => [...prev, 
            `> ── Discovery Complete ───────────────`,
            `>   Sitemaps Processed: ${s.sitemapsProcessed}`,
            `>   Total URLs Found:   ${s.totalUrls}`,
            `>   New Articles:       ${s.newUrls}`,
            `>   Updated Articles:   ${s.updatedUrls}`,
            `> ─────────────────────────────────────`,
            `> ✅ Queued ${s.newUrls + s.updatedUrls} articles for processing!`,
            `> Check the worker queues below for real-time progress!`
          ]);
        } else {
          setLogs(prev => [...prev, `> Discovery complete! Check live queues.`]);
        }
      }
    } catch(err: any) {
      setStatus('ERROR');
      setLogs(prev => [...prev, `> ERROR: ${err.message}`]);
    }
  };

  const startPolling = (hash: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current as NodeJS.Timeout);
    setLogs(prev => [...prev, `> Discovery service initiated tracking. ID: ${hash}`]);
    
    pollingRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/pipeline/status/${hash}`);
        const data = await response.json();
        
        setStatus(data.status);
        if (data.message) {
            setLogs(prev => {
                const last = prev[prev.length - 1];
                const baseMessage = `> ${data.message}`;
                
                if (last.startsWith(baseMessage)) {
                    // Extract existing seconds or default to 0
                    const match = last.match(/\((\d+)s\)/);
                    const seconds = match ? parseInt(match[1], 10) : 0;
                    // We poll every 2 seconds, so add 2
                    return [...prev.slice(0, -1), `${baseMessage} (${seconds + 2}s)`];
                }
                
                // New message
                return [...prev, `${baseMessage} (0s)`];
            });
        }

        if (data.status === 'DONE' || data.status === 'ERROR') {
          if (pollingRef.current) clearInterval(pollingRef.current as NodeJS.Timeout);
          if (data.data) {
            if (data.pipelineStats) {
              const s = data.pipelineStats;
              setLogs(prev => [...prev,
                `> ── Pipeline Summary ──────────────────`,
                `>   Total Scraped:    ${s.totalScraped} URLs`,
                `>   Duplicates Found: ${s.duplicates}`,
                `>   New Articles:     ${s.newArticles}`,
                `> ─────────────────────────────────────`,
              ]);
            }
            setFinalData(data.data);
            setLogs(prev => [...prev, '> Pipeline finished successfully.']);
          }
        }
      } catch (err: any) {
        console.error('Polling error:', err);
      }
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current as NodeJS.Timeout);
    };
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-[#05070A] text-slate-900 dark:text-white p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10 border-b border-slate-200 dark:border-white/10 pb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">API Command Center</h1>
            <p className="text-slate-500 dark:text-slate-400">Trigger pipelines and monitor system APIs.</p>
          </div>
          <div className="flex gap-4 items-center">
            <Link href="/developers" className="px-4 py-2 rounded-lg text-sm font-bold transition-all" style={{ backgroundColor: '#14b8a6', color: '#ffffff' }}>
              Developer API Hub &rarr;
            </Link>
            <Link href="/" className="px-4 py-2 rounded-lg text-sm font-bold border border-slate-700 transition-all hover:bg-slate-800" style={{ color: '#e2e8f0' }}>
              View Frontend &rarr;
            </Link>
          </div>
        </header>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <section className="bg-slate-50 dark:bg-[#121820] rounded-2xl p-6 ring-1 ring-slate-200 dark:ring-white/10">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                Run Discovery Pipeline
              </h2>
              <form onSubmit={handleDiscoverSite} className="flex flex-col sm:flex-row gap-3">
                <input 
                  type="url" 
                  placeholder="Enter domain URL (e.g., https://techcrunch.com/)" 
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  className="flex-1 px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-teal-500/50 pipeline-input"
                />
                <button 
                  type="submit" 
                  disabled={status === 'POLLING'}
                  className="px-6 py-3 bg-teal-600 text-white font-bold rounded-lg disabled:opacity-50 hover:bg-teal-700 transition-colors whitespace-nowrap"
                >
                  {status === 'POLLING' ? 'Processing...' : 'Run Full Discovery'}
                </button>
              </form>
              
              {logs.length > 0 && (
                <div className="mt-6 p-4 rounded-xl border border-slate-800 shadow-inner overflow-hidden font-mono text-sm console-bg">
                  <div className="flex items-center gap-2 mb-3 px-2 text-slate-400 text-xs uppercase tracking-wider">
                     <span className={`w-2 h-2 rounded-full ${status === 'ERROR' ? 'bg-red-500' : status === 'DONE' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                     Pipeline Console
                  </div>
                  <div className="h-48 overflow-y-auto px-2 space-y-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                    {logs.map((log, i) => (
                        <div key={i} className={
                          log.includes('ERROR') ? 'console-text-error' : 
                          log.includes('finished') ? 'console-text-success font-bold' : 
                          log.includes('Pipeline Summary') || log.includes('──') ? 'text-cyan-400' :
                          log.includes('Total Scraped') || log.includes('Duplicates Found') || log.includes('New Articles') ? 'text-cyan-300 font-semibold' :
                          'console-text-default'
                        }>
                            {log}
                        </div>
                    ))}
                    <div ref={consoleEndRef} />
                  </div>
                  
                  {finalData && (
                    <div className="mt-4 p-4 border-t border-slate-800 bg-slate-800/50 dark:bg-[#0d1117] rounded-lg">
                      <div className="font-semibold text-xs uppercase tracking-wider text-slate-400 mb-1">Generated SEO Title</div>
                      <div className="font-bold text-lg text-white mb-4">{finalData.seoTitle}</div>
                      <Link href={`/news/article/${finalData.slug}`} className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500/20 text-teal-300 rounded-lg hover:bg-teal-500/30 transition-colors">
                        View Article <span aria-hidden="true">&rarr;</span>
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="bg-slate-50 dark:bg-[#121820] rounded-2xl p-6 ring-1 ring-slate-200 dark:ring-white/10">
               <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
                 <h2 className="text-xl font-bold">Microservices & Queues</h2>
                 <span className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full w-fit">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Live BullMQ Updates
                 </span>
               </div>
               
               <div className="grid lg:grid-cols-2 gap-4">
                 {queueStats.length > 0 ? queueStats.map((q, idx) => (
                   <div key={idx} className="p-4 rounded-xl border shadow-sm queue-card">
                     <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-white/5">
                       <p className="font-bold text-sm capitalize queue-card-title">{q.name.replace('-jobs', '')} Worker</p>
                       <span className="px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-600 dark:text-teal-400 text-[10px] font-bold uppercase tracking-wider">
                         Queue
                       </span>
                     </div>
                     <div className="grid grid-cols-4 gap-2 text-center">
                        <div className="flex flex-col gap-1">
                            <span className="text-xl font-bold queue-stat-val">{q.active}</span>
                            <span className="text-[10px] font-semibold uppercase tracking-wider queue-stat-label">Active</span>
                        </div>
                        <div className="flex flex-col gap-1 border-l border-slate-100 dark:border-white/5">
                            <span className="text-xl font-bold queue-stat-val">{q.waiting}</span>
                            <span className="text-[10px] font-semibold uppercase tracking-wider queue-stat-label">Waiting</span>
                        </div>
                        <div className="flex flex-col gap-1 border-l border-slate-100 dark:border-white/5">
                            <span className="text-xl font-bold queue-stat-done">{q.completed}</span>
                            <span className="text-[10px] font-semibold uppercase tracking-wider queue-stat-label">Done</span>
                        </div>
                        <div className="flex flex-col gap-1 border-l border-slate-100 dark:border-white/5">
                            <span className="text-xl font-bold queue-stat-failed">{q.failed}</span>
                            <span className="text-[10px] font-semibold uppercase tracking-wider queue-stat-label">Failed</span>
                        </div>
                     </div>
                   </div>
                 )) : (
                   <div className="col-span-2 text-center text-sm text-slate-500 py-8">Loading queue statistics...</div>
                 )}
               </div>
            </section>
          </div>

          <aside className="space-y-6 sticky top-8 h-[calc(100vh-6rem)] flex flex-col">
            <div className="bg-gradient-to-br from-teal-500 to-emerald-600 rounded-2xl p-6 text-white shadow-lg shadow-teal-500/20 shrink-0">
              <h3 className="font-bold text-lg mb-2">Automated Pipeline</h3>
              <p className="text-teal-50 text-sm mb-4">The BullMQ workers are continuously listening for jobs in the background.</p>
              <div className="text-xs bg-black/20 rounded p-3 font-mono">
                Redis Connection: {stats?.health ? (stats.health.redis ? 'OK' : 'FAILED') : 'LOADING...'}
                <br/>Postgres: {stats?.health ? (stats.health.postgres ? 'OK' : 'FAILED') : 'LOADING...'}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-[#121820] rounded-2xl p-6 ring-1 ring-slate-200 dark:ring-white/10 shrink-0">
              <h2 className="text-lg font-bold mb-4">Database Metrics</h2>
              {stats ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-4 border-b border-slate-200 dark:border-white/5">
                    <span className="text-slate-500 font-medium">Original Articles</span>
                    <span className="text-2xl font-bold">{stats.originalContent}</span>
                  </div>
                  <div className="flex justify-between items-center pb-4 border-b border-slate-200 dark:border-white/5">
                    <span className="text-slate-500 font-medium">Scraped URLs</span>
                    <span className="text-2xl font-bold">{stats.scrapeResults}</span>
                  </div>
                  <div className="flex justify-between items-center pb-4 border-b border-slate-200 dark:border-white/5">
                    <span className="text-slate-500 font-medium">Categorized</span>
                    <span className="text-2xl font-bold">{stats.categorizationResults}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Duplicates Caught</span>
                    <span className="text-2xl font-bold text-yellow-500">{stats.duplicates}</span>
                  </div>
                </div>
              ) : (
                <div className="animate-pulse space-y-4">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="h-8 bg-slate-200 dark:bg-white/10 rounded" />
                  ))}
                </div>
              )}
            </div>

          </aside>
        </div>

        {/* Categories Overview - Full Width Section */}
        {stats && stats.categories && stats.categories.length > 0 && (
          <div className="mt-8 bg-slate-50 dark:bg-[#121820] rounded-2xl p-6 ring-1 ring-slate-200 dark:ring-white/10">
            <h2 className="text-lg font-bold mb-6">Categories Overview</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
              {stats.categories.map((cat: any, idx: number) => {
                const accents = [
                  'from-teal-400 to-teal-600',
                  'from-blue-400 to-blue-600',
                  'from-purple-400 to-purple-600',
                  'from-amber-400 to-amber-600',
                  'from-rose-400 to-rose-600',
                  'from-emerald-400 to-emerald-600'
                ];
                const accent = accents[idx % accents.length];
                
                return (
                  <div key={idx} className="bg-black rounded-xl border border-slate-800 overflow-hidden flex flex-col hover:border-slate-700 transition-colors group">
                    <div className={`h-1 bg-gradient-to-r ${accent}`} />
                    <div className="p-4 flex flex-col items-start justify-center h-full">
                      <span className="text-slate-500 font-mono text-xs mb-1">#{idx + 1}</span>
                      <span className="text-2xl font-bold text-white leading-none mb-2">{cat.count}</span>
                      <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider truncate w-full">{cat.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
