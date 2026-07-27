import { XtreamService } from "./XtreamService";

export class AppServices {

    private static xtream: XtreamService | null = null;

    public static setXtream(service: XtreamService): void {

        this.xtream = service;

    }

    public static getXtream(): XtreamService {

        if (!this.xtream) {

            throw new Error("XtreamService no inicializado.");

        }

        return this.xtream;

    }

    public static isLogged(): boolean {

        return this.xtream?.isLogged() ?? false;

    }

}