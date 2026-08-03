'use client';
import React, { useState, useEffect, useRef } from "react";
import Link from 'next/link';

export default function PipelinePage() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('IDLE');
  const [message, setMessage] = useState('');
  const [finalData, setFinalData] = useState<any>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const handlePipelineTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setStatus('STARTING');
    setMessage('Initializing pipeline...');
    setFinalData(null);

    try {
      const response = await fetch('http://localhost:3001/api/pipeline/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await response.json();
      
      if (data.success) {
        startPolling(data.urlHash);
      } else {
        setStatus('ERROR');
        setMessage(data.error || 'Failed to trigger pipeline');
      }
    } catch (err: any) {
      setStatus('ERROR');
      setMessage(err.message);
    }
  };

  const startPolling = (hash: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current as NodeJS.Timeout);
    
    pollingRef.current = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:3001/api/pipeline/status/${hash}`);
        const data = await response.json();
        
        setStatus(data.status);
        setMessage(data.message);

        if (data.status === 'DONE' || data.status === 'ERROR') {
          if (pollingRef.current) clearInterval(pollingRef.current as NodeJS.Timeout);
          if (data.data) {
            setFinalData(data.data);
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
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <div className="mb-8">
        <Link href="/" className="text-primary hover:underline mb-4 inline-block">&larr; Back to Dashboard</Link>
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Full Discovery Pipeline
        </h1>
        <p className="text-xl text-muted-foreground">
          Trigger the complete end-to-end pipeline.
        </p>
      </div>

      <div className="bg-card border border-border p-8 rounded-xl shadow-lg">
        <form onSubmit={handlePipelineTrigger} className="flex flex-col sm:flex-row gap-4 mb-8">
          <input 
            type="url" 
            placeholder="Enter article URL (e.g., https://yourstory.com/startups/news)" 
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            className="flex-1 px-4 py-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button 
            type="submit" 
            disabled={status !== 'IDLE' && status !== 'ERROR' && status !== 'DONE'}
            className="px-8 py-3 bg-primary text-primary-foreground font-bold rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            {status === 'IDLE' || status === 'ERROR' || status === 'DONE' ? 'Generate AI Blog' : 'Processing...'}
          </button>
        </form>
        
        {status !== 'IDLE' && (
          <div className="mt-6 p-6 bg-background rounded-lg border border-border text-left">
            <div className={`flex items-center gap-2 font-semibold mb-2 text-lg ${status === 'ERROR' ? 'text-red-500' : 'text-primary'}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${status === 'ERROR' ? 'bg-red-500' : 'bg-primary'} ${(status !== 'DONE' && status !== 'ERROR') ? 'animate-pulse' : ''}`} />
              Status: {status}
            </div>
            <div className="text-muted-foreground">{message}</div>
            
            {finalData && (
              <div className="mt-6 pt-6 border-t border-border">
                <div className="font-semibold mb-2 text-foreground">SEO Title:</div>
                <div className="text-muted-foreground text-lg mb-4">{finalData.seoTitle}</div>
                <div className="font-semibold mb-2 text-foreground">Slug:</div>
                <div className="text-primary bg-primary/10 px-3 py-1.5 rounded-md inline-block">/{finalData.slug}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
