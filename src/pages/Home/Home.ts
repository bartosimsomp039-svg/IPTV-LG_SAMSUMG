import "./Home.css";

import { DataManager } from "../../services/DataManager";
import { Navigation } from "../../services/Navigation";
import { Router } from "../../app/Router";

export class Home {

    public render(): string {
        return `<div class="home">
    <aside class="home-sidebar">
        <div class="sidebar-logo">
            <h1>🐺 WOLF IPTV</h1>
            <span>PREMIUM EXPERIENCE</span>
        </div>
        <nav class="sidebar-nav">
            <button class="nav-item" id="navLive">
                <span class="nav-icon">▶</span> TV EN VIVO
                <span class="nav-badge" id="liveCount">0</span>
            </button>
            <button class="nav-item" id="navMovies">
                <span class="nav-icon">🎬</span> PELÍCULAS
                <span class="nav-badge" id="moviesCount">0</span>
            </button>
            <button class="nav-item" id="navSeries">
                <span class="nav-icon">📺</span> SERIES
                <span class="nav-badge" id="seriesCount">0</span>
            </button>
            <button class="nav-item" id="navSettings">
                <span class="nav-icon">⚙</span> AJUSTES
            </button>
        </nav>
        <div class="sidebar-divider"></div>
        <div class="sidebar-bottom">
            <button class="sidebar-btn" id="btnChangeUser">👤 Cambiar Usuario</button>
            <button class="sidebar-btn logout" id="btnLogout">⏻ Cerrar Sesión</button>
        </div>
    </aside>

    <main class="home-featured">
        <div class="featured-bg" id="featuredBg"></div>
        <div class="featured-gradient"></div>
        <div class="featured-content">
            <div class="featured-badge">PELÍCULA</div>
            <h2 class="featured-title" id="featuredTitle">Cargando...</h2>
            <div class="featured-meta">
                <span id="featuredYear"></span>
                <span>HD</span>
            </div>
            <p class="featured-desc">Disfruta el mejor contenido premium.</p>
            <div class="featured-actions">
                <button class="btn-watch" id="btnWatch">▶ VER</button>
                <button class="btn-list">+ MI LISTA</button>
            </div>
        </div>
    </main>

    <aside class="home-right">
        <div class="right-topbar">
            <div class="right-welcome">
                <h2 id="welcomeUser">Bienvenido</h2>
                <p>Disfruta tu contenido favorito</p>
            </div>
            <div class="right-clock">
                <div class="clock-time" id="clockTime">--:--</div>
                <div class="clock-date" id="clockDate"></div>
            </div>
        </div>
        <div class="right-scroll">
            <div class="content-section">
                <div class="section-header">
                    <span class="section-title"><span class="dot">★</span> RECIENTEMENTE AÑADIDOS</span>
                    <button class="section-see-all" id="seeAllMovies">Ver todo ›</button>
                </div>
                <div class="h-scroll" id="recentMovies"></div>
            </div>
            <div class="content-section">
                <div class="section-header">
                    <span class="section-title"><span class="dot">★</span> SERIES DESTACADAS</span>
                    <button class="section-see-all" id="seeAllSeries">Ver todo ›</button>
                </div>
                <div class="h-scroll" id="recentSeries"></div>
            </div>
            <div class="content-section">
                <div class="section-header">
                    <span class="section-title"><span class="dot">★</span> CANALES EN VIVO</span>
                    <span class="section-count" id="liveTotal"></span>
                </div>
                <div class="h-scroll" id="liveChannels"></div>
            </div>
        </div>
    </aside>
</div>`;
    }

    public init(): void {

        const liveCount = document.getElementById("liveCount");
        const moviesCount = document.getElementById("moviesCount");
        const seriesCount = document.getElementById("seriesCount");
        const liveTotal = document.getElementById("liveTotal");

        if (liveCount) liveCount.textContent = String(DataManager.liveChannels.length);
        if (moviesCount) moviesCount.textContent = String(DataManager.movies.length);
        if (seriesCount) seriesCount.textContent = String(DataManager.series.length);
        if (liveTotal) liveTotal.textContent = `${DataManager.liveChannels.length} canales`;

        const creds = DataManager.getXtream().getCredentials();
        const welcomeEl = document.getElementById("welcomeUser");
        if (welcomeEl && creds.username) {
            welcomeEl.textContent = `Bienvenido ${creds.username.toUpperCase()}`;
        }

        const updateClock = () => {
            const now = new Date();
            const timeEl = document.getElementById("clockTime");
            const dateEl = document.getElementById("clockDate");
            if (timeEl) timeEl.textContent = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
            if (dateEl) dateEl.textContent = now.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
        };
        updateClock();
        setInterval(updateClock, 10000);

        const moviesWithCover = DataManager.movies.filter(m => m.stream_icon);
        const seriesWithCover = DataManager.series.filter(s => s.cover);

        if (moviesWithCover.length > 0) {
            const pick = moviesWithCover[Math.floor(Math.random() * Math.min(20, moviesWithCover.length))];
            const bgEl = document.getElementById("featuredBg");
            const titleEl = document.getElementById("featuredTitle");
            const yearEl = document.getElementById("featuredYear");
            if (bgEl) bgEl.style.backgroundImage = `url('${pick.stream_icon}')`;
            if (titleEl) titleEl.textContent = pick.name;
            if (yearEl && (pick as any).year) yearEl.textContent = (pick as any).year;
            document.getElementById("btnWatch")?.addEventListener("click", () => {
                Navigation.selectedMovie = pick;
                Router.getInstance().navigate("player");
            });
        }

        const recentMoviesEl = document.getElementById("recentMovies");
        if (recentMoviesEl) {
            const recent = moviesWithCover.slice(0, 15);
            recentMoviesEl.innerHTML = recent.map((m, i) =>
                `<div class="mini-card" data-index="${i}">
                    <img src="${m.stream_icon}" alt="${m.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                    <div class="mini-card-placeholder" style="display:none">🎬</div>
                    <div class="mini-card-info"><div class="mini-card-title">${m.name}</div></div>
                </div>`
            ).join("");
            recentMoviesEl.querySelectorAll<HTMLElement>(".mini-card").forEach((card, i) => {
                card.addEventListener("click", () => {
                    Navigation.selectedMovie = recent[i];
                    Router.getInstance().navigate("player");
                });
            });
        }

        const recentSeriesEl = document.getElementById("recentSeries");
        if (recentSeriesEl) {
            const recent = seriesWithCover.slice(0, 15);
            recentSeriesEl.innerHTML = recent.map((s, i) =>
                `<div class="mini-card" data-index="${i}">
                    <img src="${s.cover}" alt="${s.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                    <div class="mini-card-placeholder" style="display:none">📺</div>
                    <div class="mini-card-info"><div class="mini-card-title">${s.name}</div></div>
                </div>`
            ).join("");
            recentSeriesEl.querySelectorAll<HTMLElement>(".mini-card").forEach((card, i) => {
                card.addEventListener("click", () => {
                    Navigation.selectedSeries = recent[i];
                    Router.getInstance().navigate("series-detail");
                });
            });
        }

        const liveEl = document.getElementById("liveChannels");
        if (liveEl) {
            const channels = DataManager.liveChannels.filter(c => c.stream_icon).slice(0, 15);
            liveEl.innerHTML = channels.map((c, i) =>
                `<div class="mini-card" data-index="${i}">
                    <img src="${c.stream_icon}" alt="${c.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                    <div class="mini-card-placeholder" style="display:none">📡</div>
                    <div class="mini-card-info"><div class="mini-card-title">${c.name}</div></div>
                </div>`
            ).join("");
        }

        document.getElementById("navMovies")?.addEventListener("click", () => {
            Navigation.categoryId = 0;
            Navigation.categoryName = "PELÍCULAS";
            Router.getInstance().navigate("movies");
        });

        document.getElementById("navSeries")?.addEventListener("click", () => {
            Navigation.categoryId = 0;
            Navigation.categoryName = "SERIES";
            Router.getInstance().navigate("series");
        });

        document.getElementById("seeAllMovies")?.addEventListener("click", () => {
            Navigation.categoryId = 0;
            Navigation.categoryName = "PELÍCULAS";
            Router.getInstance().navigate("movies");
        });

        document.getElementById("seeAllSeries")?.addEventListener("click", () => {
            Navigation.categoryId = 0;
            Navigation.categoryName = "SERIES";
            Router.getInstance().navigate("series");
        });

        document.getElementById("btnChangeUser")?.addEventListener("click", () => {
            Router.getInstance().navigate("login");
        });

        document.getElementById("btnLogout")?.addEventListener("click", () => {
            DataManager.clear();
            Router.getInstance().navigate("login");
        });
    }
}