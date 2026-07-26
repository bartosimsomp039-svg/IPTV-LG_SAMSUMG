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

    let targetUrl: string | null = null;

    try {
        const body = await request.json() as { url?: string };
        targetUrl = body.url ?? null;
    } catch {
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

        const contentType = response.headers.get("content-type") ?? "application/json";
        const data = await response.text();

        return new Response(data, {
            status: response.status,
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "no-cache",
                ...corsHeaders,
            },
        });

    } catch {
        return new Response("Proxy error", { status: 502, headers: corsHeaders });
    }

}