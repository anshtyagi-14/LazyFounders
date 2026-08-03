'use client';
import { useState, useEffect } from 'react';
import { triggerPipeline, checkPipelineStatus } from '../../actions';

export default function ArticleIntelligencePage() {
  const [url, setUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [urlHash, setUrlHash] = useState<string | null>(null);

  const addLog = (msg: string) => setLogs(prev => [...prev, `> ${msg}`]);

  const handleTest = async () => {
    if (!url) return;
    setIsProcessing(true);
    setResult(null);
    setLogs([]);
    addLog(`Pushing URL to scraper queue...`);

    const res = await triggerPipeline(url);
    if (!res.success) {
      addLog(`ERROR: ${res.error}`);
      setIsProcessing(false);
      return;
    }

    addLog(`Job ${res.jobId} queued successfully!`);
    setUrlHash(res.urlHash as string);
  };

  useEffect(() => {
    if (!isProcessing || !urlHash) return;

    const interval = setInterval(async () => {
      const statusRes = await checkPipelineStatus(urlHash);
      
      // Only add to log if message changed to prevent spamming
      setLogs(prev => {
        const lastLog = prev[prev.length - 1];
        if (lastLog !== `> [${statusRes.status}] ${statusRes.message}`) {
          return [...prev, `> [${statusRes.status}] ${statusRes.message}`];
        }
        return prev;
      });

      if (statusRes.status === 'DONE') {
        setIsProcessing(false);
        setResult(statusRes.data || { message: statusRes.message });
        clearInterval(interval);
      } else if (statusRes.status === 'ERROR') {
        setIsProcessing(false);
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isProcessing, urlHash]);

  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-4 text-primary">Article Intelligence</h1>
        <p className="text-lg text-muted-foreground">Scrape, categorize, and rewrite</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Testing Interface */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
            <h2 className="text-sm font-semibold mb-4">Target URL</h2>
            
            <div className="flex space-x-4 mb-6">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 bg-background border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
                placeholder="https://yourstory.com/..."
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
                  {isProcessing ? 'Processing...' : 'Analyze'}
                </button>
              )}
            </div>

            {/* Results Area */}
            <div className="w-full h-[400px] bg-black border border-border rounded-lg p-4 text-sm overflow-auto text-green-400 font-mono shadow-inner flex flex-col space-y-2">
              {logs.length === 0 && !result && (
                <span className="text-muted-foreground opacity-50">Waiting for input...</span>
              )}
              
              {logs.map((log, i) => (
                <span key={i} className={i === logs.length - 1 && isProcessing ? 'animate-pulse' : ''}>
                  {log}
                </span>
              ))}

              {result && (
                <div className="mt-4 pt-4 border-t border-green-800/50">
                  <span className="text-white mb-2 block">&gt; FINAL JSON RESULT:</span>
                  <pre className="text-green-300">{JSON.stringify(result, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: API Docs and Info */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
            <h3 className="text-xs font-bold tracking-widest text-muted-foreground uppercase text-center mb-6">
              Pipeline Stages
            </h3>
            <ul className="space-y-4 text-sm text-muted-foreground">
              <li className="flex items-start"><span className="text-primary mr-2">1.</span> Scraper Queue (BullMQ)</li>
              <li className="flex items-start"><span className="text-primary mr-2">2.</span> Playwright Extraction</li>
              <li className="flex items-start"><span className="text-primary mr-2">3.</span> Categorization Engine</li>
              <li className="flex items-start"><span className="text-primary mr-2">4.</span> Deduplication Check</li>
              <li className="flex items-start"><span className="text-primary mr-2">5.</span> Amazon Nova SEO Rewrite</li>
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
}
