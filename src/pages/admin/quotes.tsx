import Head from "next/head";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AdminPageShell from "@/components/AdminPageShell";
import { safeGetLocalStorage } from "@/lib/adminPageHelpers";
import { PipelineData, QuoteRecord, asMoney } from "@/lib/projectPipeline";

const STATUSES: QuoteRecord["status"][] = ["draft", "ready", "sent", "awarded", "lost", "cancelled", "started"];

export default function QuotesPage() {
  const router = useRouter();
  const [adminPw, setAdminPw] = useState("");
  const [pipeline, setPipeline] = useState<PipelineData>({ estimates: [], quotes: [], activeJobs: [], completedJobs: [] });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? safeGetLocalStorage("pcc_admin_pw") : null;
    if (saved) setAdminPw(saved); else router.replace("/admin/signin?returnTo=/admin/quotes");
  }, [router]);

  useEffect(() => { if (adminPw) loadPipeline(); }, [adminPw]);

  async function loadPipeline() {
    const r = await fetch("/api/admin/pipeline", { headers: { "x-admin-password": adminPw } });
    const j = await r.json();
    if (!r.ok) return setError(j?.error || "Failed to load quotes");
    setPipeline(j.pipeline); setError(null);
  }

  async function updateQuote(quote: QuoteRecord, patch: Partial<QuoteRecord>) {
    const r = await fetch("/api/admin/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": adminPw },
      body: JSON.stringify({ action: "updateQuote", quote: { ...quote, ...patch } }),
    });
    const j = await r.json();
    if (!r.ok) return setError(j?.error || "Failed to update quote");
    setPipeline(j.pipeline); setStatus("Quote updated."); setError(null);
  }

  async function startProject(quoteId: string) {
    const r = await fetch("/api/admin/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": adminPw },
      body: JSON.stringify({ action: "startProject", quoteId }),
    });
    const j = await r.json();
    if (!r.ok) return setError(j?.error || "Failed to start project");
    setPipeline(j.pipeline); setStatus("Quote moved to Active Jobs."); setError(null);
  }

  function signOut() {
    try { window.localStorage.removeItem("pcc_admin_pw"); } catch {}
    router.replace("/admin/signin?returnTo=/admin/quotes");
  }

  return <>
    <Head><title>Admin · Quotes</title></Head>
    <AdminPageShell active="quotes" title="Quotes" subtitle="Use this as the storage and conversion layer between estimating and live work." onSignOut={signOut}>
      {(status || error) && <div className="subtle" style={{ marginBottom: 12, color: error ? "#b91c1c" : undefined }}>{error || status}</div>}
      <div className="project-grid-wrap">
        <table className="project-grid-table">
          <thead><tr><th>Quote #</th><th>Project</th><th>Client</th><th>Location</th><th>Value</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {pipeline.quotes.length === 0 && <tr><td colSpan={7} className="subtle" style={{ padding: 16 }}>No quotes yet. Push one from Estimating.</td></tr>}
            {pipeline.quotes.map((quote) => (
              <tr key={quote.id}>
                <td>{quote.quoteNumber || "—"}</td>
                <td>{quote.projectName || "Untitled quote"}</td>
                <td>{quote.clientName || "—"}</td>
                <td>{quote.projectLocation || "—"}</td>
                <td>{asMoney(quote.estimateTotal)}</td>
                <td>
                  <select className="input" value={quote.status} onChange={(e) => updateQuote(quote, { status: e.target.value as QuoteRecord["status"] })}>
                    {STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </td>
                <td><div className="row" style={{ gap: 8, flexWrap: "wrap" }}><button className="btn btn-ghost" onClick={() => router.push(`/admin/estimating?estimateId=${quote.estimateId}`)}>Open Estimate</button><button className="btn" onClick={() => startProject(quote.id)}>{quote.activeJobId ? "Open Active Job" : "Start Project"}</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminPageShell>
  </>;
}
