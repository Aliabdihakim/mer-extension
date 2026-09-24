import { useState } from "react";
import { api, setTokens } from "./api";
import { Brand } from "./Brand";

export function Login({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Google via Chrome's identity flow: Supabase redirects back to the extension's chromiumapp.org URL with tokens in the hash. */
  async function google() {
    setBusy(true);
    setError(null);
    try {
      const redirect = chrome.identity.getRedirectURL();
      const { url } = await api.oauthUrl("google", redirect);
      const result = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
      if (!result) throw new Error("Inloggningen avbröts");
      const hash = new URL(result).hash.replace(/^#/, "");
      const p = new URLSearchParams(hash);
      const accessToken = p.get("access_token"), refreshToken = p.get("refresh_token");
      if (!accessToken || !refreshToken) throw new Error("Inga tokens i svaret");
      await setTokens({ accessToken, refreshToken, email: "" });
      const me = await api.me();
      await setTokens({ accessToken, refreshToken, email: me.email });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = mode === "login" ? await api.login({ email, password }) : await api.signup({ email, password });
      await setTokens(res);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Brand />
      <form onSubmit={submit} className="card stack">
        <div>
          <div className="title">{mode === "login" ? "Logga in" : "Skapa konto"}</div>
          <div className="sub">{mode === "login" ? "Fortsätt där du slutade." : "Ditt CV lagras krypterat i EU."}</div>
        </div>
        <button type="button" className="google" onClick={google} disabled={busy}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.4 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-3.9-13.5-9.4l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
          Fortsätt med Google
        </button>
        <div className="or"><span>eller med e-post</span></div>
        <label className="field">E-post
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="email" />
        </label>
        <label className="field">Lösenord
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? "Vänta…" : mode === "login" ? "Logga in" : "Skapa konto"}</button>
        <p className="small muted" style={{ textAlign: "center", margin: 0 }}>
          {mode === "login" ? <>Inget konto? <a onClick={() => setMode("signup")}>Skapa ett</a></> : <>Har du konto? <a onClick={() => setMode("login")}>Logga in</a></>}
        </p>
      </form>
    </>
  );
}
