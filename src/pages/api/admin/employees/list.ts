import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // NOTE:
  // Some deployments started with a minimal `employees` table (id/name/pin/active/created_at)
  // and later added optional fields (phone/address/etc.). Selecting non-existent columns
  // causes Supabase to throw, which makes the UI look like it "can't read the table".
  // Using `select("*")` keeps this endpoint compatible with both schemas.
  const { data, error } = await supabaseServer
    .from("employees")
    .select("*")
    .order("name", { ascending: true });

  if (error) return res.status(500).json({ error: "Failed to load employees" });

  return res.status(200).json({ employees: data || [] });
}
