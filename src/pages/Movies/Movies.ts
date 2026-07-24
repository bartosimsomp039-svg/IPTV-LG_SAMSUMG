import "./Movies.css";

import { Header } from "../../components/Header";
import { DataManager } from "../../services/DataManager";
import { Navigation } from "../../services/Navigation";
import { Router } from "../../app/Router";
import { FocusManager } from "../../tv/FocusManager";
import { Keyboard } from "../../tv/Keyboard";

export class Movies {

    public render(): string {

        const header = new Header();

        return `

<div class="movies">

    ${header.render()}

    <div class="movies-content">

        <button class="back-btn" id="backBtn">&#8592; Volver</button>

        <h1 id="categoryTitle">🎬 PELÍCULAS</h1>

        <div id="moviesGrid" class="movies-grid"></div>

    </div>

</div>

`;

    }

    public init(): void {

        const goBack = () => Router.getInstance().navigate("home");

        const backBtn = document.getElementById("backBtn");

        if (backBtn) {
            backBtn.addEventListener("click", goBack);
        }

        const title = document.getElementById("categoryTitle");

        if (title) {
            title.textContent = Navigation.categoryName;
        }

        const container = document.getElementById("moviesGrid");

        if (!container) return;

        const movies = DataManager.movies.filter(
            movie => Number(movie.category_id) === Navigation.categoryId
        );

        let html = "";

        movies.forEach(movie => {

            const icon = movie.stream_icon
                ? `<img
                    src="${movie.stream_icon}"
                    alt="${movie.name}"
                    width="70"
                    height="70"
                    style="width:70px;height:70px;max-width:70px;max-height:70px;object-fit:contain;display:block;flex-shrink:0;"
                    onerror="this.style.display='none';this.parentElement.querySelector('.movie-placeholder').style.display='flex'"
                  ><div class="movie-placeholder" style="display:none">🎬</div>`
                : `<div class="movie-placeholder">🎬</div>`;

            html += `
<div class="movie-card" tabindex="0" data-id="${movie.stream_id}">
    ${icon}
    <span>${movie.name}</span>
</div>`;

        });

        container.innerHTML = html;

        const cards = container.querySelectorAll<HTMLElement>(".movie-card");

        cards.forEach((card, index) => {

            card.addEventListener("click", () => {
                Navigation.selectedMovie = movies[index];
                Router.getInstance().navigate("player");
            });

        });

        // Navegación con control remoto
        const focus = new FocusManager();

        focus.register(".movie-card");

        new Keyboard(focus, goBack);

    }

}