// api/proxy.ts
// Node.js runtime — sin límite de tamaño, streaming real de segmentos de video

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import { URL } from "url";

export default async function handler(req: VercelRequest, res: VercelResponse) {

    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Range, *",
        "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
    };

    // CORS preflight
    if (req.method === "OPTIONS") {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
    }

    const targetParam = req.query["url"] as string | undefined;

    if (!targetParam) {
        res.status(400).send("Missing url parameter");
        return;
    }

    const targetUrl = decodeURIComponent(targetParam);

    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
        res.status(400).send("Invalid URL");
        return;
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(targetUrl);
    } catch {
        res.status(400).send("Malformed URL");
        return;
    }

    const isHttps = parsedUrl.protocol === "https:";
    const requester = isHttps ? httpsRequest : httpRequest;

    const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: "GET",
        headers: {
            "User-Agent": "Mozilla/5.0 (SMART-TV) AppleWebKit/538.1",
            "Accept": "*/*",
            ...(req.headers["range"] ? { "Range": req.headers["range"] } : {}),
        },
    };

    const isM3U8 =
        targetUrl.toLowerCase().includes(".m3u8") ||
        targetUrl.toLowerCase().includes("mpegurl");

    return new Promise<void>((resolve) => {

        const upstreamReq = requester(options, (upstreamRes) => {

            const contentType =
                upstreamRes.headers["content-type"] ?? "application/octet-stream";

            const responseHeaders: Record<string, string> = {
                ...corsHeaders,
                "Cache-Control": "no-cache",
            };

            // Reenviar headers de streaming
            if (upstreamRes.headers["content-length"]) {
                responseHeaders["Content-Length"] = upstreamRes.headers["content-length"];
            }
            if (upstreamRes.headers["content-range"]) {
                responseHeaders["Content-Range"] = upstreamRes.headers["content-range"];
            }
            responseHeaders["Accept-Ranges"] =
                upstreamRes.headers["accept-ranges"] ?? "bytes";

            // Manifest HLS — reescribir URLs
            if (isM3U8 || (contentType as string).includes("mpegurl")) {

                const chunks: Buffer[] = [];

                upstreamRes.on("data", (chunk: Buffer) => chunks.push(chunk));

                upstreamRes.on("end", () => {

                    const text = Buffer.concat(chunks).toString("utf-8");
                    const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);

                    const rewritten = text
                        .split("\n")
                        .map((line) => {
                            const trimmed = line.trim();
                            if (trimmed.startsWith("#") || trimmed === "") return line;
                            const abs =
                                trimmed.startsWith("http://") || trimmed.startsWith("https://")
                                    ? trimmed
                                    : baseUrl + trimmed;
                            return `/api/proxy?url=${encodeURIComponent(abs)}`;
                        })
                        .join("\n");

                    res.writeHead(200, {
                        ...responseHeaders,
                        "Content-Type": "application/vnd.apple.mpegurl",
                    });
                    res.end(rewritten);
                    resolve();

                });

            } else {

                // Segmentos de video — pipe directo sin bufferear
                res.writeHead(upstreamRes.statusCode ?? 200, {
                    ...responseHeaders,
                    "Content-Type": contentType as string,
                });

                upstreamRes.pipe(res);
                upstreamRes.on("end", resolve);

            }

        });

        upstreamReq.on("error", (err) => {
            console.error("Proxy error:", err);
            if (!res.headersSent) {
                res.status(502).send("Proxy error");
            }
            resolve();
        });

        upstreamReq.end();

    });

}
