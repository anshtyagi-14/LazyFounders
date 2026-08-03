'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

type CrawlRun = {
  id: string;
  source: { name: string; domain: string };
  status: string;
  totalUrls: number;
  newUrls: number;
  errorCount: number;
  startedAt: string;
  durationMs: number | null;
};

function LogsManagementContent() {
  const [logs, setLogs] = useState<CrawlRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [terminalLogs, setTerminalLogs] = useState<any[]>([]);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const domainFilter = searchParams.get('domain');

  useEffect(() => {
    fetchLogs();

    // Connect SSE
    const sseUrl = domainFilter 
      ? `http://localhost:3001/api/admin/live-logs?domain=${domainFilter}`
      : 'http://localhost:3001/api/admin/live-logs';
      
    const eventSource = new EventSource(sseUrl);
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setTerminalLogs(prev => {
          const newLogs = [...prev, data];
          if (newLogs.length > 500) return newLogs.slice(newLogs.length - 500); // Keep max 500 lines
          return newLogs;
        });
      } catch (e) {
        // ignore
      }
    };

    return () => {
      eventSource.close();
    };
  }, [domainFilter]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  const fetchLogs = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/admin/logs');
      const data = await res.json();
      setLogs(data.runs || []);
    } catch (err) {
      console.error('Failed to fetch logs', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">System Logs & Crawl Runs</h1>

      <div className="bg-white dark:bg-[#121820] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden mb-8">
        {loading ? (
          <div className="p-12 text-center text-slate-500">Loading logs...</div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-white/5 text-sm uppercase text-slate-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Started At</th>
                <th className="px-6 py-4 font-semibold">Source</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Found</th>
                <th className="px-6 py-4 font-semibold">New</th>
                <th className="px-6 py-4 font-semibold">Errors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/10 text-sm">
              {logs.map((run) => (
                <tr key={run.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-700 dark:text-slate-300">
                    {new Date(run.startedAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium">{run.source.name}</div>
                    <div className="text-xs text-slate-500">{run.source.domain}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      run.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 
                      run.status === 'failed' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400' :
                      'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                    }`}>
                      {run.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-400">{run.totalUrls}</td>
                  <td className="px-6 py-4 font-mono text-emerald-600 dark:text-emerald-400 font-medium">+{run.newUrls}</td>
                  <td className="px-6 py-4 font-mono text-rose-600 dark:text-rose-400">{run.errorCount > 0 ? run.errorCount : '-'}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No logs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <section style={{ height: '400px' }} className="bg-[#0a0a0a] rounded-2xl border border-slate-800 overflow-hidden flex flex-col">
         <div className="flex items-center gap-2 px-4 py-3 bg-[#161616] border-b border-slate-800">
           <div className="flex gap-1.5">
             <div className="w-3 h-3 rounded-full bg-red-500"></div>
             <div className="w-3 h-3 rounded-full bg-amber-500"></div>
             <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
           </div>
           <span className="ml-2 text-xs font-medium text-slate-400 font-mono tracking-wider uppercase">
             Live Pipeline Terminal {domainFilter && <span className="text-teal-400 ml-1">[{domainFilter}]</span>}
           </span>
           <span className="ml-auto inline-flex items-center gap-2 text-[10px] text-emerald-400 font-bold uppercase tracking-widest bg-emerald-500/10 px-2 py-1 rounded-full">
             <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Streaming
           </span>
         </div>
         <div ref={scrollContainerRef} className="flex-1 p-4 font-mono text-[13px] leading-relaxed overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
           {terminalLogs.map((log, idx) => {
             // Pino levels: 10:TRACE, 20:DEBUG, 30:INFO, 40:WARN, 50:ERROR, 60:FATAL
             const isError = log.level >= 50;
             const isWarn = log.level === 40;
             const isDebug = log.level <= 20;
             
             const timeStr = log.time ? new Date(log.time).toLocaleTimeString() : '';
             
             return (
               <div key={idx} className="mb-1 hover:bg-white/5 px-1 -mx-1 rounded transition-colors break-words">
                 <span className="text-slate-500 mr-3">[{timeStr}]</span>
                 <span className={`font-bold mr-3 ${isError ? 'text-rose-500' : isWarn ? 'text-amber-500' : isDebug ? 'text-slate-400' : 'text-emerald-400'}`}>
                   [{isError ? 'ERROR' : isWarn ? 'WARN' : isDebug ? 'DEBUG' : 'INFO'}]
                 </span>
                 <span className="text-slate-300">
                   {log.msg}
                   {log.url && <span className="text-cyan-400 ml-2">{log.url}</span>}
                 </span>
                 {log.err && (
                   <div className="pl-24 text-rose-400 mt-1">
                     {log.err.message || JSON.stringify(log.err)}
                   </div>
                 )}
               </div>
             );
           })}
         </div>
      </section>
    </div>
  );
}

export default function LogsManagement() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LogsManagementContent />
    </Suspense>
  );
}
