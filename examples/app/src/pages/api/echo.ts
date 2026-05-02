import type { APIRoute } from "astro";

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export const GET: APIRoute = ({ url, request, locals }) => {
  return json({
    method: "GET",
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    headers: {
      "user-agent": request.headers.get("user-agent"),
      accept: request.headers.get("accept"),
    },
    requestId: locals.requestId ?? null,
    note: "POST a JSON body to this endpoint to see it echoed back.",
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const contentType = request.headers.get("content-type") ?? "";
  let body: unknown;
  try {
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else if (contentType.startsWith("text/")) {
      body = await request.text();
    } else {
      const buf = await request.arrayBuffer();
      body = `<binary ${buf.byteLength} bytes>`;
    }
  } catch (err) {
    return json({ error: "invalid body", message: err instanceof Error ? err.message : String(err) }, 400);
  }

  return json({
    method: "POST",
    contentType,
    body,
    requestId: locals.requestId ?? null,
  });
};

export const PUT: APIRoute = ({ request, locals }) =>
  json({ method: "PUT", url: request.url, requestId: locals.requestId ?? null });

export const PATCH: APIRoute = ({ request, locals }) =>
  json({ method: "PATCH", url: request.url, requestId: locals.requestId ?? null });

export const DELETE: APIRoute = ({ request, locals }) =>
  json({ method: "DELETE", url: request.url, requestId: locals.requestId ?? null });

export const OPTIONS: APIRoute = () =>
  new Response(null, {
    status: 204,
    headers: {
      allow: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    },
  });
