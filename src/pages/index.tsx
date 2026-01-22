import React, { useMemo, useState } from "react";
import Link from "next/link";
import {ATTACHMENTS, DUMP_TRUCK_ATTACHMENTS, EMPLOYEES, EQUIPMENT, EXCAVATORS, JOB_TYPES, MATERIALS, SKID_STEER_ATTACHMENTS} from "@/lib/constants";
import EmployeeTabs from "@/components/EmployeeTabs";
import ScrollableDropdown from "@/components/ScrollableDropdown";

// Auto-grow for mobile note fields (wrap + expand). Keeps styling unchanged.
function autoGrowTextarea(el: HTMLTextAreaElement) {
  // Robust auto-grow: avoids descender clipping and mobile multi-line clipping.
  const apply = () => {
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + border}px`;
  };
  apply();
  // Mobile browsers sometimes update scrollHeight after layout; run again next frame.
  requestAnimationFrame(apply);
}




// NOTE: We intentionally do NOT import `heic2any` at the module level.
// `heic2any` references `window`, which crashes Next.js during SSR/build.

type EquipRow = {
  equipment: string;
  attachment: string; // None/Breaker/Chipper
  hours: string;
  notes: string;
  truckingHours: string;
  truckingNotes: string;
};

type MaterialRow = {
  material: string;
  otherMaterial: string;
  loads: string;
  notes: string;
};

export default function Home() {
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const [sessionEmployee, setSessionEmployee] = useState<{ id: string; name: string } | null>(null);

  const [employee, setEmployee] = useState<(typeof EMPLOYEES)[number]>("Darren"); // legacy fallback
  const [employeeOther, setEmployeeOther] = useState("");
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [jobType, setJobType] = useState<(typeof JOB_TYPES)[number]>("Commercial");
  const [jobText, setJobText] = useState("");
  const [totalHours, setTotalHours] = useState("");
  const [headerNotes, setHeaderNotes] = useState("");

  const [equipRows, setEquipRows] = useState<EquipRow[]>([
    { equipment: "", attachment: "", hours: "", notes: "", truckingHours: "", truckingNotes: "" },
  ]);

  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([
    { material: "", otherMaterial: "", loads: "", notes: "" },
  ]);

  const [photos, setPhotos] = useState<FileList | null>(null);

  const employeeFinal = useMemo(() => {
    if (sessionEmployee) return sessionEmployee.name;
    if (employee !== "Other") return employee;
    return employeeOther.trim() || "Other";
  }, [employee, employeeOther, sessionEmployee]);

  React.useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/me/session");
        const j = await r.json();
        if (j?.loggedIn && j?.employee?.name) {
          setSessionEmployee(j.employee);
          setUnlocked(true);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  async function handleUnlock() {
    setPinError(null);
    try {
      const res = await fetch("/api/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      // Some failures (misconfigured env / server error) can return HTML instead of JSON.
      // Don’t fail silently—show a useful message.
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        if (!res.ok) {
          return setPinError(`PIN failed (HTTP ${res.status}). Check Vercel env vars and Supabase connection.`);
        }
      }

      if (!res.ok) return setPinError(data?.error || "PIN failed");
      if (data?.employee?.id && data?.employee?.name) setSessionEmployee(data.employee);
      setUnlocked(true);
    } catch {
      return setPinError("PIN failed (network error). Please refresh and try again.");
    }
  }

  async function logout() {
    try {
      await fetch("/api/me/logout", { method: "POST" });
    } catch {
      // ignore
    }
    setSessionEmployee(null);
    setUnlocked(false);
    setPin("");
  }

  function addEquipRow() {
    setEquipRows((r) => [
      ...r,
      { equipment: "", attachment: "", hours: "", notes: "", truckingHours: "", truckingNotes: "" },
    ]);
  }

  function addMaterialRow() {
    setMaterialRows((r) => [
      ...r,
      { material: "", otherMaterial: "", loads: "", notes: "" },
    ]);
  }

  async function handleSubmit() {
    if (!jobText.trim()) return alert("Please enter Job Number / Customer / Location.");
    if (!totalHours.trim()) return alert("Please enter Total Hours.");
    const th = Number(totalHours);
    if (Number.isNaN(th) || th <= 0) return alert("Total Hours must be a number greater than 0.");

    // --- Photo handling ---
    // Vercel/Serverless requests can fail with large multipart payloads.
    // We (1) compress images client-side where possible and (2) enforce a safe size cap.
    async function compressImage(file: File): Promise<File> {
      try {
        // Only attempt compression for standard raster images browsers can decode.
        if (!file.type.startsWith("image/")) return file;
        if (file.type === "image/svg+xml") return file;

        // Some iPhone uploads can be HEIC/HEIF; many browsers cannot decode them via canvas.
// Convert HEIC/HEIF -> JPEG in-browser so uploads "just work".
        const lower = (file.name || "").toLowerCase();
        const isHeic =
          /heic|heif/i.test(file.type || "") || lower.endsWith(".heic") || lower.endsWith(".heif");
        if (isHeic) {
          try {
            // Load heic2any only in the browser (it depends on `window`).
            if (typeof window === "undefined") return file;
            const { default: heic2any } = await import("heic2any");
            const convertedBlob = (await heic2any({
              blob: file,
              toType: "image/jpeg",
              quality: 0.85,
            })) as Blob;
            const newName = (file.name || "photo").replace(/\.(heic|heif)$/i, "") + ".jpg";
            file = new File([convertedBlob], newName, { type: "image/jpeg" });
          } catch {
            // If conversion fails (rare), fall back to original and let the size checks below handle it.
            return file;
          }
        }

        const bmp = await createImageBitmap(file);
        const maxDim = 1600; // keep readable while shrinking size
        let { width, height } = bmp;
        const scale = Math.min(1, maxDim / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return file;
        ctx.drawImage(bmp, 0, 0, width, height);

        const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.75));
        if (!blob) return file;
        const newName = (file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg";
        return new File([blob], newName, { type: "image/jpeg" });
      } catch {
        return file;
      }
    }

    const formData = new FormData();
    // If logged in, employee is derived server-side from the session cookie.
    // If not logged in, we fall back to the legacy shared PIN + employee name.
    if (!sessionEmployee) {
      formData.append("pin", pin);
      formData.append("employee", employeeFinal);
    }
    formData.append("workDate", workDate);
    formData.append("jobType", jobType);
    formData.append("jobText", jobText);
    formData.append("totalHours", totalHours);
    formData.append("headerNotes", headerNotes);

    formData.append("equipRows", JSON.stringify(equipRows));
    formData.append("materialRows", JSON.stringify(materialRows));

    if (photos && photos.length) {
      // Hard cap (safe for typical serverless limits). If you're on a paid tier, you can raise this.
      const MAX_TOTAL_BYTES = 4 * 1024 * 1024; // 4 MB
      const MAX_FILE_BYTES = 3.5 * 1024 * 1024; // 3.5 MB per photo

      const rawFiles = Array.from(photos);
      // Quick check before compress (helps give immediate feedback)
      const rawTotal = rawFiles.reduce((s, f) => s + (f.size || 0), 0);
      if (rawTotal > 20 * 1024 * 1024) {
        return alert("Photo(s) are very large. Please select fewer photos or use smaller images (screenshots work great)." );
      }

      const compressed: File[] = [];
      for (const f of rawFiles) compressed.push(await compressImage(f));

      const total = compressed.reduce((s, f) => s + (f.size || 0), 0);
      const tooBigOne = compressed.find((f) => (f.size || 0) > MAX_FILE_BYTES);
      if (tooBigOne) {
        return alert(`One of the photos is still too large after compression (${Math.round((tooBigOne.size || 0) / 1024 / 1024 * 10) / 10} MB). Please pick a smaller image or take a screenshot.`);
      }
      if (total > MAX_TOTAL_BYTES) {
        return alert(`Photos are too large to submit reliably (${Math.round(total / 1024 / 1024 * 10) / 10} MB total). Please submit fewer photos or smaller images.`);
      }

      compressed.forEach((file) => formData.append("photos", file));
    }

    let res: Response;
    try {
      res = await fetch("/api/submit", { method: "POST", body: formData });
    } catch {
      return alert("Submit failed (network error). Please try again.");
    }

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      // If the server returns HTML (e.g., 413 Payload Too Large), avoid crashing silently.
      if (!res.ok) return alert(`Submit failed (HTTP ${res.status}). This is usually caused by photo size. Try fewer/smaller photos.`);
    }
    if (!res.ok) return alert(data?.error || `Submit failed (HTTP ${res.status}).`);

    alert("Submitted. Thank you!");
    setJobText("");
    setTotalHours("");
    setHeaderNotes("");
    setEquipRows([{ equipment: "", attachment: "", hours: "", notes: "", truckingHours: "", truckingNotes: "" }]);
    setMaterialRows([{ material: "", otherMaterial: "", loads: "", notes: "" }]);
    setPhotos(null);
  }

  if (!unlocked) {
    return (
      <main className="page">
        <div className="topbar">
          <Link className="btn btn-ghost" href="/admin/signin">
            Admin
          </Link>
        </div>

        <section className="card card-lg">
          <div className="stack">
            <div className="page-header">
<div>
                <h1 className="h1">PCC Timesheet</h1>
                <p className="subtle">Enter PIN to continue.</p>
              </div>
            </div>

            <label className="field">
              <span className="label">PIN</span>
              <input
                className="input input-pin"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUnlock();
                }}
                placeholder="••••"
              />
            </label>

            {pinError && <div className="alert alert-bad">{pinError}</div>}

            <button className="btn btn-primary" onClick={handleUnlock}>
              Continue
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page timesheet-page">
      <div className="topbar">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link className="btn btn-ghost" href="/admin/signin">Admin</Link>
        </div>

        {sessionEmployee && (
          <button className="btn btn-ghost" onClick={logout}>
            Sign out
          </button>
        )}
      </div>

      <div className="page-header" style={{ marginBottom: 10 }}>
<h1 className="h1" style={{ margin: 0 }}>Timesheet</h1>
      </div>

      <div className="tabcard" style={{ marginBottom: 14 }}>
        <EmployeeTabs active="entry" />
        <section className="card tabcard-body">
        <div className="ts-grid">
          <label>
            <div className="ts-label">Employee</div>
            {sessionEmployee ? (
              <input className="input" value={sessionEmployee.name} readOnly />
            ) : (
              <ScrollableDropdown
                value={employee}
                options={EMPLOYEES}
                onChange={(next) => setEmployee(next as any)}
              />
            )}
          </label>

          <label>
            <div className="ts-label">Date</div>
            <input className="input" type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
          </label>

          {!sessionEmployee && employee === "Other" && (
            <label style={{ gridColumn: "1 / -1" }}>
              <div className="ts-label">Employee Name</div>
              <input className="input" value={employeeOther} onChange={(e) => setEmployeeOther(e.target.value)} />
            </label>
          )}

          <label>
            <div className="ts-label">Job Type</div>
            <ScrollableDropdown
              value={jobType}
              options={JOB_TYPES}
              onChange={(next) => setJobType(next as any)}
            />
          </label>

          <label>
            <div className="ts-label">Total Hours (required)</div>
            <input className="input" inputMode="decimal" value={totalHours} onChange={(e) => setTotalHours(e.target.value)} placeholder="e.g. 8 or 10.5" />
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            <div className="ts-label">Job Number / Customer / Location (required)</div>
            <input className="input" value={jobText} onChange={(e) => setJobText(e.target.value)} />
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            <div className="ts-label">Notes (optional)</div>
            <textarea ref={(el) => { if (el) autoGrowTextarea(el); }} rows={1} className="input" value={ headerNotes } onChange={ (e) => setHeaderNotes(e.target.value) }  onInput={(e) => autoGrowTextarea(e.currentTarget)} onFocus={(e) => autoGrowTextarea(e.currentTarget)} style={{width: "100%", resize: "none", overflow: "hidden", boxSizing: "border-box"}}></textarea>
          </label>
	        </div>
	        </section>
      </div>

      <section className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Equipment</h2>
          <button className="btn btn-primary" onClick={addEquipRow}>+ Add Equipment</button>
        </div>

        {equipRows.map((row, idx) => {
          const isExcavator = EXCAVATORS.has(row.equipment);
          const isDumpTruck = row.equipment === "Dump Truck";
          const isSkidSteer = row.equipment === "Kubota Skid Steer" || row.equipment === "John Deere Skid Steer";

          return (
            <div key={idx} style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee" }}>
              <div className="equip-grid">
                <label>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Equipment</div>
                  <ScrollableDropdown
                    value={row.equipment || ""}
                    options={EQUIPMENT}
                    placeholder="Select equipment"
                    onChange={(equipment) => {
                      setEquipRows((prev) => {
                        const copy = [...prev];
                        // Keep blank until the user selects something.
                        if (!equipment) {
                          copy[idx] = {
                            ...copy[idx],
                            equipment: "",
                            attachment: "",
                            hours: "",
                            notes: "",
                            truckingHours: "",
                            truckingNotes: "",
                          };
                          return copy;
                        }

                        copy[idx] = { ...copy[idx], equipment };
                        const isSkid = equipment === "Kubota Skid Steer" || equipment === "John Deere Skid Steer";

                        // Default attachment when equipment requires it.
                        if ((EXCAVATORS.has(equipment) || equipment === "Dump Truck" || isSkid) && !copy[idx].attachment) {
                          copy[idx].attachment = "None";
                        }
                        // Clear attachment for equipment that doesn't use it.
                        if (!EXCAVATORS.has(equipment) && equipment !== "Dump Truck" && !isSkid) {
                          copy[idx].attachment = "None";
                        }

                        return copy;
                      });
                    }}
                  />
                </label>

                {(isExcavator || isDumpTruck || isSkidSteer) ? (
                  <label>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Attachment</div>
                    <ScrollableDropdown
                      value={row.attachment || "None"}
                      options={(isDumpTruck ? DUMP_TRUCK_ATTACHMENTS : isSkidSteer ? SKID_STEER_ATTACHMENTS : ATTACHMENTS)}
                      onChange={(next) =>
                        setEquipRows((prev) => {
                          const copy = [...prev];
                          copy[idx] = { ...copy[idx], attachment: next };
                          return copy;
                        })
                      }
                    />
                  </label>
                ) : <div />}

                {!isDumpTruck ? (
                  <label className="equip-hours">
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Hours</div>
                    <input
                      className="input"
                      inputMode="decimal"
                      value={row.hours}
                      onChange={(e) =>
                        setEquipRows((prev) => {
                          const copy = [...prev];
                          copy[idx] = { ...copy[idx], hours: e.target.value };
                          return copy;
                        })
                      }
                    />
                  </label>
                ) : (
                  <label className="equip-hours">
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Trucking Hours</div>
                    <input
                      className="input"
                      inputMode="decimal"
                      value={row.truckingHours}
                      onChange={(e) =>
                        setEquipRows((prev) => {
                          const copy = [...prev];
                          copy[idx] = { ...copy[idx], truckingHours: e.target.value };
                          return copy;
                        })
                      }
                    />
                  </label>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10, marginTop: 10 }}>
                <label>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{isDumpTruck ? "Trucking Notes" : "Notes (optional)"}</div>
                  <textarea ref={(el) => { if (el) autoGrowTextarea(el); }} rows={1} className="input"
                    value={ isDumpTruck ? row.truckingNotes : row.notes }
                    onChange={ (e) => setEquipRows((prev) => {
                      const copy = [...prev];
                      if (isDumpTruck) copy[idx] = { ...copy[idx], truckingNotes: e.target.value  };
                      else copy[idx] = { ...copy[idx], notes: e.target.value };
                      return copy;
                    })}
                    style={{width: "100%", resize: "none", overflow: "hidden", boxSizing: "border-box"}}
                   onInput={(e) => autoGrowTextarea(e.currentTarget)} onFocus={(e) => autoGrowTextarea(e.currentTarget)}></textarea>
                </label>

                <button
                  className="btn"
                  onClick={() => setEquipRows((prev) => prev.filter((_, i) => i !== idx))}
                  style={{ marginTop: 24 }}
                  disabled={equipRows.length === 1}
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Materials (Loads)</h2>
          <button className="btn btn-primary" onClick={addMaterialRow}>+ Add Material</button>
        </div>

        {materialRows.map((row, idx) => {
          const isOther = row.material === "Other";
          return (
            <div key={idx} style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee" }}>
              <div className="material-grid">
                <label>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Material</div>
                  <ScrollableDropdown
                    value={row.material || ""}
                    options={MATERIALS}
                    placeholder="Select material"
                    onChange={(material) =>
                      setMaterialRows((prev) => {
                        const copy = [...prev];
                        copy[idx] = { ...copy[idx], material, otherMaterial: material ? copy[idx].otherMaterial : "" };
                        return copy;
                      })
                    }
                  />
                </label>

                <label className="material-loads">
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Loads</div>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={row.loads}
                    onChange={(e) => setMaterialRows((prev) => {
                      const copy = [...prev];
                      copy[idx] = { ...copy[idx], loads: e.target.value };
                      return copy;
                    })}
                  />
                </label>
              </div>

              {isOther && (
                <label style={{ display: "block", marginTop: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Other Material</div>
                  <input
                    className="input"
                    value={row.otherMaterial}
                    onChange={(e) => setMaterialRows((prev) => {
                      const copy = [...prev];
                      copy[idx] = { ...copy[idx], otherMaterial: e.target.value };
                      return copy;
                    })}
                  />
                </label>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10, marginTop: 10 }}>
                <label>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Notes (optional)</div>
                  <textarea ref={(el) => { if (el) autoGrowTextarea(el); }} rows={1} className="input"
                    value={ row.notes }
                    onChange={ (e) => setMaterialRows((prev) => {
                      const copy = [...prev];
                      copy[idx] = { ...copy[idx], notes: e.target.value  };
                      return copy;
                    })}
                   onInput={(e) => autoGrowTextarea(e.currentTarget)} onFocus={(e) => autoGrowTextarea(e.currentTarget)} style={{width: "100%", resize: "none", overflow: "hidden", boxSizing: "border-box"}}></textarea>
                </label>

                <button
                  className="btn"
                  onClick={() => setMaterialRows((prev) => prev.filter((_, i) => i !== idx))}
                  style={{ marginTop: 24 }}
                  disabled={materialRows.length === 1}
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: "0 0 10px 0", fontSize: 18 }}>Slip Photos (optional)</h2>
        <div className="muted" style={{ marginBottom: 8 }}>
          Tip: On phones you can choose Camera or Photo Library.
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <label className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
            + Add Slip Photos
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setPhotos(e.target.files)}
              style={{ display: "none" }}
            />
          </label>
          {photos?.length ? <div style={{ marginTop: 4 }} className="muted">{photos.length} photo(s) selected</div> : <div className="muted" style={{ marginTop: 4 }}>No files selected</div>}
        </div>
      </section>

      <button
        onClick={handleSubmit}
        className="submit-btn"
        style={{ width: "100%", padding: 20, fontSize: 19, fontWeight: 900, backgroundColor: "#16a34a", borderColor: "#16a34a", color: "#ffffff" }}
      >
        Submit
      </button>

      <div style={{ marginTop: 14 }} className="muted">
        Admin: <a href="/admin">/admin</a>
      </div>
    </main>
  );
}