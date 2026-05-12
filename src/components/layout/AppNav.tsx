'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';
import Image from 'next/image';
import { downloadBackupFile, importBackupFile } from '@/lib/backup';
import { GoogleDriveSyncButton } from '@/components/layout/GoogleDriveSyncButton';

const navItems = [
  { href: '/',          label: 'Overview' },
  { href: '/projects',  label: 'Projects' },
  { href: '/people',    label: 'People' },
  { href: '/subteams',  label: 'Subteams' },
  { href: '/cycles',    label: 'Cycles' },
];

export function AppNav() {
  const pathname = usePathname();
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <nav className="sticky top-0 z-20 border-b border-white/10 bg-black/30 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-14 items-center gap-3 py-2">
          <Link href="/" className="flex shrink-0 items-center gap-2 text-sm font-bold tracking-tight text-zinc-100">
            <Image src="/yaplanner-logo.png" alt="Yaplanner" width={24} height={24} className="invert" />
            <span className="truncate">Yaplanner</span>
          </Link>

          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {navItems.map((item) => {
              const active =
                item.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-white/10 text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                      : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <button
              onClick={downloadBackupFile}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
            >
              Export
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
            >
              Import
            </button>
            <GoogleDriveSyncButton />
          </div>

          <div className="flex shrink-0 items-center gap-1 md:hidden">
            <button
              onClick={downloadBackupFile}
              className="rounded-md px-2.5 py-1.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
            >
              Export
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md px-2.5 py-1.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
            >
              Import
            </button>
            <GoogleDriveSyncButton />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              await importBackupFile(file);
              e.target.value = '';
              window.location.reload();
            }}
          />
        </div>
      </div>
    </nav>
  );
}
