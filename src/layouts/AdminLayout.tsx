import { useMemo, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  CheckSquare,
  ChevronLeft,
  FileStack,
  History,
  LogOut,
  Menu,
  Search,
  Table2,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { supabase } from '../lib/supabase';
import { Spinner } from '../components/ui';
import { ThemeToggle } from '../components/ThemeToggle';
import { EditNameModal } from '../features/profile/EditNameModal';
import type { Role } from '../types';

type NavigationItem = {
  to: string;
  label: string;
  description: string;
  group: 'Workspace' | 'Administration';
  icon: LucideIcon;
  allowedRoles?: Role[];
};

const navigationItems: NavigationItem[] = [
  {
    to: '/admin',
    label: 'Overview',
    description: 'Performance and request health',
    group: 'Workspace',
    icon: BarChart3,
  },
  {
    to: '/admin/monitoring',
    label: 'RFP requests',
    description: 'Search and inspect live records',
    group: 'Workspace',
    icon: Table2,
  },
  {
    to: '/admin/approvals',
    label: 'Approval queue',
    description: 'Finance actions and SLA stages',
    group: 'Workspace',
    icon: CheckSquare,
  },
  {
    to: '/admin/audit-trail',
    label: 'Audit trail',
    description: 'Recorded system activity',
    group: 'Workspace',
    icon: History,
    allowedRoles: ['super_administrator', 'finance_reviewer'],
  },
  {
    to: '/admin/documents',
    label: 'Documents',
    description: 'Supporting files and records',
    group: 'Workspace',
    icon: FileStack,
    allowedRoles: ['super_administrator', 'finance_reviewer'],
  },
  {
    to: '/admin/account-management',
    label: 'Account Management',
    description: 'Finance members and department heads',
    group: 'Administration',
    icon: Users,
    allowedRoles: ['super_administrator'],
  },
];

const roleLabels: Record<Role, string> = {
  super_administrator: 'Finance Head (Super Admin)',
  department_approver: 'Department Head',
  finance_reviewer: 'Finance Member',
};

function canViewNavigationItem(item: NavigationItem, roles: Role[]) {
  return !item.allowedRoles || roles.some((role) => item.allowedRoles?.includes(role));
}

function initials(name?: string | null) {
  return (name || 'Staff account')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function AdminLayout() {
  const { session, roles, identity, loading, refresh } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [navigationSearch, setNavigationSearch] = useState('');
  const [editingName, setEditingName] = useState(false);

  const availableItems = useMemo(
    () => navigationItems.filter((item) => canViewNavigationItem(item, roles)),
    [roles],
  );
  const visibleItems = useMemo(() => {
    const query = navigationSearch.trim().toLowerCase();
    if (!query) return availableItems;
    return availableItems.filter((item) =>
      `${item.label} ${item.description}`.toLowerCase().includes(query),
    );
  }, [availableItems, navigationSearch]);
  const currentItem =
    [...availableItems]
      .sort((a, b) => b.to.length - a.to.length)
      .find((item) =>
        item.to === '/admin'
          ? location.pathname === item.to
          : location.pathname.startsWith(item.to),
      ) || availableItems[0];
  const primaryRole = roles[0];

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
            Your account is signed in but has no RFP role. Ask the Finance Head to grant access.
          </p>
          <button className="btn btn-secondary mt-4" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className={`admin-shell min-h-screen ${collapsed ? 'admin-shell-collapsed' : ''}`}>
        <button
          type="button"
          className="admin-mobile-menu fixed left-3 top-3 z-40 p-2 lg:hidden"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          aria-expanded={open}
          aria-controls="staff-sidebar"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
        {open && (
          <button
            type="button"
            className="fixed inset-0 z-20 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close navigation menu"
          />
        )}
        <aside
          id="staff-sidebar"
          className={`admin-sidebar fixed inset-y-0 left-0 z-30 flex flex-col overflow-hidden transition-all ${collapsed ? 'w-20' : 'w-72'} ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
        >
          <div className="admin-brand flex h-[5.25rem] shrink-0 items-center justify-between px-4">
            <Link
              to="/admin"
              className={`min-w-0 items-center gap-3 ${collapsed ? 'hidden' : 'flex'}`}
              onClick={() => setOpen(false)}
            >
              <span className="admin-brand-mark" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-sm tracking-wide">RFP CONTROL</strong>
                <small className="block text-[0.68rem] font-semibold uppercase tracking-[0.17em] text-slate-400">
                  Finance operations
                </small>
              </span>
            </Link>
            <button
              type="button"
              className="admin-collapse hidden rounded-xl p-2 lg:block"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              <ChevronLeft
                className={`transition-transform ${collapsed ? 'rotate-180' : ''}`}
                size={18}
              />
            </button>
          </div>

          {!collapsed && (
            <div className="shrink-0 px-3 pt-4">
              <label className="admin-nav-search">
                <Search size={15} aria-hidden="true" />
                <span className="sr-only">Find a workspace page</span>
                <input
                  value={navigationSearch}
                  onChange={(event) => setNavigationSearch(event.target.value)}
                  placeholder="Find a page"
                />
              </label>
            </div>
          )}

          <nav className="min-h-0 flex-1 overflow-hidden px-3 pb-3 pt-4" aria-label="Staff navigation">
            {(['Workspace', 'Administration'] as const).map((group) => {
              const items = visibleItems.filter((item) => item.group === group);
              if (!items.length) return null;
              return (
                <div className="mb-5" key={group}>
                  {!collapsed && <p className="admin-nav-label">{group}</p>}
                  <div className="space-y-1">
                    {items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.to === '/admin'}
                          onClick={() => setOpen(false)}
                          aria-label={collapsed ? item.label : undefined}
                          title={collapsed ? item.label : undefined}
                          className={({ isActive }) =>
                            `admin-sidebar-link ${isActive ? 'admin-sidebar-link-active' : ''}`
                          }
                        >
                          <span className="admin-nav-icon">
                            <Icon size={18} />
                          </span>
                          {!collapsed && (
                            <span className="min-w-0">
                              <strong className="block truncate">{item.label}</strong>
                              <small className="block truncate">{item.description}</small>
                            </span>
                          )}
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {!visibleItems.length && !collapsed && (
              <p className="px-3 py-6 text-center text-xs text-slate-400">No matching pages</p>
            )}
          </nav>

          <div className="admin-sidebar-footer shrink-0 p-3">
            <button
              type="button"
              className={`admin-profile focus-ring w-full text-left ${collapsed ? 'justify-center p-2' : ''}`}
              onClick={() => setEditingName(true)}
              aria-label="Open profile settings"
              title={collapsed ? 'Profile' : 'Click to edit profile'}
            >
              <span className="admin-avatar">{initials(identity?.fullName)}</span>
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">
                    {identity?.fullName || 'Staff account'}
                  </strong>
                  <small className="block truncate text-xs text-slate-400">
                    {primaryRole ? roleLabels[primaryRole] : identity?.email}
                  </small>
                </span>
              )}
            </button>
            <button
              type="button"
              className={`admin-sidebar-link mt-2 w-full ${collapsed ? 'justify-center' : ''}`}
              onClick={() => supabase.auth.signOut()}
              title={collapsed ? 'Sign out' : undefined}
            >
              <span className="admin-nav-icon">
                <LogOut size={18} />
              </span>
              {!collapsed && <strong>Sign out</strong>}
            </button>
          </div>
        </aside>

        <div className="admin-content transition-all">
          <header className="admin-topbar flex min-h-[5.25rem] items-center gap-4 px-4 pl-16 lg:px-8">
            <div className="min-w-0">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-slate-400">
                Operations workspace
              </p>
              <h1 className="truncate text-lg font-semibold tracking-tight">
                {currentItem?.label || 'RFP workspace'}
              </h1>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle compact />
            </div>
          </header>
          <main
            id="main-content"
            tabIndex={-1}
            className="page-enter mx-auto w-full max-w-[100rem] p-4 sm:p-6 lg:p-8"
          >
            <Outlet />
          </main>
        </div>
      </div>
      {editingName && identity && (
        <EditNameModal
          currentName={identity.fullName}
          onClose={() => setEditingName(false)}
          onSaved={refresh}
        />
      )}
    </>
  );
}
