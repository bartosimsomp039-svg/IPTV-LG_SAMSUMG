import "./MovieDetail.css";

import { Navigation } from "../../services/Navigation";
import { Router } from "../../app/Router";
import { FocusManager } from "../../tv/FocusManager";
import { Keyboard } from "../../tv/Keyboard";

export class MovieDetail {

    public render(): string {

        return `<div class="movie-detail"><div id="movieDetailRoot"></div></div>`;

    }

    public init(): void {

        const movie = Navigation.selectedMovie;

        const root = document.getElementById("movieDetailRoot");

        if (!root || !movie) {
            Router.getInstance().navigate("movie");
            return;
        }

        const poster = movie.stream_icon
            ? `<img src="${movie.stream_icon}"
                   alt="${movie.name}"
                   onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
               ><span style="display:none;font-size:60px;align-items:center;justify-content:center;width:100%;height:100%">🎬</span>`
            : `<span style="font-size:60px">🎬</span>`;

        const year  = (movie as any).year  ?? "";
        const rating = (movie as any).rating ?? "";
        const genre  = (movie as any).genre  ?? "";
        const plot   = (movie as any).plot   ?? "Sin descripción disponible.";

        const meta = [year, rating ? `⭐ ${rating}` : "", genre]
            .filter(Boolean)
            .map(v => `<span>${v}</span>`)
            .join("");

        root.innerHTML = `

<div class="movie-detail-hero">

    <div class="movie-detail-poster">
        ${poster}
    </div>

    <div class="movie-detail-info">

        <h1>${movie.name}</h1>

        ${meta ? `<div class="movie-detail-meta">${meta}</div>` : ""}

        <p class="movie-detail-plot">${plot}</p>

        <div class="movie-detail-actions">
            <button class="btn-play" id="btnPlay">▶ Reproducir</button>
            <button class="btn-back-detail" id="btnBack">← Volver</button>
        </div>

    </div>

</div>

`;

        const goBack = () => Router.getInstance().navigate("movies");

        document.getElementById("btnBack")
            ?.addEventListener("click", goBack);

        document.getElementById("btnPlay")
            ?.addEventListener("click", () => {
                Navigation.type = "movie";
                Router.getInstance().navigate("player");
            });

        const focus = new FocusManager();
        focus.register(".btn-play, .btn-back-detail");
        new Keyboard(focus, goBack);

    }

}