// Archivo: api/proxy.ts
// Ubicación en tu proyecto: <raiz>/api/proxy.ts
//
// Este Edge Function actúa de proxy entre tu app HTTPS y el servidor IPTV HTTP.
// Vercel lo expone automáticamente en /api/proxy

export const config = {
    runtime: "edge",
};

export default async function handler(request: Request): Promise<Response> {

    const url = new URL(request.url);
    const targetParam = url.searchParams.get("url");

    // CORS preflight
    if (request.method === "OPTIONS") {
        return new Response(null, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            },
        });
    }

    if (!targetParam) {
        return new Response("Missing url parameter", { status: 400 });
    }

    const targetUrl = decodeURIComponent(targetParam);

    // Solo permitir HTTP (el servidor IPTV) — no HTTPS externo por seguridad
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
        return new Response("Invalid URL", { status: 400 });
    }

    try {

        const response = await fetch(targetUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (SMART-TV) AppleWebKit/538.1",
                "Accept": "*/*",
            },
        });

        if (!response.ok && response.status !== 206) {
            return new Response(`Upstream error: ${response.status}`, {
                status: response.status,
            });
        }

        const contentType =
            response.headers.get("content-type") ?? "application/octet-stream";

        const isM3U8 =
            contentType.includes("mpegurl") ||
            targetUrl.toLowerCase().includes(".m3u8");

        // ── Manifest HLS: reescribir URLs de segmentos ─────────────────
        if (isM3U8) {

            const text = await response.text();
            const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);

            const rewritten = text
                .split("\n")
                .map((line) => {

                    const trimmed = line.trim();

                    // Comentarios y líneas vacías — sin cambios
                    if (trimmed.startsWith("#") || trimmed === "") {
                        return line;
                    }

                    // Resolver URL absoluta
                    let absoluteUrl: string;

                    if (
                        trimmed.startsWith("http://") ||
                        trimmed.startsWith("https://")
                    ) {
                        absoluteUrl = trimmed;
                    } else {
                        absoluteUrl = baseUrl + trimmed;
                    }

                    // Redirigir por proxy
                    return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;

                })
                .join("\n");

            return new Response(rewritten, {
                headers: {
                    "Content-Type": "application/vnd.apple.mpegurl",
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-cache, no-store",
                },
            });

        }

        // ── Segmentos de video y otros recursos: streaming directo ──────
        return new Response(response.body, {
            status: response.status,
            headers: {
                "Content-Type": contentType,
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
            },
        });

    } catch (error) {

        console.error("Proxy error:", error);
        return new Response("Proxy error", { status: 502 });

    }

}
