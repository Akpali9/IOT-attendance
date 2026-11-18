import { useState, type FormEvent } from "react"
import { Fingerprint, KeyRound, ShieldCheck } from "lucide-react"
import { ORGANIZATION_NAME, ORGANIZATION_SHORT_NAME } from "./constants"

type Credentials = { username: string; password: string }
type SetupCredentials = Credentials & { setupToken: string }
type AccessMode = "login" | "setup"

type AdminAccessProps = {
  onSignIn: (credentials: Credentials) => Promise<string | null>
  onBootstrap: (credentials: SetupCredentials) => Promise<string | null>
}

export function AdminAccess({ onSignIn, onBootstrap }: AdminAccessProps) {
  const [mode, setMode] = useState<AccessMode>("login")
  const [username, setUsername] = useState("superadmin")
  const [password, setPassword] = useState("password123")
  const [setupToken, setSetupToken] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setBusy(true)

    try {
      const result =
        mode === "setup"
          ? await onBootstrap({ username, password, setupToken })
          : await onSignIn({ username, password })
      if (result) setError(result)
    } catch {
      setError("Access could not be verified. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const isSetup = mode === "setup"
  const usingDefaultAdmin = username.trim().toLowerCase() === "superadmin" && password === "password123"

  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f7f4] p-4 text-[#172b23] sm:p-8">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-[#e7eae5] bg-white shadow-[0_24px_80px_rgba(24,48,36,0.09)] lg:grid-cols-[1.05fr_.95fr]">
        <section className="flex min-h-[280px] flex-col justify-between bg-[#173c2e] p-7 text-white sm:p-10 lg:min-h-[600px]">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-white/10">
                <Fingerprint size={22} aria-hidden="true" />
              </span>
              <div>
                <div className="text-lg font-semibold tracking-tight">{ORGANIZATION_SHORT_NAME}</div>
                <div className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#b9cec0]">Attendance</div>
              </div>
            </div>
            <div className="mt-12 max-w-md">
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#b9cec0]">{ORGANIZATION_NAME}</p>
              <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-[-.04em] sm:text-4xl">
                Attendance with trust built in.
              </h1>
              <p className="mt-4 max-w-sm text-sm leading-6 text-[#d0ddd4]">
                Member details stay behind administrator access. Attendance can be captured from member ID cards, QR credentials, and supported fingerprint devices.
              </p>
            </div>
          </div>
          <div className="mt-10 flex items-center gap-2 text-xs text-[#c4d4ca]">
            <ShieldCheck size={15} aria-hidden="true" />
            Private member records · ID card scanning · IoT-ready attendance
          </div>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-sm">
            <div className="mb-7 grid size-11 place-items-center rounded-xl bg-[#edf3ed] text-[#315f43]">
              {isSetup ? <KeyRound size={19} aria-hidden="true" /> : <ShieldCheck size={19} aria-hidden="true" />}
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#7b8b80]">
              {isSetup ? "Initial administrator" : "Administrator access"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">
              {isSetup ? "Set up the first admin" : "Welcome back"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#748078]">
              {isSetup
                ? "Create the first administrator. The default superadmin account can be initialized once when the server-side bootstrap switch is enabled."
                : "Sign in with your administrator username and password to open the LAM workspace."}
            </p>

            <form className="mt-7 space-y-4" onSubmit={submit}>
              <label className="block text-xs font-medium text-[#43544a]">
                Username
                <input
                  autoComplete="username"
                  className="mt-1.5 w-full rounded-lg border border-[#e1e7e1] bg-white px-3.5 py-3 text-sm outline-none transition focus:border-[#73907a] focus:ring-2 focus:ring-[#73907a]/15"
                  maxLength={32}
                  minLength={3}
                  pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="superadmin"
                />
              </label>
              <label className="block text-xs font-medium text-[#43544a]">
                Password
                <input
                  autoComplete={isSetup ? "new-password" : "current-password"}
                  className="mt-1.5 w-full rounded-lg border border-[#e1e7e1] bg-white px-3.5 py-3 text-sm outline-none transition focus:border-[#73907a] focus:ring-2 focus:ring-[#73907a]/15"
                  maxLength={128}
                  minLength={isSetup && !usingDefaultAdmin ? 12 : 1}
                  required
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={isSetup ? "At least 12 characters" : "Enter administrator password"}
                />
              </label>
              {isSetup && !usingDefaultAdmin && (
                <label className="block text-xs font-medium text-[#43544a]">
                  One-time setup token
                  <input
                    autoComplete="off"
                    className="mt-1.5 w-full rounded-lg border border-[#e1e7e1] bg-white px-3.5 py-3 text-sm outline-none transition focus:border-[#73907a] focus:ring-2 focus:ring-[#73907a]/15"
                    minLength={32}
                    required
                    type="password"
                    value={setupToken}
                    onChange={(event) => setSetupToken(event.target.value)}
                    placeholder="Paste the private setup token"
                  />
                </label>
              )}
              {error && (
                <p role="alert" className="rounded-lg border border-[#efd6d0] bg-[#fbf1ef] px-3 py-2.5 text-xs leading-5 text-[#965544]">
                  {error}
                </p>
              )}
              <button
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#193e30] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#24533f] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={busy}
                type="submit"
              >
                {busy ? "Please wait…" : isSetup ? "Create administrator" : "Sign in securely"}
              </button>
            </form>

            <div className="mt-6 border-t border-[#edf0ec] pt-5 text-center text-xs text-[#718078]">
              {isSetup ? "Already set up?" : "First time here?"}{" "}
              <button
                className="font-semibold text-[#3d6c4b] underline-offset-4 hover:underline"
                onClick={() => {
                  setError(null)
                  setMode(isSetup ? "login" : "setup")
                }}
                type="button"
              >
                {isSetup ? "Return to sign in" : "Set up the first administrator"}
              </button>
            </div>
            
          </div>
        </section>
      </div>
    </main>
  )
}
