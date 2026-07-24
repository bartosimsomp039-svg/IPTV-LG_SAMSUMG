import { Router } from "./Router";
import { DataManager } from "../services/DataManager";

export class App {

    private router = new Router();

    public async start(): Promise<void> {

        this.router.start();

        await this.tryAutoLogin();

    }

    private async tryAutoLogin(): Promise<void> {

        const host = localStorage.getItem("iptv_host");
        const user = localStorage.getItem("iptv_user");
        const pass = localStorage.getItem("iptv_pass");

        if (!host || !user || !pass) {
            Router.getInstance().navigate("login");
            return;
        }

        try {

            const ok = await DataManager.login(host, user, pass);

            if (ok) {
                Router.getInstance().navigate("home");
                return;
            }

        } catch {

        }

        localStorage.removeItem("iptv_host");
        localStorage.removeItem("iptv_user");
        localStorage.removeItem("iptv_pass");

        Router.getInstance().navigate("login");

    }

}