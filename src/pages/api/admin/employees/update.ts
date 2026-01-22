import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/adminAuth";

function normalizePin(pin: string) {
  return String(pin).trim();
}

function asTrimmedString(v: any): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).json({ error: err });

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body || {};

  const empId = typeof body.id === "number" ? body.id : Number(body.id);
  if (!empId || Number.isNaN(empId)) return res.status(400).json({ error: "Missing employee id" });

  const cleanName = asTrimmedString(body.name);
  const cleanPinRaw = body.pin === undefined || body.pin === null ? null : normalizePin(String(body.pin));

  // Build payload dynamically so this remains compatible with older/newer schemas.
  const payload: Record<string, any> = {};

  if (cleanName !== null) payload.name = cleanName;
  if (cleanPinRaw !== null) {
    if (!/^[0-9]{4}$/.test(cleanPinRaw)) return res.status(400).json({ error: "PIN must be 4 digits" });
    payload.pin = cleanPinRaw;
  }

  const firstName = asTrimmedString(body.first_name);
  const lastName = asTrimmedString(body.last_name);
  const email = asTrimmedString(body.email);
  const phone = asTrimmedString(body.phone);
  const address = asTrimmedString(body.address);
  const city = asTrimmedString(body.city);
  const province = asTrimmedString(body.province);
  const postal = asTrimmedString(body.postal_code);
  const position = asTrimmedString(body.position);
  const employmentType = asTrimmedString(body.employment_type);
  const startDate = asTrimmedString(body.start_date);
  const endDate = asTrimmedString(body.end_date);
  const emergName = asTrimmedString(body.emergency_contact_name);
  const emergPhone = asTrimmedString(body.emergency_contact_phone);
  const notes = asTrimmedString(body.notes);

  if (firstName !== null) payload.first_name = firstName;
  if (lastName !== null) payload.last_name = lastName;
  if (email !== null) payload.email = email;
  if (phone !== null) payload.phone = phone;
  if (address !== null) payload.address = address;
  if (city !== null) payload.city = city;
  if (province !== null) payload.province = province;
  if (postal !== null) payload.postal_code = postal;
  if (position !== null) payload.position = position;
  if (employmentType !== null) payload.employment_type = employmentType;
  if (startDate !== null) payload.start_date = startDate;
  if (endDate !== null) payload.end_date = endDate;
  if (emergName !== null) payload.emergency_contact_name = emergName;
  if (emergPhone !== null) payload.emergency_contact_phone = emergPhone;
  if (notes !== null) payload.notes = notes;

  if (body.hourly_rate !== undefined) {
    if (body.hourly_rate === null || String(body.hourly_rate).trim() === "") {
      payload.hourly_rate = null;
    } else {
      const n = Number(body.hourly_rate);
      if (Number.isNaN(n)) return res.status(400).json({ error: "hourly_rate must be a number" });
      payload.hourly_rate = n;
    }
  }

  if (body.active !== undefined) {
    payload.active = Boolean(body.active);
  }

  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  const { data, error } = await supabaseServer.from("employees").update(payload).eq("id", empId).select("*").maybeSingle();

  if (error) {
    const msg = String((error as any).message || "");
    if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
      return res.status(409).json({ error: "Name or PIN already exists" });
    }
    return res.status(500).json({ error: "Failed to update employee" });
  }

  return res.status(200).json({ employee: data });
}
