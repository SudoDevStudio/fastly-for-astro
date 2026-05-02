import type { APIRoute } from "astro";

export const GET: APIRoute = ({ cookies }) => {
  cookies.set("hello", "from-fastly", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 3600,
  });
  return new Response(JSON.stringify({ ok: true, cookieSet: "hello" }), {
    headers: { "content-type": "application/json" },
  });
};
