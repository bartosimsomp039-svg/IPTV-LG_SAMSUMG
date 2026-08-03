export class ApiClientError extends Error {
    public readonly status: number;
    public readonly body: string;

    constructor(message: string, status: number, body = "") {
        super(message);
        this.name = "ApiClientError";
        this.status = status;
        this.body = body;
    }
}

export class ApiClient {

    public async get(url: string): Promise<any> {

        const API_URL =
            window.location.protocol === "file:"
                ? "https://iptv-lg-samsumg.vercel.app/api/xtream"
                : "/api/xtream";

        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ url }),
        });

        // Read as text first. Some Xtream servers return plain text such as
        // "Invalid Auth" with a 200 response, which makes response.json()
        // throw a misleading SyntaxError.
        const rawBody = await response.text();
        const body = rawBody.trim();

        let data: any = null;
        if (body) {
            try {
                data = JSON.parse(body.replace(/^\uFEFF/, ""));
            } catch {
                throw new ApiClientError(
                    body,
                    response.status,
                    body,
                );
            }
        }

        if (!response.ok) {
            const message =
                typeof data?.error === "string"
                    ? data.error
                    : body || `HTTP ${response.status}`;

            throw new ApiClientError(
                `${message} (HTTP ${response.status})`,
                response.status,
                body,
            );
        }

        return data;

    }

}