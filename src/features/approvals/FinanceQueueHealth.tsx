import { CalendarClock, FileCheck2, ShieldCheck, WalletCards } from 'lucide-react';
import type { ReactNode } from 'react';
import type { QueueFocus } from './workflow';

export type FinanceQueueCounts = {
  member: number;
  head: number;
  hardcopy: number;
  processing: number;
  overdue: number;
};

export function FinanceQueueHealth({
  queueFocus,
  counts,
  onFocus,
}: {
  queueFocus: QueueFocus;
  counts: FinanceQueueCounts;
  onFocus: (focus: QueueFocus) => void;
}) {
  return (
    <section className="queue-health-grid" aria-label="Finance queue health">
      <QueueHealthCard
        active={queueFocus === 'member'}
        count={counts.member}
        icon={<WalletCards size={18} />}
        label="Finance member review"
        detail="At least one member approval"
        onClick={() => onFocus('member')}
      />
      <QueueHealthCard
        active={queueFocus === 'head'}
        count={counts.head}
        icon={<ShieldCheck size={18} />}
        label="Finance Head review"
        detail="Super Administrator decision"
        tone="violet"
        onClick={() => onFocus('head')}
      />
      <QueueHealthCard
        active={queueFocus === 'hardcopy'}
        count={counts.hardcopy}
        icon={<FileCheck2 size={18} />}
        label="Hard-copy verification"
        detail="Required before processing"
        tone="warning"
        onClick={() => onFocus('hardcopy')}
      />
      <QueueHealthCard
        active={queueFocus === 'processing'}
        count={counts.processing}
        icon={<CalendarClock size={18} />}
        label="3-day processing"
        detail={
          counts.overdue ? `${counts.overdue} overdue · 3-day window` : '3-day monitoring window'
        }
        tone="green"
        onClick={() => onFocus('processing')}
      />
    </section>
  );
}

function QueueHealthCard({
  active,
  count,
  detail,
  icon,
  label,
  onClick,
  tone = 'blue',
}: {
  active: boolean;
  count: number;
  detail: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone?: 'blue' | 'warning' | 'amber' | 'violet' | 'green';
}) {
  return (
    <button
      type="button"
      className={`queue-health-card ${active ? 'queue-health-card-active' : ''}`}
      data-tone={tone}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="queue-health-icon">{icon}</span>
      <span className="min-w-0 flex-1 text-left">
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <span className="queue-health-count">{count}</span>
    </button>
  );
}
