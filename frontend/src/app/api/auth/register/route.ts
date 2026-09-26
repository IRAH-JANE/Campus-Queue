export async function POST(request: Request) {
  const backendBase = process.env.CAMPUS_API_URL || "http://localhost:3001";
  const upstream = await fetch(`${backendBase}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await request.text(),
    cache: "no-store",
  });
  const payload = await upstream.json().catch(() => null);
  return Response.json(payload || {}, { status: upstream.status });
}
