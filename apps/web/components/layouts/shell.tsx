'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { cn } from '@/components/ui/utils';
import { useSession } from '@/lib/auth';

export type NavItem = {
  href: string;
  label: string;
  ariaLabel?: string;
};

export function Shell({
  navItems,
  children,
  title,
  logoutLabel
}: {
  navItems: NavItem[];
  children: ReactNode;
  title: string;
  logoutLabel: string;
}) {
  const pathname = usePathname();
  const { signOut } = useSession();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <div>
            <p className="text-sm font-medium text-brand-600">CodecCloud</p>
            <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-500 hover:text-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            {logoutLabel}
          </button>
        </div>
        <nav className="mx-auto max-w-6xl px-6 pb-3">
          <ul className="flex flex-wrap gap-2 text-sm">
            {navItems.map((item) => {
              const isActive = pathname?.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-label={item.ariaLabel ?? item.label}
                    className={cn(
                      'inline-flex items-center rounded-full px-4 py-2 font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
                      isActive ? 'bg-brand-500 text-white shadow-soft' : 'bg-slate-100 text-slate-600 hover:bg-brand-100 hover:text-brand-700'
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      <main className="flex-1 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
      </main>
    </div>
  );
}
