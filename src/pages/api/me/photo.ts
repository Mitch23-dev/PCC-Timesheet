import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { parseCookies, verifySession } from "@/lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verifySession(cookies.pcc_session);
  if (!session) return res.status(401).send("Unauthorized");

  const path = req.query.path;
  if (!path || typeof path !== "string") return res.status(400).send("Missing path");

  // Ensure the photo belongs to a timesheet owned by this employee
  const { data: pe, error: peErr } = await supabaseServer
    .from("photo_entries")
    .select("timesheet_id")
    .eq("path", path)
    .limit(1)
    .maybeSingle();

  if (peErr || !pe) return res.status(404).send("Not found");

  const { data: ts, error: tsErr } = await supabaseServer
    .from("timesheets")
    .select("employee_id")
    .eq("id", pe.timesheet_id)
    .single();

  if (tsErr || !ts || ts.employee_id !== session.employee_id) return res.status(403).send("Forbidden");

  const { data, error } = await supabaseServer.storage.from("slips").download(path);
  if (error || !data) return res.status(404).send("Not found");

  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const lower = path.toLowerCase();
  const ct =
    lower.endsWith(".png") ? "image/png" :
    lower.endsWith(".webp") ? "image/webp" :
    lower.endsWith(".pdf") ? "application/pdf" :
    "image/jpeg";

  res.setHeader("Content-Type", ct);
  res.setHeader("Cache-Control", "private, max-age=300");
  return res.status(200).send(buffer);
}
