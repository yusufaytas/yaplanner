import CycleLayoutClient from './CycleLayoutClient';

export default function CycleLayout({ children }: { children: React.ReactNode }) {
  return <CycleLayoutClient>{children}</CycleLayoutClient>;
}
