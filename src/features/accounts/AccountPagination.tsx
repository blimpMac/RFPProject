import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui';

type Props = {
  currentPage: number;
  totalPages: number;
  firstVisible: number;
  itemCount: number;
  pageSize: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
};

export function AccountPagination({
  currentPage,
  totalPages,
  firstVisible,
  itemCount,
  pageSize,
  itemLabel,
  onPageChange,
}: Props) {
  if (itemCount === 0) return null;

  return (
    <div className="grid gap-3 border-t bg-slate-50 px-4 py-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
      <p className="text-sm text-slate-600">
        Showing {firstVisible + 1}-{Math.min(firstVisible + pageSize, itemCount)} of {itemCount} ·{' '}
        {pageSize} {itemLabel} per page
      </p>
      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 sm:flex sm:w-auto">
        <Button
          variant="secondary"
          disabled={currentPage === 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        >
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">Previous</span>
        </Button>
        <span className="min-w-24 text-center text-sm font-medium">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="secondary"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}
