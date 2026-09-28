import type {
  AdminAnalytics,
  AdminInterviewDetail,
  AdminInterviewRow,
  AdminLogEntry,
  AdminOverview,
  AdminReportInsights,
  AdminSettingsResponse,
  AdminUserRow,
  AnswerRecord,
  CoachResponse,
  DashboardResponse,
  EvaluationRecord,
  InterviewRecord,
  InterviewState,
  JobRecord,
  MetaResponse,
  Profile,
  ProgressResponse,
  QuestionRecord,
  ReportRecord,
  LanguageCode,
  ResumeRecord,
  SessionUser,
  WeakTopic,
} from './types'

const TOKEN_KEY = 'vozlook.session.token'

/** Endpoints where a 401 means "wrong credentials", not "expired session". */
const CREDENTIAL_ENDPOINTS = [
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/google',
  '/api/auth/change-password',
  '/api/auth/account',
]

export class ApiError extends Error {
  status: number
  code: string
  details?: unknown

  constructor(message: string, status = 500, code = 'error', details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable (private mode) — the session simply won't persist */
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  formData?: FormData
  signal?: AbortSignal
  /** Set for binary responses (PDF download). */
  responseType?: 'json' | 'blob'
  tokenOverride?: string
}

/** A friendly, user-facing message for anything that can go wrong on a request. */
function networkMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'The request was cancelled.'
  return 'We could not reach the server. Check your connection and try again.'
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, formData, signal, responseType = 'json', tokenOverride } = options
  const headers: Record<string, string> = {}
  const token = tokenOverride ?? getToken()
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined && !formData) headers['content-type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers,
      signal,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
      credentials: 'same-origin',
    })
  } catch (error) {
    throw new ApiError(networkMessage(error), 0, 'network_error')
  }

  if (response.status === 204) return undefined as T

  if (responseType === 'blob') {
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      throw new ApiError(payload?.error?.message ?? 'The download failed. Please try again.', response.status, payload?.error?.code ?? 'error')
    }
    return (await response.blob()) as unknown as T
  }

  let payload: any = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    // An expired session should log the app out, but a wrong password on an auth screen must not.
    if (response.status === 401 && token && !CREDENTIAL_ENDPOINTS.some((prefix) => path.startsWith(prefix))) {
      try {
        window.dispatchEvent(new CustomEvent('vozlook:unauthorized'))
      } catch {
        /* non-browser environment */
      }
    }
    const message = payload?.error?.message ?? (response.status === 401 ? 'Your session has expired. Please sign in again.' : 'Something went wrong. Please try again.')
    throw new ApiError(message, response.status, payload?.error?.code ?? 'error', payload?.error?.details)
  }

  return payload as T
}

/* ------------------------------------------------------------------ */
/* Endpoints                              */
/* ------------------------------------------------------------------ */

export const api = {
  /* meta ------------------------------------------------------------------ */
  meta: () => request<MetaResponse>('/api/meta'),
  health: () => request<{ ok: boolean; status: string }>('/api/health'),

  /* auth ------------------------------------------------------------------ */
  signup: (input: { email: string; password: string; fullName?: string }) =>
    request<{ token: string; user: SessionUser; profile: Profile }>('/api/auth/signup', { method: 'POST', body: input }),
  login: (input: { email: string; password: string }) =>
    request<{ token: string; user: SessionUser; profile: Profile }>('/api/auth/login', { method: 'POST', body: input }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  me: () =>
    request<{
      user: SessionUser
      profile: Profile
      provider: string
      redirect_to?: string
      admin?: { surface: string; can_access: boolean }
    }>('/api/auth/me'),
  /** Exchanges a Google Identity Services credential (ID token) for a VozHireQ session. */
  google: (credential: string) =>
    request<{ token: string; user: SessionUser; profile: Profile; is_new_account: boolean; redirect_to: string }>('/api/auth/google', {
      method: 'POST',
      body: { credential },
    }),
  setLanguage: (language: LanguageCode) =>
    request<{ ok: boolean; language: LanguageCode }>('/api/auth/language', { method: 'PUT', body: { language } }),
  forgotPassword: (email: string) =>
    request<{ ok: boolean; message: string; resetToken?: string; resetPath?: string; notice?: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: { email },
    }),
  resetPassword: (input: { token: string; password: string }) =>
    request<{ ok: boolean; message: string; session: { token: string; user: SessionUser; profile: Profile } | null }>('/api/auth/reset-password', {
      method: 'POST',
      body: input,
    }),
  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    request<{ ok: boolean; message: string }>('/api/auth/change-password', { method: 'POST', body: input }),
  deleteAccount: (input: { password?: string; confirm: 'DELETE' }) =>
    request<{ ok: boolean; message: string }>('/api/auth/account', { method: 'DELETE', body: input }),

  /* profile --------------------------------------------------------------- */
  getProfile: () =>
    request<{
      profile: Profile
      user: SessionUser & { provider?: string }
      has_resume: boolean
      has_job: boolean
      resume_file: { id: string; file_name: string; created_at: string } | null
      job: { id: string; title: string; company: string | null; created_at: string } | null
    }>('/api/profile'),
  updateProfile: (input: Partial<Pick<Profile, 'full_name' | 'target_role' | 'company' | 'experience_level' | 'preferred_mode' | 'avatar_url'>> & { onboarding_completed?: boolean }) =>
    request<{ profile: Profile }>('/api/profile', { method: 'PUT', body: input }),
  uploadAvatar: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return request<{ avatar_url: string }>('/api/profile/avatar', { method: 'POST', formData })
  },

  /* résumé ---------------------------------------------------------------- */
  getResume: () => request<{ resume: ResumeRecord | null }>('/api/resume'),
  analyzeResume: (file: File, onProgress?: (percent: number) => void) =>
    new Promise<{ resume: ResumeRecord; message: string }>((resolve, reject) => {
      const formData = new FormData()
      formData.append('file', file)
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/resume/analyze')
      const token = getToken()
      if (token) xhr.setRequestHeader('authorization', `Bearer ${token}`)
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100))
      }
      xhr.onload = () => {
        try {
          const payload = JSON.parse(xhr.responseText || '{}')
          if (xhr.status >= 200 && xhr.status < 300) resolve(payload)
          else reject(new ApiError(payload?.error?.message ?? 'The upload failed.', xhr.status, payload?.error?.code ?? 'error'))
        } catch {
          reject(new ApiError('The upload failed. Please try again.', xhr.status))
        }
      }
      xhr.onerror = () => reject(new ApiError('We could not reach the server during the upload.', 0, 'network_error'))
      xhr.ontimeout = () => reject(new ApiError('The upload timed out. Try a smaller file.', 0, 'timeout'))
      xhr.send(formData)
    }),
  analyzeResumeText: (text: string) => request<{ resume: { id: string; parsed_data: ResumeRecord['parsed_data'] }; message: string }>('/api/resume/text', { method: 'POST', body: { text } }),
  deleteResume: (id: string) => request<{ ok: boolean }>(`/api/resume/${id}`, { method: 'DELETE' }),

  /* job ------------------------------------------------------------------- */
  getJob: () => request<{ job: JobRecord | null }>('/api/job'),
  analyzeJob: (input: { title?: string; company?: string; description: string }) =>
    request<{ job: JobRecord; message: string }>('/api/job/analyze', { method: 'POST', body: input }),
  analyzeJobFile: (file: File, input: { title?: string; company?: string } = {}) => {
    const formData = new FormData()
    formData.append('file', file)
    if (input.title) formData.append('title', input.title)
    if (input.company) formData.append('company', input.company)
    return request<{ job: JobRecord; message: string }>('/api/job/analyze-file', { method: 'POST', formData })
  },
  deleteJob: (id: string) => request<{ ok: boolean }>(`/api/job/${id}`, { method: 'DELETE' }),

  /* interview ------------------------------------------------------------- */
  createInterview: (input: {
    jobRole?: string
    interviewType?: string
    difficulty?: string
    mode?: string
    questionCount?: number
    settings?: Record<string, unknown>
  }) => request<InterviewState>('/api/interview/create', { method: 'POST', body: input }),
  getInterview: (id: string) => request<InterviewState>(`/api/interview/${id}`),
  listInterviews: (filters: { jobRole?: string; interviewType?: string; status?: string; from?: string; to?: string } = {}) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
    const query = params.toString()
    return request<{ interviews: InterviewRecord[]; options: { question_counts: number[] } }>(`/api/interview/list${query ? `?${query}` : ''}`)
  },
  nextQuestion: (id: string) => request<{ question: QuestionRecord; state: InterviewState }>(`/api/interview/${id}/question`, { method: 'POST' }),
  submitAnswer: (
    id: string,
    input: {
      questionId?: string
      answerText: string
      durationSeconds?: number
      mediaMetrics?: Record<string, unknown> | null
      audioUrl?: string | null
      videoUrl?: string | null
    },
  ) =>
    request<{
      answer: AnswerRecord
      evaluation: EvaluationRecord
      nextQuestion: QuestionRecord | null
      completed: boolean
      progress: { answered: number; total: number }
      state: InterviewState
    }>(`/api/interview/${id}/answer`, { method: 'POST', body: input }),
  skipQuestion: (id: string, questionId?: string) =>
    request<{
      answer: AnswerRecord
      evaluation: EvaluationRecord
      nextQuestion: QuestionRecord | null
      completed: boolean
      progress: { answered: number; total: number }
      state: InterviewState
    }>(`/api/interview/${id}/skip`, { method: 'POST', body: { questionId } }),
  endInterview: (id: string) => request<{ report: ReportRecord; state: InterviewState }>(`/api/interview/${id}/end`, { method: 'POST' }),
  deleteInterview: (id: string) => request<{ ok: boolean }>(`/api/interview/${id}`, { method: 'DELETE' }),
  uploadMedia: (id: string, blob: Blob, kind: 'audio' | 'video', fileName: string) => {
    const formData = new FormData()
    formData.append('file', blob, fileName)
    formData.append('kind', kind)
    return request<{ url: string; key: string; kind: string; size: number }>(`/api/interview/${id}/media`, { method: 'POST', formData })
  },

  /* reports / analytics --------------------------------------------------- */
  getReport: (interviewId: string) => request<{ report: ReportRecord; interview: InterviewRecord; candidateName: string }>(`/api/interviews/${interviewId}/report`),
  regenerateReport: (interviewId: string) =>
    request<{ report: ReportRecord; interview: InterviewRecord; candidateName: string }>(`/api/interviews/${interviewId}/report/regenerate`, { method: 'POST' }),
  getReportById: (reportId: string) => request<{ report: ReportRecord; interview: InterviewRecord; candidateName: string }>(`/api/reports/${reportId}`),
  downloadReportPdf: (interviewId: string) => request<Blob>(`/api/interviews/${interviewId}/report/pdf`, { responseType: 'blob' }),
  dashboard: () => request<DashboardResponse>('/api/dashboard'),
  progress: () => request<ProgressResponse>('/api/progress'),
  weakTopics: () => request<{ topics: WeakTopic[] }>('/api/weak-topics'),

  /* coach ----------------------------------------------------------------- */
  coach: (messages: { role: 'user' | 'assistant'; content: string }[]) => request<CoachResponse>('/api/coach', { method: 'POST', body: { messages } }),
  coachSuggestions: () => request<{ suggestions: string[]; weak_topics: string[]; target_role: string | null }>('/api/coach/suggestions'),

  /* admin console ---------------------------------------------------------
   * Every call is authorised server-side from the database role; the client
   * never decides who is an administrator.
   * ---------------------------------------------------------------------- */
  admin: {
    me: () => request<{ user: { id: string; email: string; role: string }; admin: { surface: string; provisioning: number } }>('/api/admin/me'),
    overview: () => request<AdminOverview>('/api/admin/overview'),
    analytics: (rangeDays = 30) => request<AdminAnalytics>(`/api/admin/analytics?range=${rangeDays}`),
    users: (filters: { search?: string; role?: string; status?: string; from?: string; to?: string } = {}) => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(filters)) if (value && value !== 'all') params.set(key, value)
      const query = params.toString()
      return request<{ users: AdminUserRow[]; options: { roles: string[]; statuses: string[] } }>(`/api/admin/users${query ? `?${query}` : ''}`)
    },
    user: (id: string) =>
      request<{
        user: AdminUserRow
        profile: Profile | null
        interviews: AdminInterviewRow[]
        resumes: { id: string; file_name: string; created_at: string; skills: number }[]
        jobs: { id: string; title: string; company: string | null; created_at: string }[]
        reports: { id: string; interview_id: string; overall_score: number; created_at: string }[]
        activity: { id: string; action: string; created_at: string; target_type: string | null }[]
        progress: { interviews: number; completed: number; average_score: number | null; best_score: number | null }
      }>(`/api/admin/users/${id}`),
    setUserStatus: (id: string, status: 'active' | 'disabled') =>
      request<{ ok: boolean; status: string }>(`/api/admin/users/${id}/status`, { method: 'POST', body: { status } }),
    deleteUser: (id: string) => request<{ ok: boolean; message: string }>(`/api/admin/users/${id}`, { method: 'DELETE' }),
    interviews: (filters: { search?: string; type?: string; mode?: string; status?: string; from?: string; to?: string } = {}) => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(filters)) if (value && value !== 'all') params.set(key, value)
      const query = params.toString()
      return request<{
        interviews: AdminInterviewRow[]
        totals: { all: number; completed: number; in_progress: number; with_report: number }
      }>(`/api/admin/interviews${query ? `?${query}` : ''}`)
    },
    interview: (id: string) => request<AdminInterviewDetail>(`/api/admin/interviews/${id}`),
    reports: () => request<AdminReportInsights>('/api/admin/reports'),
    settings: () => request<AdminSettingsResponse>('/api/admin/settings'),
    updateSetting: (key: string, value: string | number | boolean) =>
      request<{ ok: boolean; settings: AdminSettingsResponse['settings'] }>(`/api/admin/settings/${key}`, { method: 'PUT', body: { value } }),
    logs: (limit = 100) => request<{ logs: AdminLogEntry[] }>(`/api/admin/logs?limit=${limit}`),
  },
}

/** Builds an authenticated URL for locally stored files (avatars, résumés, recordings). */
export function fileUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  if (pathOrUrl.startsWith('supabase://')) return null // private bucket: accessed via the backend only
  if (pathOrUrl.startsWith('/api/files/')) {
    const token = getToken()
    return token ? `${pathOrUrl}?token=${encodeURIComponent(token)}` : pathOrUrl
  }
  return pathOrUrl
}

/** Triggers a browser download for an already-fetched blob. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
