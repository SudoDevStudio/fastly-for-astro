import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  // Adapter populates locals.requestId. If we somehow run without the adapter
  // (e.g. astro dev) make sure something sensible is present.
  if (!context.locals.requestId) {
    context.locals.requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
  }
  const response = await next();
  response.headers.set("x-powered-by", "astro+fastly-compute");
  return response;
});
