import Head from "next/head";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AdminPageShell from "@/components/AdminPageShell";
import { safeGetLocalStorage } from "@/lib/adminPageHelpers";
import { PipelineData, asMoney } from "@/lib/projectPipeline";

export default function CompletedJobsPage() {
  const router = useRouter();
  const [adminPw, setAdminPw] = useState("");
  const [pipeline, setPipeline] = useState<PipelineData>({ estimates: [], quotes: [], activeJobs: [], completedJobs: [] });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? safeGetLocalStorage("pcc_admin_pw") : null;
    if (saved) setAdminPw(saved); else router.replace("/admin/signin?returnTo=/admin/completed-jobs");
  }, [router]);

  useEffect(() => { if (adminPw) loadPipeline(); }, [adminPw]);

  async function loadPipeline() {
    const r = await fetch("/api/admin/pipeline", { headers: { "x-admin-password": adminPw } });
    const j = await r.json();
    if (!r.ok) return setError(j?.error || "Failed to load completed jobs");
    setPipeline(j.pipeline); setError(null);
  }

  function signOut() {
    try { window.localStorage.removeItem("pcc_admin_pw"); } catch {}
    router.replace("/admin/signin?returnTo=/admin/completed-jobs");
  }

  return <>
    <Head><title>Admin · Completed Jobs</title></Head>
    <AdminPageShell active="completedJobs" title="Completed Jobs" subtitle="Keep finished jobs out of the live dropdowns but still searchable for history and pricing review." onSignOut={signOut}>
      {error && <div className="subtle" style={{ marginBottom: 12, color: "#b91c1c" }}>{error}</div>}
      <div className="project-grid-wrap">
        <table className="project-grid-table">
          <thead><tr><th>Job #</th><th>Project</th><th>Client</th><th>Completed</th><th>Final Value</th></tr></thead>
          <tbody>
            {pipeline.completedJobs.length === 0 && <tr><td colSpan={5} className="subtle" style={{ padding: 16 }}>No completed jobs yet.</td></tr>}
            {pipeline.completedJobs.map((job) => (
              <tr key={job.id}>
                <td>{job.jobNumber}</td>
                <td>{job.projectName}</td>
                <td>{job.clientName}</td>
                <td>{new Date(job.completedAt).toLocaleDateString("en-CA")}</td>
                <td>{asMoney(job.contractValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminPageShell>
  </>;
}
