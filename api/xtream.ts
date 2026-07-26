export const config = {
    runtime: "edge",
};

export default async function handler(request: Request): Promise<Response> {

    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
    };

    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    // Leer la URL del body JSON (así lo envía ApiClient)
    let targetUrl: string | null = null;

    try {
        const body = await request.json() as { url?: string };
        targetUrl = body.url ?? null;
    } catch {
        // fallback: leer de query params (GET)
        const url = new URL(request.url);
        targetUrl = url.searchParams.get("url");
    }

    if (!targetUrl) {
        return new Response("Missing url", { status: 400, headers: corsHeaders });
    }

    const decoded = decodeURIComponent(targetUrl);

    if (!decoded.startsWith("http://") && !decoded.startsWith("https://")) {
        return new Response("Invalid URL", { status: 400, headers: corsHeaders });
    }

    try {

        const response = await fetch(decoded, {
            headers: { "User-Agent": "Mozilla/5.0 (SMART-TV)" },
        });

        const contentType = response.headers.get("content-type") ?? "application/octet-stream";
        const isM3U8 = contentType.includes("mpegurl") || decoded.toLowerCase().includes(".m3u8");

        if (isM3U8) {

            const text = await response.text();
            const baseUrl = decoded.substring(0, decoded.lastIndexOf("/") + 1);

            const rewritten = text.split("\n").map((line) => {
                const trimmed = line.trim();
                if (trimmed.startsWith("#") || trimmed === "") return line;
                const abs = (trimmed.startsWith("http://") || trimmed.startsWith("https://"))
                    ? trimmed
                    : baseUrl + trimmed;
                return `/api/proxy?url=${encodeURIComponent(abs)}`;
            }).join("\n");

            return new Response(rewritten, {
                headers: {
                    "Content-Type": "application/vnd.apple.mpegurl",
                    ...corsHeaders,
                    "Cache-Control": "no-cache",
                },
            });

        }

        return new Response(response.body, {
            status: response.status,
            headers: {
                "Content-Type": contentType,
                ...corsHeaders,
                "Cache-Control": "no-cache",
            },
        });

    } catch {
        return new Response("Proxy error", { status: 502, headers: corsHeaders });
    }

}
