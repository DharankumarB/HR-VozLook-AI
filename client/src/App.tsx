import { Loader2 } from 'lucide-react'
import { Suspense, lazy, type ReactElement } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AdminLayout } from './components/admin/AdminLayout'
import { RequireAdmin } from './components/admin/RequireAdmin'
import { useAuth } from './state/AuthContext'

const Landing = lazy(() => import('./pages/Landing'))
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const ResumePage = lazy(() => import('./pages/ResumePage'))
const JobPage = lazy(() => import('./pages/JobPage'))
const InterviewSetup = lazy(() => import('./pages/InterviewSetup'))
const InterviewSession = lazy(() => import('./pages/InterviewSession'))
const InterviewReport = lazy(() => import('./pages/InterviewReport'))
const History = lazy(() => import('./pages/History'))
const Progress = lazy(() => import('./pages/Progress'))
const Coach = lazy(() => import('./pages/Coach'))
const Profile = lazy(() => import('./pages/Profile'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const NotFound = lazy(() => import('./pages/NotFound'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'))
const AdminUserDetail = lazy(() => import('./pages/admin/AdminUserDetail'))
const AdminInterviews = lazy(() => import('./pages/admin/AdminInterviews'))
const AdminInterviewDetail = lazy(() => import('./pages/admin/AdminInterviewDetail'))
const AdminReports = lazy(() => import('./pages/admin/AdminReports'))
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'))
const AdminSystem = lazy(() => import('./pages/admin/AdminSystem'))
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'))

function Splash({ label = 'Loading VozHireQ…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-sheen shadow-glow">
        <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden />
      </span>
      <p className="text-sm text-ink-400">{label}</p>
    </div>
  )
}

/** Wraps authenticated pages: redirects to login, then to onboarding if it is not finished. */
function Protected({ children, allowWithoutOnboarding = false }: { children: ReactElement; allowWithoutOnboarding?: boolean }) {
  const { user, profile, initialising } = useAuth()
  const location = useLocation()

  if (initialising) return <Splash />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  const completed = Boolean(profile?.onboarding_completed)
  if (!completed && !allowWithoutOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }
  if (completed && location.pathname === '/onboarding') {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

/** Keeps signed-in users away from the auth screens. */
function PublicOnly({ children }: { children: ReactElement }) {
  const { user, profile, initialising, isAdmin } = useAuth()
  if (initialising) return <Splash />
  if (!user) return children
  if (isAdmin) return <Navigate to="/admin" replace />
  return <Navigate to={profile?.onboarding_completed ? '/dashboard' : '/onboarding'} replace />
}

export default function App() {
  return (
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/login"
          element={
            <PublicOnly>
              <Login />
            </PublicOnly>
          }
        />
        <Route
          path="/signup"
          element={
            <PublicOnly>
              <Signup />
            </PublicOnly>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <PublicOnly>
              <ForgotPassword />
            </PublicOnly>
          }
        />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route
          path="/onboarding"
          element={
            <Protected allowWithoutOnboarding>
              <Onboarding />
            </Protected>
          }
        />
        <Route
          path="/dashboard"
          element={
            <Protected>
              <Dashboard />
            </Protected>
          }
        />
        <Route
          path="/resume"
          element={
            <Protected>
              <ResumePage />
            </Protected>
          }
        />
        <Route
          path="/job"
          element={
            <Protected>
              <JobPage />
            </Protected>
          }
        />
        <Route
          path="/interview/setup"
          element={
            <Protected>
              <InterviewSetup />
            </Protected>
          }
        />
        <Route
          path="/interview/:id"
          element={
            <Protected>
              <InterviewSession />
            </Protected>
          }
        />
        <Route
          path="/interview/:id/report"
          element={
            <Protected>
              <InterviewReport />
            </Protected>
          }
        />
        <Route
          path="/reports/:reportId"
          element={
            <Protected>
              <InterviewReport />
            </Protected>
          }
        />
        <Route
          path="/history"
          element={
            <Protected>
              <History />
            </Protected>
          }
        />
        <Route
          path="/progress"
          element={
            <Protected>
              <Progress />
            </Protected>
          }
        />
        <Route
          path="/coach"
          element={
            <Protected>
              <Coach />
            </Protected>
          }
        />
        <Route
          path="/profile"
          element={
            <Protected>
              <Profile />
            </Protected>
          }
        />
        <Route
          path="/settings"
          element={
            <Protected>
              <SettingsPage />
            </Protected>
          }
        />
        {/* Administrator console: a separate premium layout, gated by a live server role check. */}
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="users/:id" element={<AdminUserDetail />} />
          <Route path="interviews" element={<AdminInterviews />} />
          <Route path="interviews/:id" element={<AdminInterviewDetail />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="system" element={<AdminSystem />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
