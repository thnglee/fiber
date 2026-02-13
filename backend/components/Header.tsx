'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity } from 'lucide-react';
import { useRealtime } from '@/components/RealtimeProvider';

export function Header() {
  const pathname = usePathname();
  const { isConnected } = useRealtime();

  // Hide header on login page
  if (pathname === '/admin/login') {
      return null;
  }

  const navItems = [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Metrics', href: '/metrics' },
    { name: 'Live', href: '/live' },
    { name: 'Debug', href: '/debug' },
  ];

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-8 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Fiber Analytics</h1>
              <p className="text-xs text-gray-500">Real-time monitoring dashboard</p>
            </div>
          </div>

          {/* Navigation, Status, and Actions */}
          <div className="flex items-center gap-4">
            {/* Navigation Buttons */}
            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? 'bg-black text-white'
                        : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            {/* Divider */}
            <div className="h-6 w-px bg-gray-200" />

            {/* Connection Status */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-50">
              {isConnected ? (
                <>
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-xs text-gray-700 font-medium">Live</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 bg-gray-400 rounded-full" />
                  <span className="text-xs text-gray-500">Offline</span>
                </>
              )}
            </div>

            {/* Sign Out Button */}
            <button
              onClick={async () => {
                // Clear any stored tokens
                document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;'
                // Redirect to login
                window.location.href = '/admin/login'
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
