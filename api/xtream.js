export const config = {
    runtime: "edge",
};

export default async function handler(request: Request): Promise<Response> {

    const url = new URL(request.url);
    const targetParam = url.searchParams.get("url");

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
        return new Response("Missing url", { status: 400 });
    }

    const targetUrl = decodeURIComponent(targetParam);

    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
        return new Response("Invalid URL", { status: 400 });
    }

    try {

        const response = await fetch(targetUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (SMART-TV)" },
        });

        const contentType = response.headers.get("content-type") ?? "application/octet-stream";
        const isM3U8 = contentType.includes("mpegurl") || targetUrl.toLowerCase().includes(".m3u8");

        if (isM3U8) {

            const text = await response.text();
            const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);

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
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-cache",
                },
            });

        }

        return new Response(response.body, {
            status: response.status,
            headers: {
                "Content-Type": contentType,
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
            },
        });

    } catch (error) {
        return new Response("Proxy error", { status: 502 });
    }

}