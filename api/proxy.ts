export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Range, *",
        "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const url = new URL(request.url);
    const targetParam = url.searchParams.get("url");
    if (!targetParam) return new Response("Missing url", { status: 400, headers: corsHeaders });

    const targetUrl = decodeURIComponent(targetParam);
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://"))
        return new Response("Invalid URL", { status: 400, headers: corsHeaders });

    const upstreamHeaders: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (SMART-TV) AppleWebKit/538.1",
        "Accept": "*/*",
        "Accept-Encoding": "identity",
    };
    const rangeHeader = request.headers.get("range");
    if (rangeHeader) upstreamHeaders["Range"] = rangeHeader;

    try {
        const response = await fetch(targetUrl, { headers: upstreamHeaders });
        const contentType = response.headers.get("content-type") ?? "application/octet-stream";
        const isM3U8 = contentType.includes("mpegurl") || targetUrl.toLowerCase().includes(".m3u8");

        if (isM3U8) {
            const text = await response.text();
            if (!text.includes("#EXTM3U") && !text.includes("#EXT-X-"))
                return new Response("Invalid M3U8: " + text.substring(0, 200), { status: 502, headers: corsHeaders });

            const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);
            const parsedBase = new URL(targetUrl);

            const rewritten = text.split("\n").map((line) => {
                const trimmed = line.trim();
                if (trimmed.startsWith("#") || trimmed === "") return line;
                let absoluteUrl: string;
                if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                    absoluteUrl = trimmed;
                } else if (trimmed.startsWith("/")) {
                    absoluteUrl = parsedBase.protocol + "//" + parsedBase.host + trimmed;
                } else {
                    absoluteUrl = baseUrl + trimmed;
                }
                return "/api/proxy?url=" + encodeURIComponent(absoluteUrl);
            }).join("\n");

            return new Response(rewritten, {
                headers: { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "no-cache, no-store", ...corsHeaders },
            });
        }

        const responseHeaders: Record<string, string> = { "Content-Type": "video/mp2t", "Cache-Control": "no-cache", ...corsHeaders };
        const cl = response.headers.get("content-length");
        const cr = response.headers.get("content-range");
        if (cl) responseHeaders["Content-Length"] = cl;
        if (cr) responseHeaders["Content-Range"] = cr;
        responseHeaders["Accept-Ranges"] = "bytes";
        return new Response(response.body, { status: response.status, headers: responseHeaders });

    } catch (error) {
        return new Response("Proxy error: " + error, { status: 502, headers: corsHeaders });
    }
}
