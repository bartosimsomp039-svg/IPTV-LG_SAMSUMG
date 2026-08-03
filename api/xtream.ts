// Edge Runtime — igual que proxy.ts.
// El Edge Runtime de Vercel SÍ puede conectarse a puertos no estándar
// como 8080 y 8880 que usan los servidores Xtream IPTV.
// El Node.js runtime tiene restricciones de red que bloquean esos puertos.
export const config = { runtime: "edge" };

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  let targetUrl: string | null = null;

  if (request.method === "POST") {
    try {
      const body = (await request.json()) as { url?: string };
      targetUrl = body?.url ?? null;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }
  } else {
    const url = new URL(request.url);
    const p = url.searchParams.get("url");
    targetUrl = p ? decodeURIComponent(p) : null;
  }

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: "Missing url" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    return new Response(JSON.stringify({ error: "Invalid URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (SMART-TV; Linux armv7l) AppleWebKit/538.1 (KHTML, like Gecko) Version/8.0 Safari/538.1",
        Accept: "application/json, */*",
      },
      signal: AbortSignal.timeout(12000),
    });

    const data = (await upstream.text()).trim();

    let parsed: unknown;
    try {
      parsed = data ? JSON.parse(data.replace(/^\uFEFF/, "")) : null;
    } catch {
      const lower = data.toLowerCase();
      const isAuthError =
        lower.includes("invalid auth") ||
        lower.includes("invalid credential") ||
        lower.includes("unauthorized");

      return new Response(
        JSON.stringify({
          error: data || `Xtream server returned HTTP ${upstream.status}`,
        }),
        {
          status: isAuthError ? 401 : 502,
          headers: { "Content-Type": "application/json", ...CORS },
        }
      );
    }

    return new Response(JSON.stringify(parsed), {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-cache",
        ...CORS,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: "Proxy error: " + msg }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
}
