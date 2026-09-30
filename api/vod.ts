import type { IncomingMessage, ServerResponse } from "node:http";

export const config = {
  runtime: "nodejs",
};

function setCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Range, Content-Type, Accept, Origin, Referer, User-Agent"
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Accept-Ranges, Content-Type"
  );
}

function getQueryUrl(req: IncomingMessage): string | null {
  const host = req.headers.host || "localhost";
  const protocol =
    (req.headers["x-forwarded-proto"] as string | undefined) || "https";

  const requestUrl = new URL(
    req.url || "/api/vod",
    `${protocol}://${host}`
  );

  return requestUrl.searchParams.get("url");
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    res.end("Method Not Allowed");
    return;
  }

  try {
    const target = getQueryUrl(req);

    if (!target) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Falta el parámetro url" }));
      return;
    }

    let targetUrl: URL;

    try {
      targetUrl = new URL(target);
    } catch {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "URL inválida" }));
      return;
    }

    if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Protocolo no permitido" }));
      return;
    }

    const headers: Record<string, string> = {
      Accept: "*/*",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",
    };

    const range = req.headers.range;

    if (range) {
      headers.Range = range;
    }

    const referer = req.headers.referer;

    if (referer) {
      headers.Referer = referer;
    }

    console.log("[VOD NODE] Target:", targetUrl.toString());
    console.log("[VOD NODE] Range:", range || "none");

    const upstream = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      redirect: "follow",
    });

    console.log("[VOD NODE] Status:", upstream.status);
    console.log(
      "[VOD NODE] Final URL:",
      upstream.url || targetUrl.toString()
    );

    res.statusCode = upstream.status;

    const contentType = upstream.headers.get("content-type");
    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    const acceptRanges = upstream.headers.get("accept-ranges");

    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    if (contentRange) {
      res.setHeader("Content-Range", contentRange);
    }

    if (acceptRanges) {
      res.setHeader("Accept-Ranges", acceptRanges);
    } else {
      res.setHeader("Accept-Ranges", "bytes");
    }

    const cacheControl = upstream.headers.get("cache-control");

    if (cacheControl) {
      res.setHeader("Cache-Control", cacheControl);
    } else {
      res.setHeader("Cache-Control", "no-store");
    }

    if (req.method === "HEAD" || !upstream.body) {
      res.end();
      return;
    }

    const reader = upstream.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        if (value) {
          const canContinue = res.write(Buffer.from(value));

          if (!canContinue) {
            await new Promise<void>((resolve) => {
              res.once("drain", resolve);
            });
          }
        }
      }

      res.end();
    } catch (streamError) {
      console.error("[VOD NODE] Stream error:", streamError);

      try {
        res.destroy();
      } catch {}
    }
  } catch (error) {
    console.error("[VOD NODE] ERROR:", error);

    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Error obteniendo el VOD",
          message:
            error instanceof Error ? error.message : String(error),
        })
      );
    } else {
      try {
        res.destroy();
      } catch {}
    }
  }
}