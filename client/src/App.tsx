import { Loader2 } from 'lucide-react'
import { Suspense, lazy, type ReactElement } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
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

function Splash({ label = 'Loading VozLook InterviewAI…' }: { label?: string }) {
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
  const { user, profile, initialising } = useAuth()
  if (initialising) return <Splash />
  if (!user) return children
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
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
