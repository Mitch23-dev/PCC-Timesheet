import type { NextApiRequest } from "next";

export function requireAdmin(req: NextApiRequest): string | null {
  const raw = req.headers["x-admin-password"];
  const pw = Array.isArray(raw) ? raw[0] : raw;

  const allowed = [process.env.ADMIN_PASSWORD, process.env.ADMIN_LINK_TOKEN].filter(Boolean) as string[];
  if (!pw) return "Unauthorized";
  if (allowed.length === 0) return "Server not configured (missing ADMIN_PASSWORD / ADMIN_LINK_TOKEN)";
  if (!allowed.includes(pw)) return "Unauthorized";
  return null;
}
