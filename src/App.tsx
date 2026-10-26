import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './components/AuthProvider';
import { Spinner } from './components/ui';

const AdminLayout = lazy(() =>
  import('./layouts/AdminLayout').then((m) => ({ default: m.AdminLayout })),
);
const RequestPage = lazy(() =>
  import('./pages/RequestPage').then((m) => ({ default: m.RequestPage })),
);
const ReviewPage = lazy(() =>
  import('./pages/ReviewPage').then((m) => ({ default: m.ReviewPage })),
);
const TrackPage = lazy(() => import('./pages/TrackPage').then((m) => ({ default: m.TrackPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const PasswordRecoveryPage = lazy(() =>
  import('./pages/PasswordRecoveryPage').then((m) => ({ default: m.PasswordRecoveryPage })),
);
const PasswordResetPage = lazy(() =>
  import('./pages/PasswordRecoveryPage').then((m) => ({ default: m.PasswordResetPage })),
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const DigitalRfpPrintPage = lazy(() =>
  import('./pages/DigitalRfpPrintPage').then((m) => ({ default: m.DigitalRfpPrintPage })),
);
const MonitoringPage = lazy(() =>
  import('./pages/MonitoringPage').then((m) => ({ default: m.MonitoringPage })),
);
const ApprovalsPage = lazy(() =>
  import('./pages/ApprovalsPage').then((m) => ({ default: m.ApprovalsPage })),
);
const DocumentsPage = lazy(() =>
  import('./pages/DocumentsPage').then((m) => ({ default: m.DocumentsPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const AuditTrailPage = lazy(() =>
  import('./pages/AuditTrailPage').then((m) => ({ default: m.AuditTrailPage })),
);

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense
          fallback={
            <div className="p-8 text-center">
              <Spinner />
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<RequestPage />} />
            <Route path="/track/:token" element={<TrackPage />} />
            <Route path="/review/:token" element={<ReviewPage />} />
            <Route path="/admin/login" element={<LoginPage />} />
            <Route path="/admin/forgot-password" element={<PasswordRecoveryPage />} />
            <Route path="/admin/reset-password" element={<PasswordResetPage />} />
            <Route path="/admin/rfp/:id/print" element={<DigitalRfpPrintPage />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="monitoring" element={<MonitoringPage />} />
              <Route path="approvals" element={<ApprovalsPage />} />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="account-management" element={<SettingsPage />} />
              <Route
                path="approver-management"
                element={<Navigate to="../account-management" replace />}
              />
              <Route
                path="approving-heads"
                element={<Navigate to="../account-management" replace />}
              />
              <Route path="audit-trail" element={<AuditTrailPage />} />
              <Route path="settings" element={<Navigate to="../account-management" replace />} />
            </Route>
            <Route
              path="*"
              element={
                <main className="grid min-h-screen place-items-center">
                  <div className="text-center">
                    <h1 className="text-3xl font-semibold">Page not found</h1>
                    <a href="/" className="mt-3 block text-blue-700">
                      Return home
                    </a>
                  </div>
                </main>
              }
            />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
