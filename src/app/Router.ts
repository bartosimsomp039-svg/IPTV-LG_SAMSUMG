import { Splash } from "../pages/Splash/Splash";
import { Login } from "../pages/Login/Login";
import { Home } from "../pages/Home/Home";
import { Live } from "../pages/Live/Live";
import { Movies } from "../pages/Movies/Movies";
import { SeriesPage } from "../pages/SeriesPage/SeriesPage";
import { Player } from "../pages/Player/Player";
import { MovieDetail } from "../pages/MovieDetail/MovieDetail";
import { SeriesDetail } from "../pages/SeriesDetail/SeriesDetail";

export class Router {

    private static instance: Router;

    private app: HTMLElement;

    constructor() {

        const el = document.getElementById("app");

        if (!el) {
            throw new Error("No existe #app");
        }

        this.app = el;

        Router.instance = this;

    }

    public static getInstance(): Router {

        return Router.instance;

    }

    public start(): void {

        window.addEventListener("splash-finished", () => {

            this.navigate("login");

        });

        window.addEventListener("login-success", () => {

            this.navigate("home");

        });

        this.navigate("splash");

    }

    public navigate(page: string): void {

        switch (page) {

            case "splash":
                this.showSplash();
                break;

            case "login":
                this.showLogin();
                break;

            case "home":
                this.showHome();
                break;

            case "live":
                this.showLive();
                break;

            case "movies":
                this.showMovies();
                break;

            case "series":
                this.showSeries();
                break;

            case "player":
                this.showPlayer();
                break;

            case "movie-detail": {
                const movieDetail = new MovieDetail();
                this.app.innerHTML = movieDetail.render();
                movieDetail.init();
                break;
          }
            case "series-detail": {
                const seriesDetail = new SeriesDetail();
                this.app.innerHTML = seriesDetail.render();
                seriesDetail.init();
                break;
            }
        }
    }

    private showSplash(): void {

        const page = new Splash();

        this.app.innerHTML = page.render();

    }

    private showLogin(): void {

        const page = new Login();

        this.app.innerHTML = page.render();

        page.init();

    }

    private showHome(): void {

        const page = new Home();

        this.app.innerHTML = page.render();

        page.init();

    }

    private showLive(): void {

        const page = new Live();

        this.app.innerHTML = page.render();

        page.init();

    }

    private showMovies(): void {

        const page = new Movies();

        this.app.innerHTML = page.render();

        page.init();

    }

    private showSeries(): void {

        const page = new SeriesPage();

        this.app.innerHTML = page.render();

        page.init();

    }

    private showPlayer(): void {

        const page = new Player();

        this.app.innerHTML = page.render();

        page.init();

    }

}