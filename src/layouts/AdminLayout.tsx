import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  CheckSquare,
  FilePlus2,
  FileStack,
  ServerCog,
  History,
  BookOpen,
  Files,
  LogOut,
  Menu,
  Pencil,
  ChevronDown,
  Table2,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { supabase } from '../lib/supabase';
import { post } from '../lib/api';
import { Spinner } from '../components/ui';
import { ThemeToggle } from '../components/ThemeToggle';
import { EditNameModal } from '../features/profile/EditNameModal';
import type { Role } from '../types';

type NavigationItem = {
  to: string;
  label: string;
  description: string;
  group: 'Workspace' | 'Administration' | 'IT Operations';
  icon: LucideIcon;
  allowedRoles?: Role[];
};

const navigationItems: NavigationItem[] = [
  {
    to: '/admin/it',
    label: 'IT Dashboard',
    description: 'User overview, services and security',
    group: 'IT Operations',
    icon: ServerCog,
    allowedRoles: ['it_administrator'],
  },
  {
    to: '/admin',
    label: 'Overview',
    description: 'Performance and request health',
    group: 'Workspace',
    icon: BarChart3,
  },
  {
    to: '/admin/new-request',
    label: 'Add a new Request',
    description: 'Create and submit a payment request',
    group: 'Workspace',
    icon: FilePlus2,
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
    to: '/admin/preview-forms',
    label: 'Preview Forms',
    description: 'Dedicated form and email samples',
    group: 'Workspace',
    icon: Files,
  },
  {
    to: '/admin/audit-trail',
    label: 'Audit trail',
    description: 'Recorded system activity',
    group: 'IT Operations',
    icon: History,
    allowedRoles: ['it_administrator'],
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
  super_administrator: 'Finance Head',
  department_approver: 'Department Head',
  finance_reviewer: 'Finance Member',
  it_administrator: 'IT Administrator',
};

function canViewNavigationItem(item: NavigationItem, roles: Role[]) {
  if (roles.includes('it_administrator')) {
    return Boolean(item.allowedRoles?.includes('it_administrator'));
  }
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
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('rfp-sidebar-collapsed') !== 'expanded';
    } catch {
      return true;
    }
  });
  const [editingName, setEditingName] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const isIT = roles.includes('it_administrator');

  useEffect(() => {
    try {
      window.localStorage.setItem('rfp-sidebar-collapsed', collapsed ? 'collapsed' : 'expanded');
    } catch {
      // Navigation still works if browser storage is unavailable.
    }
  }, [collapsed]);

  useEffect(() => {
    setOpen(false);
    setProfileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [profileMenuOpen]);

  const toggleSidebar = () => {
    if (window.matchMedia('(min-width: 1280px)').matches) {
      setCollapsed((current) => !current);
    } else {
      setOpen(false);
    }
  };

  useEffect(() => {
    if (!session || !roles.length) return;
    const heartbeat = () => {
      void post('presence', { action: 'heartbeat', path: location.pathname }).catch(() => {});
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 60_000);
    return () => window.clearInterval(timer);
  }, [session, roles, location.pathname]);

  const signOut = async () => {
    try {
      await post('presence', { action: 'logout', path: location.pathname });
    } catch {
      /* Missing activity log must not block sign-out. */
    }
    await supabase.auth.signOut();
  };

  const availableItems = useMemo(
    () => navigationItems.filter((item) => canViewNavigationItem(item, roles)),
    [roles],
  );
  const currentItem =
    [...availableItems]
      .sort((a, b) => b.to.length - a.to.length)
      .find((item) =>
        item.to === '/admin'
          ? location.pathname === item.to
          : location.pathname.startsWith(item.to),
      ) || availableItems[0];
  const primaryRole = roles[0];
  const pageTitle = location.pathname === '/admin/manual' ? 'User Manual' : currentItem?.label || 'RFP workspace';

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
          <button className="btn btn-secondary mt-4" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );

  if (
    isIT &&
    !['/admin', '/admin/it', '/admin/audit-trail', '/admin/manual'].includes(location.pathname)
  ) {
    return <Navigate to="/admin/it" replace />;
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className={`admin-shell min-h-screen ${collapsed ? 'admin-shell-collapsed' : ''}`}>
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
          className={`admin-sidebar fixed inset-y-0 left-0 z-30 flex flex-col overflow-hidden ${collapsed ? 'admin-sidebar-is-collapsed' : ''} ${open ? 'translate-x-0 admin-sidebar-open' : '-translate-x-full'}`}
        >
          <div className="admin-brand flex h-[5.25rem] shrink-0 items-center justify-between gap-2 px-3">
            <Link
              to="/admin"
              className="admin-brand-link flex min-w-0 items-center gap-3 px-2"
              onClick={() => setOpen(false)}
            >
              <span className="admin-brand-mark" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-sm tracking-wide">RFP CONTROL</strong>
                <small className="block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {isIT ? 'IT operations' : 'Finance operations'}
                </small>
              </span>
            </Link>
            <button
              type="button"
              className="admin-menu-toggle focus-ring"
              onClick={toggleSidebar}
              aria-label={collapsed ? 'Show navigation choices' : 'Hide navigation choices'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-controls="staff-navigation"
              aria-expanded={!collapsed}
            >
              <Menu className="admin-desktop-menu-icon" size={21} />
              <X className="admin-mobile-close-icon" size={21} />
            </button>
          </div>

          <nav
            id="staff-navigation"
            className="admin-sidebar-navigation min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pb-3 pt-4"
            aria-label="Staff navigation"
          >
            {(['IT Operations', 'Workspace', 'Administration'] as const).map((group) => {
              const items = availableItems.filter((item) => item.group === group);
              if (!items.length) return null;
              return (
                <div className="mb-5" key={group}>
                  <p className="admin-nav-label">{group}</p>
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
                          <span className="min-w-0">
                            <strong className="block truncate">{item.label}</strong>
                            <small className="block truncate">{item.description}</small>
                          </span>
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="admin-sidebar-footer shrink-0 p-3">
            <NavLink
              to="/admin/manual"
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `admin-sidebar-link w-full ${isActive ? 'admin-sidebar-link-active' : ''}`
              }
            >
              <span className="admin-nav-icon">
                <BookOpen size={18} />
              </span>
              <span className="min-w-0">
                <strong className="block truncate">User Manual</strong>
                <small className="block truncate">Guides, FAQs and troubleshooting</small>
              </span>
            </NavLink>
          </div>
        </aside>

        <div className="admin-content transition-all">
          <header className="admin-topbar flex min-h-[5.25rem] items-center gap-3 px-4 sm:gap-4 lg:px-6">
            <button
              type="button"
              className="admin-mobile-trigger focus-ring"
              onClick={() => setOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={open}
              aria-controls="staff-sidebar"
              title="Open navigation"
            >
              <Menu size={21} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.68rem] font-bold uppercase tracking-[0.15em] text-slate-400">
                {isIT ? 'IT operations' : 'Operations workspace'}
              </p>
              <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
                {pageTitle}
              </h1>
            </div>
            <div className="admin-topbar-actions ml-auto flex min-w-0 shrink-0 items-center gap-2">
              {!isIT && (
                <Link
                  to="/admin/new-request"
                  className="btn btn-primary admin-topbar-request"
                  aria-label="Add a new Request"
                  title="Add a new Request"
                  aria-current={location.pathname === '/admin/new-request' ? 'page' : undefined}
                >
                  <FilePlus2 size={17} aria-hidden="true" />
                  <span className="hidden md:inline">Add a new Request</span>
                </Link>
              )}
              <ThemeToggle compact />
              <div className="admin-account relative" ref={profileMenuRef}>
                <button
                  type="button"
                  className="admin-account-trigger focus-ring"
                  aria-label="Account and profile settings"
                  aria-expanded={profileMenuOpen}
                  aria-controls="admin-account-menu"
                  onClick={() => setProfileMenuOpen((current) => !current)}
                  title="Account and profile"
                >
                  <span className="admin-account-avatar">{initials(identity?.fullName)}</span>
                  <span className="admin-account-copy hidden min-w-0 lg:block">
                    <strong className="block truncate">{identity?.fullName || 'Staff account'}</strong>
                    <small className="block truncate">{primaryRole ? roleLabels[primaryRole] : 'Staff'}</small>
                  </span>
                  <ChevronDown className="admin-account-chevron hidden sm:block" size={16} />
                </button>
                {profileMenuOpen && (
                  <div id="admin-account-menu" className="admin-account-popover" aria-label="Account actions">
                    <div className="admin-account-summary">
                      <strong className="block truncate">{identity?.fullName || 'Staff account'}</strong>
                      <p className="truncate text-xs text-slate-500">{identity?.email}</p>
                      <p className="mt-1 text-xs font-semibold text-emerald-700">
                        {primaryRole ? roleLabels[primaryRole] : 'Staff'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="admin-account-action"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        setEditingName(true);
                      }}
                    >
                      <Pencil size={17} />
                      Edit profile
                    </button>
                    <button
                      type="button"
                      className="admin-account-action admin-account-signout"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        void signOut();
                      }}
                    >
                      <LogOut size={17} />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
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
