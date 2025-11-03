import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'

export const Route = createFileRoute('/')({
  component: LoginPage,
})

interface Session {
  apiUrl: string
  capabilities: Record<string, unknown>
  primaryAccounts: Record<string, string>
}

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)

  // API base URL: prefer VITE_API_URL; in dev default to local API on 3001; else same-origin
  const apiBaseUrl =
    (import.meta.env.VITE_API_URL as string | undefined) ??
    (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin)

  // Check if already authenticated on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/.well-known/jmap`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
          credentials: 'include', // Include cookies
        })

        if (response.ok) {
          const data: Session = await response.json()
          setSession(data)
        }
      } catch (err) {
        // Not authenticated, that's fine
        console.debug('Not authenticated:', err)
      }
    }
    checkAuth()
  }, [apiBaseUrl])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const authHeader = `Basic ${btoa(`${email}:${password}`)}`
      const response = await fetch(`${apiBaseUrl}/.well-known/jmap`, {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
        credentials: 'include', // Important: include cookies
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data: Session = await response.json()
      setSession(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch(`${apiBaseUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
      setSession(null)
      setEmail('')
      setPassword('')
    } catch (err) {
      console.error('Logout error:', err)
      // Still clear local state even if request fails
      setSession(null)
    }
  }

  if (session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Authenticated</h2>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">API URL:</strong> {session.apiUrl}
              </p>
              <p>
                <strong className="text-foreground">Capabilities:</strong>{' '}
                {Object.keys(session.capabilities).length > 0
                  ? Object.keys(session.capabilities).join(', ')
                  : 'None'}
              </p>
              <p>
                <strong className="text-foreground">Primary Accounts:</strong>{' '}
                {Object.keys(session.primaryAccounts).length > 0
                  ? Object.keys(session.primaryAccounts).length
                  : 'None'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="mt-6 w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 px-4 py-2 rounded-md font-medium transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground mb-2">JMAP Login</h1>
          <p className="text-muted-foreground">Sign in to your JMAP server</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-6 shadow-sm space-y-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-foreground">
              Email / Username
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="user@example.com"
              autoComplete="username"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium text-foreground">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="text-center text-xs text-muted-foreground">
          API Base: <code className="bg-muted px-1 py-0.5 rounded">{apiBaseUrl}</code>
        </div>
      </div>
    </div>
  )
}
