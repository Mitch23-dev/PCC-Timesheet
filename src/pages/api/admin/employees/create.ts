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

  const {
    name,
    pin,
    // optional fields
    first_name,
    last_name,
    email,
    phone,
    address,
    city,
    province,
    postal_code,
    position,
    employment_type,
    hourly_rate,
    start_date,
    end_date,
    emergency_contact_name,
    emergency_contact_phone,
    notes,
  } = req.body || {};
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanPin = typeof pin === "string" || typeof pin === "number" ? normalizePin(String(pin)) : "";

  if (!cleanName) return res.status(400).json({ error: "Employee name is required" });
  if (!/^[0-9]{4}$/.test(cleanPin)) return res.status(400).json({ error: "PIN must be 4 digits" });

  const payload: Record<string, any> = {
    name: cleanName,
    pin: cleanPin,
    active: true,
  };

  // Only include optional fields when a value is provided.
  // This keeps the endpoint compatible with older schemas.
  if (typeof first_name === "string" && first_name.trim()) payload.first_name = first_name.trim();
  if (typeof last_name === "string" && last_name.trim()) payload.last_name = last_name.trim();
  if (typeof email === "string" && email.trim()) payload.email = email.trim();
  if (typeof phone === "string" && phone.trim()) payload.phone = phone.trim();
  if (typeof address === "string" && address.trim()) payload.address = address.trim();
  if (typeof city === "string" && city.trim()) payload.city = city.trim();
  if (typeof province === "string" && province.trim()) payload.province = province.trim();
  if (typeof postal_code === "string" && postal_code.trim()) payload.postal_code = postal_code.trim();
  if (typeof position === "string" && position.trim()) payload.position = position.trim();
  if (typeof employment_type === "string" && employment_type.trim()) payload.employment_type = employment_type.trim();
  if (hourly_rate !== undefined && hourly_rate !== null && String(hourly_rate).trim() !== "") {
    const n = Number(hourly_rate);
    if (!Number.isNaN(n)) payload.hourly_rate = n;
  }
  if (typeof start_date === "string" && start_date.trim()) payload.start_date = start_date.trim();
  if (typeof end_date === "string" && end_date.trim()) payload.end_date = end_date.trim();
  if (typeof emergency_contact_name === "string" && emergency_contact_name.trim()) payload.emergency_contact_name = emergency_contact_name.trim();
  if (typeof emergency_contact_phone === "string" && emergency_contact_phone.trim()) payload.emergency_contact_phone = emergency_contact_phone.trim();
  if (typeof notes === "string" && notes.trim()) payload.notes = notes.trim();

  // Create employee
  const { data, error } = await supabaseServer.from("employees").insert(payload).select("*").maybeSingle();

  if (error) {
    const rawMsg = String((error as any).message || "");

    // Common case: the database hasn't been migrated to include one (or more)
    // optional employee fields. When that happens, Postgres returns:
    //   "column <x> of relation employees does not exist"
    // Instead of a generic failure, return a helpful message.
    if (rawMsg.toLowerCase().includes("does not exist") && rawMsg.toLowerCase().includes("column") && rawMsg.toLowerCase().includes("employees")) {
      return res.status(400).json({
        error:
          "Employee fields are not enabled in the database yet (missing employee columns). Run the latest employees migration (v17) in Supabase, then try again.",
        detail: rawMsg,
      });
    }

    // Provide friendlier messages for unique constraint violations
    const msg = rawMsg;
    if (msg.toLowerCase().includes("employees_name_key") || msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
      // Try to return the existing employee to make it obvious what's happening
      const pinLookup = await supabaseServer.from("employees").select("*").eq("pin", cleanPin).maybeSingle();

      if (pinLookup.data) {
        return res.status(409).json({ error: "Name or PIN already exists", existing: pinLookup.data });
      }

      const nameLookup = await supabaseServer.from("employees").select("*").ilike("name", cleanName).maybeSingle();

      if (nameLookup.data) {
        return res.status(409).json({ error: "Name or PIN already exists", existing: nameLookup.data });
      }

      return res.status(409).json({ error: "Name or PIN already exists" });
    }
    // Fall back to returning the raw error to make debugging possible.
    return res.status(500).json({ error: "Failed to create employee", detail: rawMsg });
  }

  return res.status(200).json({ employee: data });
}
