import "./Movies.css";

import { Header } from "../../components/Header";
import { DataManager } from "../../services/DataManager";
import { Router } from "../../app/Router";
import { FocusManager } from "../../tv/FocusManager";
import { Keyboard } from "../../tv/Keyboard";
import { Navigation } from "../../services/Navigation";

export class Movies {

    public render(): string {
        const header = new Header();
        return `
<div class="movies">
    ${header.render()}
    <div class="movies-layout">
        <aside class="movies-sidebar" id="moviesSidebar"></aside>
        <div class="movies-main">
            <div class="movies-toolbar">
                <button class="back-btn" id="backBtn">&#8592; Volver</button>
                <input class="movies-search" id="moviesSearch" type="text" placeholder="🔍 Buscar...">
            </div>
            <div class="movies-grid-container">
                <div id="moviesGrid" class="movies-grid"></div>
            </div>
        </div>
    </div>
</div>`;
    }

    public init(): void {

        const goBack = () => Router.getInstance().navigate("home");

        document.getElementById("backBtn")
            ?.addEventListener("click", goBack);

        const categories = DataManager.movieCategories;
        const allMovies = DataManager.movies;

        let activeCategoryId: number | null = null;
        let searchQuery = "";

        // ── SIDEBAR ──────────────────────────────────────
        const sidebar = document.getElementById("moviesSidebar")!;

        const totalItem = document.createElement("div");
        totalItem.className = "sidebar-item active";
        totalItem.innerHTML = `<span>TODO</span><span class="cat-count">${allMovies.length}</span>`;
        totalItem.addEventListener("click", () => {
            activeCategoryId = null;
            setActive(totalItem);
            renderGrid();
        });
        sidebar.appendChild(totalItem);

        categories.forEach(cat => {
            const count = allMovies.filter(
                m => String(m.category_id) === String(cat.category_id)
            ).length;
            const item = document.createElement("div");
            item.className = "sidebar-item";
            item.innerHTML = `<span>${cat.category_name}</span><span class="cat-count">${count}</span>`;
            item.addEventListener("click", () => {
                activeCategoryId = Number(cat.category_id);
                setActive(item);
                renderGrid();
            });
            sidebar.appendChild(item);
        });

        function setActive(el: HTMLElement) {
            sidebar.querySelectorAll(".sidebar-item")
                .forEach(i => i.classList.remove("active"));
            el.classList.add("active");
        }

        // ── SEARCH ───────────────────────────────────────
        document.getElementById("moviesSearch")
            ?.addEventListener("input", (e) => {
                searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
                renderGrid();
            });

        // ── GRID ─────────────────────────────────────────
        const container = document.getElementById("moviesGrid")!;

        function renderGrid() {
            let filtered = activeCategoryId === null
                ? allMovies
                : allMovies.filter(m => Number(m.category_id) === activeCategoryId);

            if (searchQuery) {
                filtered = filtered.filter(m =>
                    m.name.toLowerCase().includes(searchQuery)
                );
            }

            if (filtered.length === 0) {
                container.innerHTML = `<div class="movies-empty">No se encontraron resultados</div>`;
                return;
            }

            container.innerHTML = filtered.map((movie, i) => {
                const icon = movie.stream_icon
                    ? `<img src="${movie.stream_icon}" alt="${movie.name}"
                         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                       <div class="movie-placeholder" style="display:none">🎬</div>`
                    : `<div class="movie-placeholder">🎬</div>`;

                return `<div class="movie-card" tabindex="0" data-index="${i}">
                    ${icon}
                    <span>${movie.name}</span>
                </div>`;
            }).join("");

            container.querySelectorAll<HTMLElement>(".movie-card")
                .forEach((card) => {
                    card.addEventListener("click", () => {
                        const idx = Number(card.dataset.index);
                        const movie = filtered[idx];
                        if (movie) {
                            Navigation.selectedMovie = movie;
                            Router.getInstance().navigate("player");
                        }
                    });
                });

            const focus = new FocusManager();
            focus.register(".movie-card");
            new Keyboard(focus, goBack);
        }

        renderGrid();
    }
}