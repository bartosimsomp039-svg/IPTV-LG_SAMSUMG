import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
  maxDuration: 15,
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  let targetUrl: string | null = null;

  if (req.method === "POST") {
    const body = req.body as { url?: string } | null;
    targetUrl = body?.url ?? null;
  } else {
    const p = req.query["url"];
    targetUrl = Array.isArray(p) ? p[0] : (p ?? null);
  }

  if (!targetUrl) {
    res.status(400).json({ error: "Missing url" });
    return;
  }

  let decoded: string;
  try {
    // The POST body contains the encoded username/password query values.
    decoded = decodeURIComponent(targetUrl);
  } catch {
    res.status(400).json({ error: "Malformed URL" });
    return;
  }

  if (!decoded.startsWith("http://") && !decoded.startsWith("https://")) {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  try {
    const upstream = await fetch(decoded, {
      headers: {
        "User-Agent": "Mozilla/5.0 (SMART-TV; Linux armv7l) AppleWebKit/538.1 (KHTML, like Gecko) Version/8.0 Safari/538.1",
        Accept: "application/json, */*",
      },
      signal: AbortSignal.timeout(12000),
    });

    const data = (await upstream.text()).trim();

    let parsed: unknown;
    try {
      parsed = data ? JSON.parse(data.replace(/^\uFEFF/, "")) : null;
    } catch {
      // Normalize plain-text provider errors to JSON so the frontend never
      // crashes while parsing the proxy response.
      const lower = data.toLowerCase();
      const isAuthError =
        lower.includes("invalid auth") ||
        lower.includes("invalid credential") ||
        lower.includes("unauthorized");

      res.status(isAuthError ? 401 : 502).json({
        error: data || `Xtream server returned HTTP ${upstream.status}`,
      });
      return;
    }

    res.status(upstream.status).set({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-cache",
      ...CORS,
    }).json(parsed);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: "Proxy error: " + msg });
  }
}