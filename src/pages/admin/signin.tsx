import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

export default function AdminSignIn() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("pcc_admin_pw");
      if (saved) {
        const rt = typeof router.query?.returnTo === "string" ? router.query.returnTo : "/admin";
        router.replace(rt);
      }
    } catch {
      // ignore
    }
  }, [router]);

  async function signIn() {
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "x-admin-password": pw },
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) {
        setErr(j?.error || "Invalid password");
        return;
      }
      localStorage.setItem("pcc_admin_pw", pw);
      const rt = typeof router.query?.returnTo === "string" ? router.query.returnTo : "/admin";
      router.replace(rt);
    } catch (e: any) {
      setErr(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="topbar">
        <Link className="btn btn-ghost" href="/">
          ← Return to Timesheet
        </Link>
      </div>

      <section className="card card-lg">
        <div className="stack">
          <div className="page-header">
<div>
              <h1 className="h1">Admin</h1>
              <p className="subtle">Enter the admin password to continue.</p>
            </div>
          </div>

          <label className="field">
            <span className="label">Password</span>
            <input
              className="input"
              type="password"
              value={pw}
              autoFocus
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") signIn();
              }}
              placeholder="••••••••"
            />
          </label>

          {err && <div className="alert alert-bad">{err}</div>}

          <button className="btn btn-primary" onClick={signIn} disabled={loading}>
            {loading ? "Signing in…" : "Continue"}
          </button>

          <div className="subtle" style={{ textAlign: "center" }}>
            This login is stored on this device until you sign out.
          </div>
        </div>
      </section>
    </main>
  );
}
