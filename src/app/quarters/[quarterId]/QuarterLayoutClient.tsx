'use client';

import { useParams, usePathname } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Badge } from '@/components/ui/Badge';
import type { QuarterStatus } from '@/lib/types';

const statusVariant: Record<QuarterStatus, 'success' | 'info' | 'warning' | 'neutral'> = {
  active: 'success',
  draft: 'info',
  closed: 'warning',
  archived: 'neutral',
};

export default function QuarterLayoutClient({ children }: { children: React.ReactNode }) {
  const { quarterId } = useParams<{ quarterId: string }>();
  const pathname = usePathname();
  const quarter = useLiveQuery(() => db.quarters.get(quarterId), [quarterId]);

  const navLinks = [
    { href: `/quarters/${quarterId}`, label: 'Portfolio', exact: true },
    { href: `/quarters/${quarterId}/capacity-planning`, label: 'Capacity Planning', exact: false },
    { href: `/quarters/${quarterId}/people`, label: 'People', exact: false },
  ];

  return (
    <div className="space-y-6">
      {/* Quarter header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/quarters" className="text-sm text-zinc-500 hover:text-zinc-200">
          ← Quarters
        </Link>
        {quarter && (
          <>
            <span className="text-zinc-700">/</span>
            <span className="text-sm font-semibold text-zinc-100">{quarter.name}</span>
            <Badge variant={statusVariant[quarter.status]}>{quarter.status}</Badge>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex gap-1 border-b border-white/10 pb-0">
        {navLinks.map((link) => {
          const isActive = link.exact ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-2 text-sm rounded-t transition-colors ${
                isActive
                  ? 'text-zinc-100 border-b-2 border-sky-400 -mb-px'
                  : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
