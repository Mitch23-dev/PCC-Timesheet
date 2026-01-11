import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/adminAuth";

function normalizePin(pin: string) {
  return String(pin).trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { id, name, pin, phone, address, city, province, postal_code, emergency_contact_name, emergency_contact_phone, notes } = req.body || {};
  const empId = typeof id === "number" ? id : Number(id);
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanPin = typeof pin === "string" || typeof pin === "number" ? normalizePin(String(pin)) : "";

  if (!empId || Number.isNaN(empId)) return res.status(400).json({ error: "Missing employee id" });
  if (!cleanName) return res.status(400).json({ error: "Employee name is required" });
  if (!/^[0-9]{4}$/.test(cleanPin)) return res.status(400).json({ error: "PIN must be 4 digits" });

  const { data, error } = await supabaseServer
    .from("employees")
    .update({ name: cleanName, pin: cleanPin, updated_at: new Date().toISOString() })
    .eq("id", empId)
    .select("id, name, pin, active, created_at, updated_at")
    .maybeSingle();

  if (error) {
    const msg = String((error as any).message || "");
    if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
      return res.status(409).json({ error: "Name or PIN already exists" });
    }
    return res.status(500).json({ error: "Failed to update employee" });
  }

  return res.status(200).json({ employee: data });
}
