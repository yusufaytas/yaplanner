import { Badge } from '@/components/ui/Badge';
import type { ProjectStatus } from '@/lib/types';

const statusVariant: Record<ProjectStatus, 'success' | 'info' | 'warning' | 'neutral' | 'error'> = {
  Active: 'success',
  Proposed: 'info',
  'On Hold': 'warning',
  Complete: 'neutral',
  Cancelled: 'error',
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge variant={statusVariant[status]}>{status}</Badge>;
}
