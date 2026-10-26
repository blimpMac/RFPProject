import { Navigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';

export function ApprovingHeadsPage() {
  const { roles } = useAuth();
  if (!roles.includes('super_administrator')) return <Navigate to="/admin" replace />;
  return <Navigate to="/admin/account-management" replace />;
}
