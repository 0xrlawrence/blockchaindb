import { NextRequest, NextResponse } from "next/server";
import { persistEnv } from "@/lib/env";
import {
  attachSession,
  clearSession,
  dashboardPasswordSet,
  isDashboardAuthed,
  requireSameOrigin,
  verifyDashboardPassword,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/auth — site-access state, used by the dashboard's onboarding
 *  auto-detection and lock screen. */
export async function GET(req: NextRequest) {
  const blocked = requireSameOrigin(req);
  if (blocked) return blocked;
  return NextResponse.json({
    passwordSet: dashboardPasswordSet(),
    authed: isDashboardAuthed(req),
  });
}

/**
 * POST /api/auth
 *   { "action": "setup",  "password": "…" }  create/change the password
 *   { "action": "login",  "password": "…" }  unlock (sets session cookie)
 *   { "action": "logout" }                    clear the session cookie
 */
export async function POST(req: NextRequest) {
  const blocked = requireSameOrigin(req);
  if (blocked) return blocked;

  let body: { action?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body.action ?? "";
  const password = typeof body.password === "string" ? body.password.trim() : "";

  if (action === "logout") {
    return clearSession(NextResponse.json({ ok: true }));
  }

  if (action === "setup") {
    // Creating the first password is open (that's the point of onboarding);
    // changing an existing one requires an unlocked session.
    if (dashboardPasswordSet() && !isDashboardAuthed(req)) {
      return NextResponse.json(
        { error: "Unlock the dashboard before changing the password." },
        { status: 401 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Use at least 8 characters." },
        { status: 400 }
      );
    }
    await persistEnv({ dashboardPassword: password });
    return attachSession(NextResponse.json({ ok: true, created: true }));
  }

  if (action === "login") {
    if (!dashboardPasswordSet()) {
      return NextResponse.json(
        { error: "No password is set yet." },
        { status: 400 }
      );
    }
    if (!verifyDashboardPassword(password)) {
      return NextResponse.json({ error: "Wrong password." }, { status: 401 });
    }
    return attachSession(NextResponse.json({ ok: true }));
  }

  return NextResponse.json(
    { error: "`action` must be 'setup', 'login' or 'logout'." },
    { status: 400 }
  );
}
