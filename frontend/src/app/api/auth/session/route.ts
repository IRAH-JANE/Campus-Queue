import { cookies } from "next/headers";

export async function POST(request: Request) {
  const backendBase = process.env.CAMPUS_API_URL || "http://localhost:3001";
  const upstream = await fetch(`${backendBase}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await request.text(),
    cache: "no-store",
  });
  const payload = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    return Response.json(payload || { message: "Unable to sign in" }, { status: upstream.status });
  }

  const token = payload?.accessToken;
  if (!token) return Response.json({ message: "The server did not return a session token" }, { status: 502 });

  (await cookies()).set("campus_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return Response.json({ message: payload.message, user: payload.user });
}

export async function DELETE() {
  (await cookies()).delete("campus_session");
  return Response.json({ message: "Signed out" });
}
