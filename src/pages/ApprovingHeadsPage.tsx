import { ShieldCheck } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { ApprovingHeadsPanel } from '../components/ApprovingHeadsPanel';
import { useAuth } from '../components/AuthProvider';

export function ApprovingHeadsPage() {
  const { roles } = useAuth();
  if (!roles.includes('super_administrator')) return <Navigate to="/admin" replace />;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-[#315c93]" size={24} />
        <h1 className="text-2xl font-semibold">Edit Approval Team</h1>
      </div>
      <ApprovingHeadsPanel />
    </div>
  );
}
