import "./SeriesDetail.css";

import { Navigation } from "../../services/Navigation";
import { Router } from "../../app/Router";
import { DataManager } from "../../services/DataManager";
import { FocusManager } from "../../tv/FocusManager";
import { Keyboard } from "../../tv/Keyboard";

export class SeriesDetail {

    private focus = new FocusManager();

    private currentSeason = "1";

    private episodes: Record<string, any[]> = {};

    public render(): string {

        return `<div class="series-detail"><div id="seriesDetailRoot"></div></div>`;

    }

    public init(): void {

        const series = Navigation.selectedSeries;

        const root = document.getElementById("seriesDetailRoot");

        if (!root || !series) {
            Router.getInstance().navigate("series");
            return;
        }

        const goBack = () => Router.getInstance().navigate("series");

        const poster = series.cover
            ? `<img src="${series.cover}"
                   alt="${series.name}"
                   onerror="this.style.display='none'"
               >`
            : `<span style="font-size:50px">📺</span>`;

        const plot = (series as any).plot ?? "";

        root.innerHTML = `

<button class="btn-series-back" id="btnSeriesBack">← Volver</button>

<div class="series-detail-hero">

    <div class="series-detail-poster">${poster}</div>

    <div class="series-detail-info">
        <h1>${series.name}</h1>
        ${plot ? `<p class="series-detail-plot">${plot}</p>` : ""}
    </div>

</div>

<div class="series-detail-body">
    <div class="series-loading" id="seriesStatus">Cargando temporadas...</div>
    <div class="season-tabs" id="seasonTabs" style="display:none"></div>
    <div class="episodes-grid" id="episodesGrid"></div>
</div>

`;

        document.getElementById("btnSeriesBack")
            ?.addEventListener("click", goBack);

        new Keyboard(this.focus, goBack);

        this.loadSeries(series.series_id, goBack);

    }

    private async loadSeries(seriesId: number, goBack: () => void): Promise<void> {

        const status = document.getElementById("seriesStatus");

        try {

            const info = await DataManager.getXtream().getSeriesInfo(seriesId);

            this.episodes = info?.episodes ?? {};

            const seasonKeys = Object.keys(this.episodes).sort(
                (a, b) => Number(a) - Number(b)
            );

            if (seasonKeys.length === 0) {

                if (status) status.textContent = "No se encontraron episodios.";

                return;

            }

            if (status) status.style.display = "none";

            const tabsContainer = document.getElementById("seasonTabs");

            if (tabsContainer) {

                tabsContainer.style.display = "flex";

                tabsContainer.innerHTML = seasonKeys.map(key => `
<button class="season-tab${key === this.currentSeason ? " active" : ""}"
        tabindex="0"
        data-season="${key}">
    Temporada ${key}
</button>`).join("");

                tabsContainer.querySelectorAll<HTMLButtonElement>(".season-tab")
                    .forEach(btn => {

                        btn.addEventListener("click", () => {

                            tabsContainer.querySelectorAll(".season-tab")
                                .forEach(t => t.classList.remove("active"));

                            btn.classList.add("active");

                            this.currentSeason = btn.dataset.season ?? "1";

                            this.renderEpisodes(goBack);

                        });

                    });

            }

            this.currentSeason = seasonKeys[0];

            this.renderEpisodes(goBack);

        } catch {

            if (status) {

                status.textContent = "Error al cargar la serie.";

                status.className = "series-error";

            }

        }

    }

    private renderEpisodes(goBack: () => void): void {

        const container = document.getElementById("episodesGrid");

        if (!container) return;

        const eps = this.episodes[this.currentSeason] ?? [];

        container.innerHTML = eps.map((ep: any) => {

            const thumb = ep.info?.movie_image
                ? `<img class="episode-thumb"
                       src="${ep.info.movie_image}"
                       alt="${ep.title ?? ""}"
                       onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
                   >
                   <div class="episode-thumb-placeholder" style="display:none">▶</div>`
                : `<div class="episode-thumb-placeholder">▶</div>`;

            return `
<div class="episode-card"
     tabindex="0"
     data-stream="${ep.id}"
     data-ext="${ep.container_extension ?? "mkv"}">
    ${thumb}
    <div class="episode-info">
        <div class="episode-num">E${ep.episode_num ?? ""}</div>
        <div class="episode-title">${ep.title ?? "Episodio"}</div>
    </div>
</div>`;

        }).join("");

        container.querySelectorAll<HTMLElement>(".episode-card")
            .forEach(card => {

                card.addEventListener("click", () => {

                    const streamId = Number(card.dataset.stream);
                    const ext = card.dataset.ext ?? "mkv";

                    Navigation.episodeStreamId = streamId;
                    Navigation.episodeExtension = ext;
                    Navigation.type = "series";

                    Router.getInstance().navigate("player");

                });

            });

        // Actualizar foco en el nuevo contenido
        this.focus.register(".episode-card");

        new Keyboard(this.focus, goBack);

    }

}