import Head from "next/head";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AdminPageShell from "@/components/AdminPageShell";
import ProjectEstimateEditor from "@/components/ProjectEstimateEditor";
import { safeGetLocalStorage } from "@/lib/adminPageHelpers";
import { PipelineData, EstimateRecord, createBlankEstimateRecord, asMoney } from "@/lib/projectPipeline";

export default function EstimatingPage() {
  const router = useRouter();
  const [adminPw, setAdminPw] = useState("");
  const [pipeline, setPipeline] = useState<PipelineData>({ estimates: [], quotes: [], activeJobs: [], completedJobs: [] });
  const [current, setCurrent] = useState<EstimateRecord>(createBlankEstimateRecord());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? safeGetLocalStorage("pcc_admin_pw") : null;
    if (saved) setAdminPw(saved); else router.replace("/admin/signin?returnTo=/admin/estimating");
  }, [router]);

  useEffect(() => { if (adminPw) loadPipeline(); }, [adminPw]);

  useEffect(() => {
    const estimateId = typeof router.query.estimateId === "string" ? router.query.estimateId : "";
    if (!estimateId) return;
    const found = pipeline.estimates.find((item) => item.id === estimateId);
    if (found) setCurrent(found);
  }, [router.query.estimateId, pipeline.estimates]);

  async function loadPipeline() {
    if (!adminPw) return;
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/pipeline", { headers: { "x-admin-password": adminPw } });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to load estimating data");
      const next = j.pipeline as PipelineData;
      setPipeline(next);
      if (next.estimates?.length) setCurrent(next.estimates[0]);
      setStatus(null);
    } catch (e: any) { setError(e?.message || "Failed to load estimating data"); }
    finally { setLoading(false); }
  }

  async function persistEstimate(pushToQuote = false) {
    if (!adminPw) return;
    setSaving(true); setError(null);
    try {
      const saveRes = await fetch("/api/admin/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPw },
        body: JSON.stringify({ action: "saveEstimate", estimate: current }),
      });
      const saveJson = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveJson?.error || "Failed to save estimate");
      let nextPipeline = saveJson.pipeline as PipelineData;
      let nextEstimate = saveJson.estimate as EstimateRecord;
      if (pushToQuote) {
        const quoteRes = await fetch("/api/admin/pipeline", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-password": adminPw },
          body: JSON.stringify({ action: "convertEstimateToQuote", estimateId: nextEstimate.id }),
        });
        const quoteJson = await quoteRes.json();
        if (!quoteRes.ok) throw new Error(quoteJson?.error || "Failed to push estimate to quotes");
        nextPipeline = quoteJson.pipeline as PipelineData;
        nextEstimate = nextPipeline.estimates.find((item) => item.id === nextEstimate.id) || nextEstimate;
        setStatus("Estimate saved and pushed to Quotes.");
      } else {
        setStatus("Estimate saved.");
      }
      setPipeline(nextPipeline);
      setCurrent(nextEstimate);
    } catch (e: any) { setError(e?.message || "Failed to save estimate"); }
    finally { setSaving(false); }
  }

  function signOut() {
    try { window.localStorage.removeItem("pcc_admin_pw"); } catch {}
    router.replace("/admin/signin?returnTo=/admin/estimating");
  }

  return <>
    <Head><title>Admin · Estimating</title></Head>
    <AdminPageShell active="estimating" title="Estimating" subtitle="Build the working sheet here, then push clean quotes and active jobs through the pipeline." onSignOut={signOut}>
      {(status || error) && <div className="subtle" style={{ marginBottom: 12, color: error ? "#b91c1c" : undefined }}>{error || status}</div>}
      <div className="project-two-col" style={{ marginBottom: 18 }}>
        <div className="project-card-surface">
          <div className="project-section-title">Saved Estimates</div>
          <div className="subtle" style={{ marginBottom: 10 }}>Click one to load it back into the estimating sheet for revision.</div>
          <div className="project-list-stack">
            {pipeline.estimates.length === 0 && <div className="subtle">No estimates saved yet.</div>}
            {pipeline.estimates.map((estimate) => (
              <button key={estimate.id} type="button" className={current.id === estimate.id ? "project-list-item project-list-item-active" : "project-list-item"} onClick={() => setCurrent(estimate)}>
                <strong>{estimate.projectName || "Untitled estimate"}</strong>
                <span>{estimate.clientName || "No client"}</span>
                <span>{estimate.quoteNumber || "No quote #"} • {asMoney(estimate.subtotal || 0)}</span>
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 12, gap: 10 }}>
            <button className="btn btn-ghost" onClick={() => setCurrent(createBlankEstimateRecord())}>New Estimate</button>
            <button className="btn btn-ghost" onClick={loadPipeline} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
          </div>
        </div>
        <div className="project-card-surface">
          <div className="project-section-title">Workflow Notes</div>
          <div className="subtle">This first stage gives you the structured estimate sheet, quote storage, active job promotion, completed jobs, and a metrics tab. The next stage will be tying timesheet job dropdowns into Active Jobs so the app has one clean source of truth.</div>
        </div>
      </div>
      <ProjectEstimateEditor estimate={current} setEstimate={setCurrent} onSave={() => persistEstimate(false)} onSaveAndQuote={() => persistEstimate(true)} busy={saving} />
    </AdminPageShell>
  </>;
}
