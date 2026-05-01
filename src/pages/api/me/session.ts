import type { NextApiRequest, NextApiResponse } from "next";
import { parseCookies, verifySession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabaseServer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.pcc_session;
  const session = verifySession(token);
  if (!session) return res.status(200).json({ loggedIn: false });

  const empId = Number(session.employee_id);
  if (!Number.isFinite(empId)) return res.status(200).json({ loggedIn: false });

  const { data } = await supabaseServer.from("employees").select("*").eq("id", empId).maybeSingle();
  const employee = data || { id: session.employee_id, name: session.employee_name, timesheet_type: "standard" };

  return res.status(200).json({
    loggedIn: true,
    employee: { id: String(employee.id), name: employee.name, timesheet_type: employee.timesheet_type || "standard" },
  });
}
