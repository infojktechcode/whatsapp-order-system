import { useState } from "react"
import { signInAdmin } from "../../services/admin.service.js"

// Staff sign-in. Supabase Auth handles the credentials; the password never
// leaves this form and no session token is handled here.
export function AdminLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signInAdmin(email.trim(), password)
      onSignedIn()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sign-in failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto p-4 space-y-3">
      <h1 className="text-xl font-bold">Admin sign in</h1>
      <p className="text-sm text-gray-500">
        Staff accounts only. Ask a super admin to add you to admin_users.
      </p>

      <label className="block text-sm">
        <span className="text-gray-700">Email</span>
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="block text-sm">
        <span className="text-gray-700">Password</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-gray-800 py-3 text-white disabled:opacity-50"
      >
        {busy ? "Signing in..." : "Sign in"}
      </button>
    </form>
  )
}