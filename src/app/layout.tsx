import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { AppNav } from '@/components/layout/AppNav';
import { UserGuideModal } from '@/components/layout/UserGuideModal';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Yaplanner',
  description: 'Local-first engineering resourcing planner',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans bg-background text-foreground">
        <AppNav />
        <div className="flex min-h-screen flex-col">
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </main>
          <footer className="border-t border-white/10 bg-black/20">
            <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-3 px-4 py-4 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
              <span className="shrink-0">Yaplanner</span>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <a
                  href="https://github.com/yusufaytas/yaplanner"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  GitHub
                </a>
                <UserGuideModal />
                <span className="leading-relaxed">Local-first engineering planning</span>
              </div>
            </div>
          </footer>
        </div>
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      </body>
    </html>
  );
}
