import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
  runtime: "nodejs",
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
) {
  // CORS
  Object.entries(CORS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  let targetUrl: string | null = null;

  // POST
  if (req.method === "POST") {
    const body = req.body;

    if (body && typeof body === "object" && !Array.isArray(body)) {
      const value = (body as { url?: unknown }).url;

      if (typeof value === "string") {
        targetUrl = value;
      }
    }

    // Por si Vercel entrega el body como texto
    if (!targetUrl && typeof body === "string") {
      try {
        const parsed = JSON.parse(body);

        if (
          parsed &&
          typeof parsed === "object" &&
          typeof parsed.url === "string"
        ) {
          targetUrl = parsed.url;
        }
      } catch {
        return res.status(400).json({
          error: "Invalid JSON body",
        });
      }
    }
  }

  // GET
  else {
    const queryUrl = req.query?.url;

    if (typeof queryUrl === "string") {
      targetUrl = queryUrl;
    } else if (Array.isArray(queryUrl) && queryUrl.length > 0) {
      targetUrl = queryUrl[0];
    }
  }

  if (!targetUrl) {
    return res.status(400).json({
      error: "Missing url",
    });
  }

  targetUrl = targetUrl.trim();

  if (
    !targetUrl.startsWith("http://") &&
    !targetUrl.startsWith("https://")
  ) {
    return res.status(400).json({
      error: "Invalid URL",
    });
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return res.status(400).json({
      error: "Invalid target URL",
    });
  }

  // Evita accidentalmente mandar URLs sin puerto esperado
  console.log(
    "[XTREAM] Request:",
    `${parsedUrl.protocol}//${parsedUrl.hostname}${parsedUrl.port ? ":" + parsedUrl.port : ""}${parsedUrl.pathname}`
  );

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 12000);

  try {
    const upstream = await fetch(parsedUrl.toString(), {
      method: "GET",

      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",

        Accept: "application/json, text/plain, */*",

        "Accept-Encoding": "identity",
      },

      redirect: "follow",

      signal: controller.signal,
    });

    clearTimeout(timeout);

    const raw = await upstream.text();
    const data = raw.trim();

    console.log(
      "[XTREAM] Upstream status:",
      upstream.status,
      "bytes:",
      data.length
    );

    // Intentar JSON
    let parsed: unknown;

    try {
      parsed = data
        ? JSON.parse(data.replace(/^\uFEFF/, ""))
        : null;
    } catch {
      const lower = data.toLowerCase();

      const isAuthError =
        lower.includes("invalid auth") ||
        lower.includes("invalid credential") ||
        lower.includes("unauthorized") ||
        lower.includes("authentication failed");

      return res.status(isAuthError ? 401 : 502).json({
        error:
          data ||
          `Xtream server returned HTTP ${upstream.status}`,
      });
    }

    return res.status(upstream.status).json(parsed);
  } catch (err: unknown) {
    clearTimeout(timeout);

    const message =
      err instanceof Error ? err.message : String(err);

    console.error("[XTREAM] Proxy error:", message);

    return res.status(502).json({
      error: "Proxy error: " + message,
    });
  }
}