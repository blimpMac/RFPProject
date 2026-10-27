import { CalendarClock } from 'lucide-react';
import type { RfpRequest } from '../../types';
import { getSlaInfo } from './workflow';

export function RequestSla({ request, now }: { request: RfpRequest; now: number }) {
  const sla = getSlaInfo(request, now);
  return (
    <span className="sla-badge" data-tone={sla.tone} title={sla.detail}>
      <CalendarClock size={13} />
      {sla.label}
    </span>
  );
}
