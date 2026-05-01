import Head from "next/head";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import AdminPageShell from "@/components/AdminPageShell";
import { safeGetLocalStorage } from "@/lib/adminPageHelpers";
import { PipelineData, asMoney } from "@/lib/projectPipeline";

export default function ProjectMetricsPage() {
  const router = useRouter();
  const [adminPw, setAdminPw] = useState("");
  const [pipeline, setPipeline] = useState<PipelineData>({ estimates: [], quotes: [], activeJobs: [], completedJobs: [] });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? safeGetLocalStorage("pcc_admin_pw") : null;
    if (saved) setAdminPw(saved); else router.replace("/admin/signin?returnTo=/admin/project-metrics");
  }, [router]);

  useEffect(() => { if (adminPw) loadPipeline(); }, [adminPw]);

  async function loadPipeline() {
    const r = await fetch("/api/admin/pipeline", { headers: { "x-admin-password": adminPw } });
    const j = await r.json();
    if (!r.ok) return setError(j?.error || "Failed to load project metrics");
    setPipeline(j.pipeline); setError(null);
  }

  const stats = useMemo(() => {
    const estimateValue = pipeline.estimates.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const quoteValue = pipeline.quotes.reduce((sum, item) => sum + Number(item.estimateTotal || 0), 0);
    const activeValue = pipeline.activeJobs.reduce((sum, item) => sum + Number(item.contractValue || 0), 0);
    const completedValue = pipeline.completedJobs.reduce((sum, item) => sum + Number(item.contractValue || 0), 0);
    return { estimateValue, quoteValue, activeValue, completedValue };
  }, [pipeline]);

  function signOut() {
    try { window.localStorage.removeItem("pcc_admin_pw"); } catch {}
    router.replace("/admin/signin?returnTo=/admin/project-metrics");
  }

  return <>
    <Head><title>Admin · Project Metrics</title></Head>
    <AdminPageShell active="projectMetrics" title="Project Metrics" subtitle="Early-stage financial tracking. Later this will absorb timesheet labour, equipment, and production data." onSignOut={signOut}>
      {error && <div className="subtle" style={{ marginBottom: 12, color: "#b91c1c" }}>{error}</div>}
      <div className="project-metric-cards">
        <div className="project-card-surface"><div className="project-section-title">Estimate Pipeline</div><div className="project-big-number">{asMoney(stats.estimateValue)}</div><div className="subtle">{pipeline.estimates.length} estimate records</div></div>
        <div className="project-card-surface"><div className="project-section-title">Quotes</div><div className="project-big-number">{asMoney(stats.quoteValue)}</div><div className="subtle">{pipeline.quotes.length} quote records</div></div>
        <div className="project-card-surface"><div className="project-section-title">Active Jobs</div><div className="project-big-number">{asMoney(stats.activeValue)}</div><div className="subtle">{pipeline.activeJobs.length} active jobs</div></div>
        <div className="project-card-surface"><div className="project-section-title">Completed Jobs</div><div className="project-big-number">{asMoney(stats.completedValue)}</div><div className="subtle">{pipeline.completedJobs.length} completed jobs</div></div>
      </div>
      <div className="project-card-surface" style={{ marginTop: 18 }}>
        <div className="project-section-title">Next Recommended Build Step</div>
        <div className="subtle">The next high-value move is wiring Active Jobs into your timesheet job dropdowns so the job list is no longer maintained in two places. After that, labour and equipment hours can start rolling into project metrics automatically.</div>
      </div>
    </AdminPageShell>
  </>;
}
