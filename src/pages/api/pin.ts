import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { signSession, sessionCookieOptions } from "@/lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Be permissive here to avoid "nothing happens" failures caused by method quirks
  // (e.g., accidental GET navigation, proxies, or preflight OPTIONS).
  if (req.method === "OPTIONS") return res.status(200).end();

  const pin =
    req.method === "GET"
      ? (req.query?.pin as string | string[] | undefined)
      : (req.body?.pin as unknown);

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Accept string/number, normalize to 4-digit string
  const cleanPin =
    typeof pin === "string" || typeof pin === "number"
      ? String(pin).trim()
      : Array.isArray(pin)
        ? String(pin[0] ?? "").trim()
        : "";
  if (!/^[0-9]{4}$/.test(cleanPin)) return res.status(400).json({ error: "Missing PIN" });

  // Employee PIN login
  const { data: emp, error: empErr } = await supabaseServer
    .from("employees")
    .select("id, name, active")
    .eq("pin", cleanPin)
    .limit(1)
    .maybeSingle();

  if (empErr) return res.status(500).json({ error: "PIN lookup failed" });
  if (!emp || emp.active === false) return res.status(401).json({ error: "Incorrect PIN" });

  const token = signSession({ employee_id: String(emp.id), employee_name: emp.name });
  // 30 days
  res.setHeader(
    "Set-Cookie",
    `pcc_session=${encodeURIComponent(token)}; ${sessionCookieOptions(30 * 24 * 60 * 60)}`
  );

  return res.status(200).json({ ok: true, employee: { id: emp.id, name: emp.name } });
}
