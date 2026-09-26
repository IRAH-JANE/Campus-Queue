import { cookies } from "next/headers";

type RouteContext = { params: Promise<{ segments: string[] }> };

async function forward(request: Request, context: RouteContext) {
  const { segments } = await context.params;
  const path = segments.map(encodeURIComponent).join("/");
  const incomingUrl = new URL(request.url);
  const backendBase = process.env.CAMPUS_API_URL || "http://localhost:3001";
  const target = new URL(`/${path}${incomingUrl.search}`, backendBase);
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const sessionToken = (await cookies()).get("campus_session")?.value;
  if (sessionToken) headers.set("authorization", `Bearer ${sessionToken}`);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    ...(hasBody ? { body: await request.arrayBuffer() } : {}),
    cache: "no-store",
  });
  const responseHeaders = new Headers();
  const responseType = upstream.headers.get("content-type");
  if (responseType) responseHeaders.set("content-type", responseType);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const PUT = forward;
export const DELETE = forward;
