import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
    maxDuration: 30,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Range, *");
    res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    const targetParam = req.query.url as string;
    if (!targetParam) return res.status(400).send("Missing url");

    const targetUrl = decodeURIComponent(targetParam);
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
        return res.status(400).send("Invalid URL");
    }

    const upstreamHeaders: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (SMART-TV) AppleWebKit/538.1",
        "Accept": "*/*",
        "Accept-Encoding": "identity",
    };

    if (req.headers.range) {
        upstreamHeaders["Range"] = req.headers.range;
    }

    try {
        const response = await fetch(targetUrl, { headers: upstreamHeaders });

        const contentType = response.headers.get("content-type") ?? "application/octet-stream";
        const isM3U8 =
            contentType.includes("mpegurl") ||
            targetUrl.toLowerCase().includes(".m3u8");

        if (isM3U8) {
            const text = await response.text();

            if (!text.includes("#EXTM3U") && !text.includes("#EXT-X-")) {
                return res.status(502).send(`Invalid M3U8: ${text.substring(0, 200)}`);
            }

            const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);

            const rewritten = text
                .split("\n")
                .map((line) => {
                    const trimmed = line.trim();
                    if (trimmed.startsWith("#") || trimmed === "") return line;
                    const absoluteUrl =
                        trimmed.startsWith("http://") || trimmed.startsWith("https://")
                            ? trimmed
                            : baseUrl + trimmed;
                    return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
                })
                .join("\n");

            res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
            res.setHeader("Cache-Control", "no-cache, no-store");
            return res.status(200).send(rewritten);
        }

        // ✅ FIX: usar arrayBuffer() en vez de pipeTo() — evita corrupción binaria
        const buffer = await response.arrayBuffer();
        const nodeBuffer = Buffer.from(buffer);

        const contentLength = response.headers.get("content-length");
        const contentRange = response.headers.get("content-range");

        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Accept-Ranges", "bytes");
        if (contentLength) res.setHeader("Content-Length", contentLength);
        if (contentRange) res.setHeader("Content-Range", contentRange);

        return res.status(response.status).send(nodeBuffer);

    } catch (error) {
        return res.status(502).send(`Proxy error: ${error}`);
    }
}