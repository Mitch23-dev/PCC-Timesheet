import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { data, error } = await supabaseServer
    .from("employees")
    .select("id, name, pin, active, phone, address, city, province, postal_code, emergency_contact_name, emergency_contact_phone, notes, created_at")
    .order("name", { ascending: true });

  if (error) return res.status(500).json({ error: "Failed to load employees" });

  return res.status(200).json({ employees: data || [] });
}
