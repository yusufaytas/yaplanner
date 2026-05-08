import QuarterLayoutClient from './QuarterLayoutClient';

export default function QuarterLayout({ children }: { children: React.ReactNode }) {
  return <QuarterLayoutClient>{children}</QuarterLayoutClient>;
}
