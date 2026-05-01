import Head from "next/head";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AdminPageShell from "@/components/AdminPageShell";
import { safeGetLocalStorage } from "@/lib/adminPageHelpers";
import { PipelineData, ActiveJobRecord, asMoney } from "@/lib/projectPipeline";

export default function ActiveJobsPage() {
  const router = useRouter();
  const [adminPw, setAdminPw] = useState("");
  const [pipeline, setPipeline] = useState<PipelineData>({ estimates: [], quotes: [], activeJobs: [], completedJobs: [] });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? safeGetLocalStorage("pcc_admin_pw") : null;
    if (saved) setAdminPw(saved); else router.replace("/admin/signin?returnTo=/admin/active-jobs");
  }, [router]);

  useEffect(() => { if (adminPw) loadPipeline(); }, [adminPw]);

  async function loadPipeline() {
    const r = await fetch("/api/admin/pipeline", { headers: { "x-admin-password": adminPw } });
    const j = await r.json();
    if (!r.ok) return setError(j?.error || "Failed to load active jobs");
    setPipeline(j.pipeline); setError(null);
  }

  async function updateJob(job: ActiveJobRecord, patch: Partial<ActiveJobRecord>) {
    const r = await fetch("/api/admin/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": adminPw },
      body: JSON.stringify({ action: "updateActiveJob", job: { ...job, ...patch } }),
    });
    const j = await r.json();
    if (!r.ok) return setError(j?.error || "Failed to update active job");
    setPipeline(j.pipeline); setStatus("Active job updated."); setError(null);
  }

  async function completeJob(activeJobId: string) {
    const r = await fetch("/api/admin/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": adminPw },
      body: JSON.stringify({ action: "completeJob", activeJobId }),
    });
    const j = await r.json();
    if (!r.ok) return setError(j?.error || "Failed to complete job");
    setPipeline(j.pipeline); setStatus("Job moved to Completed Jobs."); setError(null);
  }

  function signOut() {
    try { window.localStorage.removeItem("pcc_admin_pw"); } catch {}
    router.replace("/admin/signin?returnTo=/admin/active-jobs");
  }

  return <>
    <Head><title>Admin · Active Jobs</title></Head>
    <AdminPageShell active="activeJobs" title="Active Jobs" subtitle="This is the operational master list that timesheets should eventually pull job numbers from." onSignOut={signOut}>
      {(status || error) && <div className="subtle" style={{ marginBottom: 12, color: error ? "#b91c1c" : undefined }}>{error || status}</div>}
      <div className="project-grid-wrap">
        <table className="project-grid-table">
          <thead><tr><th>Job #</th><th>Project</th><th>Client</th><th>Location</th><th>Contract Value</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {pipeline.activeJobs.length === 0 && <tr><td colSpan={7} className="subtle" style={{ padding: 16 }}>No active jobs yet.</td></tr>}
            {pipeline.activeJobs.map((job) => (
              <tr key={job.id}>
                <td>{job.jobNumber}</td>
                <td>{job.projectName}</td>
                <td>{job.clientName}</td>
                <td>{job.projectLocation}</td>
                <td>{asMoney(job.contractValue)}</td>
                <td>
                  <select className="input" value={job.status} onChange={(e) => updateJob(job, { status: e.target.value as ActiveJobRecord["status"] })}>
                    <option value="active">active</option>
                    <option value="on-hold">on-hold</option>
                  </select>
                </td>
                <td><div className="row" style={{ gap: 8, flexWrap: "wrap" }}><button className="btn btn-ghost" onClick={() => router.push("/admin")}>Open Timesheets</button><button className="btn" onClick={() => completeJob(job.id)}>Complete Job</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminPageShell>
  </>;
}
