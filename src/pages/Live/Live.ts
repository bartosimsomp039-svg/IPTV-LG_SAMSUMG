import "./Live.css";

import { Header } from "../../components/Header";
import { ChannelCard } from "../../components/ChannelCard";
import { DataManager } from "../../services/DataManager";
import { Navigation } from "../../services/Navigation";
import { Router } from "../../app/Router";
import { FocusManager } from "../../tv/FocusManager";
import { Keyboard } from "../../tv/Keyboard";

export class Live {
  public render(): string {
    const header = new Header();

    return `
<div class="live">
    ${header.render()}

    <div class="live-topbar">
        <button class="back-btn" id="backBtn" aria-label="Volver al inicio">
            <span class="back-btn-icon">&#8592;</span>
            <span>Volver</span>
        </button>

        <div class="live-heading">
            <span class="live-eyebrow"><span class="live-dot"></span> EN DIRECTO</span>
            <h1 id="categoryTitle">TV EN VIVO</h1>
            <p id="channelCount" class="channel-count"></p>
        </div>

        <div class="live-status" aria-label="Estado del servicio">
            <span class="status-signal"></span>
            <span>Servicio activo</span>
            <strong id="liveClock"></strong>
        </div>
    </div>

    <div class="live-body">
        <!-- Sidebar de categorías -->
        <aside class="live-sidebar" id="liveSidebar" aria-label="Categorías"></aside>

        <!-- Panel derecho: búsqueda + grid -->
        <div class="live-panel">
            <div class="live-toolbar">
                <label class="search-box" for="channelSearch">
                    <span class="search-icon" aria-hidden="true">&#9906;</span>
                    <input
                        id="channelSearch"
                        type="search"
                        autocomplete="off"
                        placeholder="Buscar canal..."
                        aria-label="Buscar canal"
                    />
                    <kbd>CTRL K</kbd>
                </label>
                <div class="view-label"><span class="view-label-dot"></span> Todos los canales</div>
            </div>

            <div id="liveChannels" class="channel-grid"></div>
        </div>
    </div>

    <div class="remote-hint" aria-hidden="true">
        <span><b>OK</b> Seleccionar</span>
        <span><b>&#8593;&#8595;</b> Navegar</span>
        <span><b>BACK</b> Volver</span>
    </div>
</div>
`;
  }

  public init(): void {
    const goBack = () => Router.getInstance().navigate("home");
    const backBtn = document.getElementById("backBtn");
    const container = document.getElementById("liveChannels");
    const sidebar = document.getElementById("liveSidebar");
    const search = document.getElementById("channelSearch") as HTMLInputElement | null;
    const count = document.getElementById("channelCount");
    const clock = document.getElementById("liveClock");
    const titleEl = document.getElementById("categoryTitle");

    if (!container || !sidebar) return;

    backBtn?.addEventListener("click", goBack);

    // ── Construir mapa category_id → category_name ───────────
    // Intenta los nombres más comunes que usa DataManager
    const dm = DataManager as any;
    const rawCats: any[] =
      dm.liveCategories ??
      dm.categories ??
      dm.liveCats ??
      dm.channelCategories ??
      [];

    const catNameById = new Map<string, string>();
    rawCats.forEach((cat: any) => {
      const id = String(cat.category_id ?? cat.id ?? "");
      const name: string = cat.category_name ?? cat.name ?? "";
      if (id && name) catNameById.set(id, name);
    });

    // Función auxiliar: obtiene el nombre real de la categoría
    const resolveCatName = (channel: any): string =>
      channel.category_name ||                          // ya viene en el canal
      catNameById.get(String(channel.category_id)) ||   // buscado en las categorías
      String(channel.category_id);                       // último recurso: solo el ID

    // ── Canales a mostrar ────────────────────────────────────
    const allChannels =
      Navigation.categoryId === 0
        ? DataManager.liveChannels
        : DataManager.liveChannels.filter(
            (channel) => Number(channel.category_id) === Navigation.categoryId,
          );

    // ── Agrupar por nombre de categoría ─────────────────────
    const grouped = new Map<string, typeof allChannels>();
    allChannels.forEach((channel) => {
      const categoryName = resolveCatName(channel);
      if (!grouped.has(categoryName)) grouped.set(categoryName, []);
      grouped.get(categoryName)!.push(channel);
    });

    // Categoría activa: "TODO" por defecto
    let activeCategory = "TODO";

    // ── Renderizar sidebar ───────────────────────────────────
    const renderSidebar = (): void => {
      let html = `
        <div class="sidebar-item ${activeCategory === "TODO" ? "active" : ""}"
             data-category="TODO" tabindex="0">
          <span>TODO</span>
          <span class="sidebar-count">${allChannels.length}</span>
        </div>
      `;

      grouped.forEach((channels, categoryName) => {
        html += `
          <div class="sidebar-item ${activeCategory === categoryName ? "active" : ""}"
               data-category="${categoryName}" tabindex="0">
            <span>${categoryName}</span>
            <span class="sidebar-count">${channels.length}</span>
          </div>
        `;
      });

      sidebar.innerHTML = html;

      sidebar.querySelectorAll<HTMLElement>(".sidebar-item").forEach((item) => {
        const select = () => {
          activeCategory = item.dataset.category ?? "TODO";
          renderSidebar();
          renderChannels(search?.value ?? "");
          if (titleEl) {
            titleEl.textContent =
              activeCategory === "TODO" ? "TV EN VIVO" : activeCategory;
          }
          // Scroll al inicio del panel al cambiar categoría
          document.querySelector(".live-panel")?.scrollTo({ top: 0, behavior: "smooth" });
        };
        item.addEventListener("click", select);
        item.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); }
        });
      });
    };

    // ── Renderizar canales ───────────────────────────────────
    const renderChannels = (query = ""): void => {
      const normalizedQuery = query.trim().toLocaleLowerCase();

      const baseChannels =
        activeCategory === "TODO"
          ? allChannels
          : grouped.get(activeCategory) ?? [];

      const visibleChannels = baseChannels.filter((channel) => {
        if (!normalizedQuery) return true;
        const searchable = [
          (channel as any).name,
          (channel as any).title,
          (channel as any).stream_name,
          (channel as any).channel_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase();
        return searchable.includes(normalizedQuery);
      });

      if (count) {
        count.textContent = `${visibleChannels.length} ${
          visibleChannels.length === 1 ? "canal disponible" : "canales disponibles"
        }`;
      }

      if (!visibleChannels.length) {
        container.innerHTML = `
          <div class="live-empty" style="grid-column:1/-1">
            <div class="empty-icon">&#9906;</div>
            <h2>No encontramos ese canal</h2>
            <p>Prueba con otro nombre o limpia la búsqueda para ver toda la programación.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = visibleChannels
        .map((channel) => new ChannelCard(channel).render())
        .join("");

      container.querySelectorAll<HTMLElement>(".channel-card").forEach((card, index) => {
        card.setAttribute("tabindex", "0");
        card.addEventListener("click", () => {
          Navigation.selectedChannel = visibleChannels[index];
          Router.getInstance().navigate("player");
        });
        card.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            Navigation.selectedChannel = visibleChannels[index];
            Router.getInstance().navigate("player");
          }
        });
      });
    };

    // ── Búsqueda ─────────────────────────────────────────────
    search?.addEventListener("input", () => renderChannels(search.value));
    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        search?.focus();
      }
    });

    // ── Reloj ────────────────────────────────────────────────
    const updateClock = (): void => {
      if (clock) {
        clock.textContent = new Intl.DateTimeFormat("es-MX", {
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date());
      }
    };
    updateClock();
    window.setInterval(updateClock, 30000);

    // ── Render inicial ───────────────────────────────────────
    if (titleEl) {
      titleEl.textContent = Navigation.categoryName || "TV EN VIVO";
    }
    renderSidebar();
    renderChannels();

    const focus = new FocusManager();
    focus.register(".channel-card");
    new Keyboard(focus, goBack);
  }
}
