import type { NextApiRequest, NextApiResponse } from "next";
import { parseCookies, verifySession } from "@/lib/session";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.pcc_session;
  const session = verifySession(token);
  if (!session) return res.status(200).json({ loggedIn: false });
  return res.status(200).json({
    loggedIn: true,
    employee: { id: session.employee_id, name: session.employee_name },
  });
}
