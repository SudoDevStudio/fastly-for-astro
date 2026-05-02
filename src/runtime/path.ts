export function normalizePath(pathname: string): string {
  // Reject obvious traversal attempts.
  if (pathname.includes("\0")) return "/";
  // Resolve . and .. segments without filesystem access.
  const segments = pathname.split("/");
  const resolved: string[] = [];
  for (const seg of segments) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(seg);
  }
  const out = "/" + resolved.join("/");
  return pathname.endsWith("/") && out !== "/" ? out + "/" : out;
}

export function reconstructUrl(
  request: Request,
  opts: { trustForwardedProto: boolean; preserveHostHeader: boolean },
): URL {
  const url = new URL(request.url);

  if (opts.preserveHostHeader) {
    const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (forwardedHost) url.host = forwardedHost;
  }

  if (opts.trustForwardedProto) {
    const proto = request.headers.get("x-forwarded-proto");
    if (proto === "http" || proto === "https") url.protocol = proto + ":";
  }

  url.pathname = normalizePath(url.pathname);
  return url;
}

export function isServerIslandRequest(pathname: string): boolean {
  return pathname.startsWith("/_server-islands/");
}

export function isAstroAssetRequest(pathname: string, assetsPrefix: string): boolean {
  return pathname.startsWith(assetsPrefix) || pathname.startsWith("/_astro/");
}
