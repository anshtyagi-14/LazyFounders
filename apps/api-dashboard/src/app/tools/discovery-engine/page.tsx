'use client';
import { useState, useEffect } from 'react';
import { triggerDiscovery, checkDiscoveryStatus } from '../../actions';

export default function DiscoveryEnginePage() {
  const [url, setUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  
  const [sourceId, setSourceId] = useState<string | null>(null);

  const addLog = (msg: string) => setLogs(prev => [...prev, `> ${msg}`]);

  const handleTest = async () => {
    if (!url) return;
    setIsProcessing(true);
    setResult(null);
    setLogs([]);
    addLog(`Pushing Website to Discovery engine...`);

    const res = await triggerDiscovery(url);
    if (!res.success) {
      addLog(`ERROR: ${res.error}`);
      setIsProcessing(false);
      return;
    }

    addLog(`Discovery triggered successfully! Initializing crawlers...`);
    setSourceId(res.sourceId as string);
  };

  useEffect(() => {
    if (!isProcessing || !sourceId) return;

    const interval = setInterval(async () => {
      const statusRes = await checkDiscoveryStatus(sourceId);
      
      setLogs(prev => {
        const lastLog = prev[prev.length - 1];
        if (lastLog !== `> [${statusRes.status}] ${statusRes.message}`) {
          return [...prev, `> [${statusRes.status}] ${statusRes.message}`];
        }
        return prev;
      });

      if (statusRes.status === 'DONE') {
        setIsProcessing(false);
        setResult(statusRes.data);
        clearInterval(interval);
      } else if (statusRes.status === 'ERROR') {
        setIsProcessing(false);
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isProcessing, sourceId]);

  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-4 text-primary">Website Discovery</h1>
        <p className="text-lg text-muted-foreground">Crawl sites and extract new records</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Testing Interface */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
            <h2 className="text-sm font-semibold mb-4">Target Website or Sitemap</h2>
            
            <div className="flex space-x-4 mb-6">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 bg-background border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
                placeholder="https://yourstory.com/sitemap.xml"
                disabled={!!result || isProcessing}
              />
              {result ? (
                <button 
                  onClick={() => { setResult(null); setUrl(''); setLogs([]); }}
                  className="bg-secondary hover:bg-secondary/80 text-secondary-foreground px-6 py-2 rounded-lg font-medium transition-colors cursor-pointer"
                >
                  Reset
                </button>
              ) : (
                <button 
                  onClick={handleTest}
                  disabled={isProcessing || !url}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isProcessing ? 'Crawling...' : 'Discover'}
                </button>
              )}
            </div>

            {/* Results Area */}
            <div className="w-full h-[400px] bg-black border border-border rounded-lg p-4 text-sm overflow-auto text-green-400 font-mono shadow-inner flex flex-col space-y-2">
              {logs.length === 0 && !result && (
                <span className="text-muted-foreground opacity-50">Waiting for website URL...</span>
              )}
              
              {logs.map((log, i) => (
                <span key={i} className={i === logs.length - 1 && isProcessing ? 'animate-pulse' : ''}>
                  {log}
                </span>
              ))}

              {result && (
                <div className="mt-4 pt-4 border-t border-green-800/50">
                  <span className="text-white mb-2 block">&gt; DISCOVERED {result.newArticlesCount} NEW RECORDS:</span>
                  <pre className="text-green-300">{JSON.stringify(result.newArticles, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: API Docs and Info */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
            <h3 className="text-xs font-bold tracking-widest text-muted-foreground uppercase text-center mb-6">
              Discovery Engine
            </h3>
            <ul className="space-y-4 text-sm text-muted-foreground">
              <li className="flex items-start"><span className="text-primary mr-2">1.</span> Target sitemap or homepage</li>
              <li className="flex items-start"><span className="text-primary mr-2">2.</span> Extract all article URLs</li>
              <li className="flex items-start"><span className="text-primary mr-2">3.</span> Diff against PostgreSQL DB</li>
              <li className="flex items-start"><span className="text-primary mr-2">4.</span> Insert completely new records</li>
              <li className="flex items-start"><span className="text-primary mr-2">5.</span> Stream results via UI</li>
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
}
