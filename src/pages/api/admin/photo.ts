import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = requireAdmin(req);
  if (err) return res.status(401).send(err);
  const path = req.query.path;  if (!path || typeof path !== "string") return res.status(400).send("Missing path");

  const { data, error } = await supabaseServer.storage.from("slips").download(path);
  if (error || !data) return res.status(404).send("Not found");

  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Try guess by extension
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
