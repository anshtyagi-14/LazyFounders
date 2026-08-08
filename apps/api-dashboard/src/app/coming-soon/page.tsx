import React from 'react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function ComingSoonPage() {
  return (
    <div className="min-h-screen bg-[#030407] flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center space-y-8">
        {/* Animated Icon / Illustration Placeholder */}
        <div className="flex justify-center mb-12">
          <div className="relative w-24 h-24">
            <div className="absolute inset-0 bg-teal-500/20 rounded-full blur-xl animate-pulse"></div>
            <div className="relative bg-[#0a0a0a] border border-zinc-800 rounded-2xl w-full h-full flex items-center justify-center shadow-2xl">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Typography */}
        <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
          Temporarily <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-600">Unavailable</span>
        </h1>
        
        <p className="text-lg text-zinc-400 max-w-lg mx-auto leading-relaxed">
          We're currently brewing something amazing behind the scenes. This section of the platform is under construction and will be launching soon.
        </p>

        {/* Action */}
        <div className="pt-8">
          <Link 
            href="/"
            className="inline-flex items-center justify-center px-8 py-3.5 text-sm font-semibold text-white transition-all duration-200 bg-teal-600 border border-transparent rounded-full hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-600 focus:ring-offset-[#030407]"
          >
            Return to Dashboard
          </Link>
        </div>

        {/* Decorative Grid Background (Subtle) */}
        <div className="fixed inset-0 pointer-events-none -z-10 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      </div>
    </div>
  );
}
