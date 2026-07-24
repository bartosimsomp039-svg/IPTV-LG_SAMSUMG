export class ApiClient {

    public async get(url: string): Promise<any> {

        const response = await fetch('/api/xtream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return response.json();

    }

}