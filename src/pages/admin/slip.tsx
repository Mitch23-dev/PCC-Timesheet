import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

export default function SlipViewer() {
  const router = useRouter();
  const { path, employee, job, date } = router.query;

  const [rot, setRot] = useState(0);
  const [src, setSrc] = useState<string>("");
  const [isPdf, setIsPdf] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const header = useMemo(() => {
    const e = typeof employee === "string" ? employee : "";
    const j = typeof job === "string" ? job : "";
    const d = typeof date === "string" ? date : "";
    return [e, j, d].filter(Boolean).join(" — ");
  }, [employee, job, date]);

  useEffect(() => {
    const p = typeof path === "string" ? path : "";
    if (!p) return;

    let cancelled = false;
    (async () => {
      try {
        setErr(null);
        const pw = localStorage.getItem("pcc_admin_pw") || "";
        if (!pw) {
          setErr("Not signed in. Please sign in at /admin/signin first.");
          return;
        }
        const res = await fetch(`/api/admin/photo?path=${encodeURIComponent(p)}`, {
          headers: { "x-admin-password": pw },
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || "Failed to load slip");
        }
        const blob = await res.blob();
        const pdf = blob.type === "application/pdf" || String(p).toLowerCase().endsWith(".pdf");
        if (!cancelled) setIsPdf(pdf);
        const url = URL.createObjectURL(blob);
        if (!cancelled) setSrc(url);
        return () => URL.revokeObjectURL(url);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load slip");
      }
    })();

    return () => { cancelled = true; };
  }, [path]);

  if (!path) {
    return <main style={{ padding: 16 }}>Missing slip link.</main>;
  }

  return (
    <main style={{ padding: 12 }}>
      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Slip Viewer</div>
        {header ? <div className="muted">{header}</div> : null}

        <div className="row" style={{ alignItems: "center", marginTop: 10 }}>
          <button onClick={() => setRot((r) => (r - 90 + 360) % 360)} style={{ padding: "8px 10px", fontWeight: 800 }}>
            Rotate Left
          </button>
          <button onClick={() => setRot((r) => (r + 90) % 360)} style={{ padding: "8px 10px", fontWeight: 800 }}>
            Rotate Right
          </button>
          <button onClick={() => window.print()} style={{ padding: "8px 10px", fontWeight: 900 }}>
            Print
          </button>
        </div>
      </div>

      {err && <div className="bad" style={{ marginBottom: 10 }}>{err}</div>}

      <div className="slipWrap" style={{ background: "#fff", padding: 12, borderRadius: 12 }}>
        {src ? (
          isPdf ? (
            <iframe
              src={src}
              title="Slip PDF"
              style={{ width: "100%", height: "80vh", border: "0" }}
            />
          ) : (
            <img
              src={src}
              alt="Slip"
              style={{
                maxWidth: "100%",
                transform: `rotate(${rot}deg)`,
                transformOrigin: "center center",
                display: "block",
                margin: "0 auto",
              }}
            />
          )
        ) : (
          <div className="muted">Loading...</div>
        )}
      </div>

      <style jsx global>{`
        /* Print styling: remove on-screen chrome and maximize slip on a single page */
        @page { size: letter; margin: 0.25in; }

        @media print {
          html, body { margin: 0 !important; padding: 0 !important; }
          main { padding: 0 !important; }

          /* Hide UI controls */
          .card, button, .topbar { display: none !important; }

          /* Remove wrapper padding so the image starts at the top */
          .slipWrap {
            padding: 0 !important;
            margin: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
          }

          img {
            display: block !important;
            width: 100% !important;
            height: auto !important;
            max-height: 10.5in !important; /* 11in letter height minus 0.25in top/bottom */
            object-fit: contain;
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>
    </main>
  );
}
