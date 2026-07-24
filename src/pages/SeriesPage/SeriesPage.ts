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

    <div class="series-content">

        <button class="back-btn" id="backBtn">&#8592; Volver</button>

        <h1 id="categoryTitle">📺 SERIES</h1>

        <div id="seriesGrid" class="series-grid"></div>

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

        const container = document.getElementById("seriesGrid");

        if (!container) return;

        const series = DataManager.series.filter(
            s => Number(s.category_id) === Navigation.categoryId
        );

        let html = "";

        series.forEach(s => {

            const icon = s.cover
    ? `<img
        src="${s.cover}"
        alt="${s.name}"
        onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
      ><div class="series-placeholder" style="display:none">📺</div>`
    : `<div class="series-placeholder">📺</div>`;

            html += `
<div class="series-card" tabindex="0" data-id="${s.series_id}">
    ${icon}
    <span>${s.name}</span>
</div>`;

        });

        container.innerHTML = html;

        const cards = container.querySelectorAll<HTMLElement>(".series-card");

        cards.forEach((card, index) => {

            card.addEventListener("click", () => {
                Navigation.selectedSeries = series[index];
                Router.getInstance().navigate("series-detail");
            });

        });

        // Navegación con control remoto
        const focus = new FocusManager();

        focus.register(".series-card");

        new Keyboard(focus, goBack);

    }

}