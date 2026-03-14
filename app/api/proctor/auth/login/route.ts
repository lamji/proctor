import { NextResponse } from "next/server";

import { corsPreflight, withCors } from "@/lib/proctor-cors";
import { loginWithEnvCredentials } from "@/lib/proctor-env-auth";
import { getRequestLogMeta, logProctorEvent } from "@/lib/proctor-logger";

export const dynamic = "force-dynamic";

export const OPTIONS = () => corsPreflight();

export const POST = async (request: Request) => {
  const reqMeta = getRequestLogMeta(request);
  let body: { username?: string; password?: string };

  try {
    body = (await request.json()) as { username?: string; password?: string };
  } catch {
    logProctorEvent("warn", "login_invalid_json", reqMeta);
    return withCors(
      NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 }),
    );
  }

  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";

  if (!username || !password) {
    logProctorEvent("warn", "login_missing_credentials", {
      ...reqMeta,
      usernameProvided: Boolean(username),
      passwordProvided: Boolean(password),
    });
    return withCors(
      NextResponse.json(
        { ok: false, error: "Username and password are required." },
        { status: 400 },
      ),
    );
  }

  const token = loginWithEnvCredentials({ username, password });
  if (!token) {
    logProctorEvent("warn", "login_invalid_credentials", {
      ...reqMeta,
      username,
    });
    return withCors(
      NextResponse.json({ ok: false, error: "Invalid credentials." }, { status: 401 }),
    );
  }

  logProctorEvent("info", "login_success", {
    ...reqMeta,
    username,
  });

  return withCors(NextResponse.json({ ok: true, token }));
};
