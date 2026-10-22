import { useState } from 'react';
import { NavLink, Navigate, Outlet } from 'react-router-dom';
import {
  BarChart3,
  CheckSquare,
  ChevronLeft,
  FileStack,
  LogOut,
  Menu,
  Table2,
  UserCog,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { supabase } from '../lib/supabase';
import { Spinner } from '../components/ui';
import { ThemeToggle } from '../components/ThemeToggle';
import type { Role } from '../types';

type NavigationItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  allowedRoles?: Role[];
};

const navigationItems: NavigationItem[] = [
  { to: '/admin', label: 'Dashboard', icon: BarChart3 },
  { to: '/admin/monitoring', label: 'Monitoring Sheets', icon: Table2 },
  { to: '/admin/approvals', label: 'Approvals', icon: CheckSquare },
  {
    to: '/admin/documents',
    label: 'Document Management',
    icon: FileStack,
    allowedRoles: ['super_administrator', 'administrator', 'finance_reviewer'],
  },
  {
    to: '/admin/approver-management',
    label: 'Approver Management',
    icon: UserCog,
    allowedRoles: ['super_administrator'],
  },
  {
    to: '/admin/approving-heads',
    label: 'Approval Team',
    icon: UsersRound,
    allowedRoles: ['super_administrator'],
  },
  {
    to: '/admin/settings',
    label: 'Account Manager',
    icon: Users,
    allowedRoles: ['super_administrator'],
  },
];

function canViewNavigationItem(item: NavigationItem, roles: Role[]) {
  return !item.allowedRoles || roles.some((role) => item.allowedRoles?.includes(role));
}

export function AdminLayout() {
  const { session, roles, identity, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner />
      </div>
    );
  if (!session) return <Navigate to="/admin/login" replace />;
  if (!roles.length)
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Access not assigned</h1>
          <p className="mt-2 text-slate-500">
            Your account is signed in but has no RFP role. Ask an administrator to grant access.
          </p>
          <button className="btn btn-secondary mt-4" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  return (
    <div className="admin-shell min-h-screen bg-slate-50">
      <button
        className="fixed left-3 top-3 z-40 rounded-md bg-[#102a43] p-2 text-white lg:hidden"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close navigation' : 'Open navigation'}
        aria-expanded={open}
        aria-controls="staff-sidebar"
      >
        <Menu size={20} />
      </button>
      {open && (
        <button
          className="fixed inset-0 z-20 bg-slate-950/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close navigation menu"
        />
      )}
      <aside
        id="staff-sidebar"
        className={`admin-sidebar fixed inset-y-0 left-0 z-30 flex flex-col shadow-xl transition-all ${collapsed ? 'w-20' : 'w-64'} ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <div className={`font-semibold tracking-wide ${collapsed ? 'hidden' : ''}`}>
            RFP Monitoring
          </div>
          <button
            className="hidden rounded p-2 hover:bg-white/10 lg:block"
            onClick={() => setCollapsed(!collapsed)}
            aria-label="Collapse navigation"
          >
            <ChevronLeft
              className={`transition-transform ${collapsed ? 'rotate-180' : ''}`}
              size={19}
            />
          </button>
        </div>
        <nav className="flex-1 space-y-1 p-3" aria-label="Staff navigation">
          {navigationItems.map((item) => {
            if (!canViewNavigationItem(item, roles)) return null;
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/admin'}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `admin-sidebar-link ${isActive ? 'admin-sidebar-link-active' : ''}`
                }
              >
                <Icon size={19} />
                <span className={collapsed ? 'hidden' : ''}>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <button className="admin-sidebar-link m-3" onClick={() => supabase.auth.signOut()}>
          <LogOut size={19} />
          <span className={collapsed ? 'hidden' : ''}>Sign out</span>
        </button>
      </aside>
      <div className={`admin-content transition-all ${collapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        <header className="admin-topbar flex min-h-16 items-center justify-between gap-3 border-b bg-white px-4 py-2 pl-14 lg:px-6">
          <div>
            <p className="text-sm font-bold text-slate-800">Operations Workspace</p>
            <p className="text-xs text-slate-500">Asia/Manila</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle compact />
            <div className="hidden text-right sm:block">
              <p className="max-w-72 truncate text-sm font-semibold" title={identity?.fullName}>
                {identity?.fullName || 'Staff account'}
              </p>
              <p className="max-w-72 truncate text-xs text-slate-500" title={identity?.email}>
                {identity?.email}
              </p>
            </div>
          </div>
        </header>
        <main className="page-enter p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
