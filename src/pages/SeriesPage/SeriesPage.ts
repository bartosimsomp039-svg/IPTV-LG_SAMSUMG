import "./SeriesPage.css";

import { Header } from "../../components/Header";
import { DataManager } from "../../services/DataManager";
import { Navigation } from "../../services/Navigation";
import { Router } from "../../app/Router";
import { FocusManager } from "../../tv/FocusManager";
import { Keyboard } from "../../tv/Keyboard";

export class SeriesPage {

    public render(): string {
        const header = new Header();
        return `
<div class="series-page">
    ${header.render()}
    <div class="series-layout">
        <aside class="series-sidebar" id="seriesSidebar"></aside>
        <div class="series-main">
            <div class="series-toolbar">
                <button class="back-btn" id="backBtn">&#8592; Volver</button>
                <input class="series-search" id="seriesSearch" type="text" placeholder="🔍 Buscar...">
            </div>
            <div class="series-grid-container" id="seriesGridContainer">
                <div id="seriesGrid" class="series-grid"></div>
            </div>
        </div>
    </div>
</div>`;
    }

    public init(): void {

        const goBack = () => Router.getInstance().navigate("home");

        document.getElementById("backBtn")?.addEventListener("click", goBack);

        const categories = DataManager.seriesCategories;
        const allSeries = DataManager.series;

        let activeCategoryId: number | null = null;
        let searchQuery = "";

        // SIDEBAR
        const sidebar = document.getElementById("seriesSidebar")!;

        const totalItem = document.createElement("div");
        totalItem.className = "sidebar-item active";
        totalItem.innerHTML = `<span>TODO</span><span class="cat-count">${allSeries.length}</span>`;
        totalItem.addEventListener("click", () => {
            activeCategoryId = null;
            setActive(totalItem);
            renderGrid();
        });
        sidebar.appendChild(totalItem);

        categories.forEach(cat => {
            const count = allSeries.filter(
                s => String(s.category_id) === String(cat.category_id)
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

        // SEARCH
        document.getElementById("seriesSearch")?.addEventListener("input", (e) => {
            searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
            renderGrid();
        });

        // GRID
        const container = document.getElementById("seriesGrid")!;

        function renderGrid() {
            let filtered = activeCategoryId === null
                ? allSeries
                : allSeries.filter(s => Number(s.category_id) === activeCategoryId);

            if (searchQuery) {
                filtered = filtered.filter(s =>
                    s.name.toLowerCase().includes(searchQuery)
                );
            }

            if (filtered.length === 0) {
                container.innerHTML = `<div class="series-empty">No se encontraron resultados</div>`;
                return;
            }

            let page = 0;
            const PAGE_SIZE = 60;

            function renderPage() {
                const slice = filtered.slice(0, (page + 1) * PAGE_SIZE);
                container.innerHTML = slice.map((s, i) => {
                    const icon = s.cover
                        ? `<img src="${s.cover}" alt="${s.name}" loading="lazy"
                             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                           <div class="series-placeholder" style="display:none">📺</div>`
                        : `<div class="series-placeholder">📺</div>`;
                    return `<div class="series-card" tabindex="0" data-index="${i}">${icon}<span>${s.name}</span></div>`;
                }).join("");

                container.querySelectorAll<HTMLElement>(".series-card").forEach((card) => {
                    card.addEventListener("click", () => {
                        const idx = Number(card.dataset.index);
                        Navigation.type = "series";
                        Navigation.selectedSeries = filtered[idx];
                        Router.getInstance().navigate("series-detail");
                    });
                });

                const focus = new FocusManager();
                focus.register(".series-card");
                new Keyboard(focus, goBack);
            }

            renderPage();

            const scrollContainer = document.getElementById("seriesGridContainer");
            if (scrollContainer) {
                scrollContainer.onscroll = () => {
                    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
                    if (scrollTop + clientHeight >= scrollHeight - 300) {
                        if ((page + 1) * PAGE_SIZE < filtered.length) {
                            page++;
                            renderPage();
                        }
                    }
                };
            }
        }

        renderGrid();
    }
}