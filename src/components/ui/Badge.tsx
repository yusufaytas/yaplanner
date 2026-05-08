import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
  size?: 'sm' | 'md';
}

const variantClasses: Record<string, string> = {
  default: 'border border-white/10 bg-white/10 text-zinc-200',
  success: 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  warning: 'border border-amber-400/20 bg-amber-400/10 text-amber-200',
  error: 'border border-rose-400/20 bg-rose-400/10 text-rose-200',
  info: 'border border-sky-400/20 bg-sky-400/10 text-sky-200',
  neutral: 'border border-zinc-400/20 bg-zinc-400/10 text-zinc-300',
};

export function Badge({ children, variant = 'default', size = 'sm' }: BadgeProps) {
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium backdrop-blur-sm ${sizeClass} ${variantClasses[variant]}`}
    >
      {children}
    </span>
  );
}
