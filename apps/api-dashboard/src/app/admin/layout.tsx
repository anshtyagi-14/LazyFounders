'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navItems = [
    { name: 'Overview', href: '/admin', icon: '📊' },
    { name: 'Sources & Cron', href: '/admin/sources', icon: '📡' },
    { name: 'System Logs', href: '/admin/logs', icon: '📝' },
    { name: 'API Command Center', href: '/dashboard', icon: '⚡' },

    { name: 'API Reference', href: '/developers', icon: '👨‍💻' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#05070A] text-slate-900 dark:text-white flex">
      {/* Sidebar - Forced Dark Theme */}
      <aside className="w-64 border-r border-white/10 bg-slate-950 text-white flex flex-col hidden md:flex">
        <div className="p-6 border-b border-white/10">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center font-bold text-white shadow-lg shadow-teal-500/20">
              A
            </span>
            <span className="font-bold text-xl tracking-tight">Admin Console</span>
          </Link>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-teal-500/10 text-teal-400'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span>{item.icon}</span>
                {item.name}
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-white/10">
          <Link href="/" className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
            <span>🏠</span>
            Back to Frontend
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 border-b border-slate-200 dark:border-white/10 bg-white/50 dark:bg-[#0a0d14]/50 backdrop-blur-md flex items-center px-8 md:hidden">
            <span className="font-bold text-xl">Admin Console</span>
        </header>
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
