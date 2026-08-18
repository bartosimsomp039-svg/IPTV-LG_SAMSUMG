import "./Login.css";
import { FocusManager } from "../../tv/FocusManager";
import { Keyboard } from "../../tv/Keyboard";
import { DataManager } from "../../services/DataManager";

export class Login {

    public render(): string {

        return `
<div class="login">

    <video
  class="backgroundVideo"
  autoplay
  muted
  loop
  playsinline
  aria-hidden="true"
>
  <source src="/videos/login.mp4" type="video/mp4">
</video>

    <div class="panel">

        <div class="logo">
            <h1>🐺 WOLF IPTV</h1>
            <span>Premium Smart TV</span>
        </div>

        <div class="tabs">

            <button id="tabXtream" class="tab active">
                XTREAM
            </button>

            <button id="tabM3U" class="tab">
                M3U
            </button>

        </div>

        <div id="content"></div>

    </div>

</div>
`;

    }

    public init(): void {

        const content = document.getElementById("content");

        if (!content) return;

        const focus = new FocusManager();

        new Keyboard(focus);

        const updateFocus = () => {

            focus.register("button,input");

            const button = document.querySelector(".loginButton");

            if (button instanceof HTMLButtonElement) {

                button.onclick = async () => {

                    if (button.textContent?.includes("CARGAR")) {

                        alert("La carga M3U se implementará en el siguiente paso.");

                        return;

                    }

                    const host = (document.getElementById("host") as HTMLInputElement).value;
                    const user = (document.getElementById("user") as HTMLInputElement).value;
                    const pass = (document.getElementById("pass") as HTMLInputElement).value;

                    button.disabled = true;
                    button.textContent = "CONECTANDO...";

                    const ok = await DataManager.login(host,user,pass);

                    if (ok) { 

                        localStorage.setItem("iptv_host", host);   // ← agregar
                        localStorage.setItem("iptv_user", user);   // ← agregar
                        localStorage.setItem("iptv_pass", pass);   // ← agregar

                        window.dispatchEvent(
                            new CustomEvent("login-success")
                        );

                    } else {

                        alert("No fue posible iniciar sesión.");

                        button.disabled = false;
                        button.textContent = "INICIAR SESIÓN";

                    }

                };

            }

        };

        const showXtream = () => {

            content.innerHTML = `

<input id="host" placeholder="Servidor">

<input id="user" placeholder="Usuario">

<input id="pass" type="password" placeholder="Contraseña">

<button class="loginButton">

INICIAR SESIÓN

</button>

`;

            updateFocus();

        };

        const showM3U = () => {

            content.innerHTML = `

<input id="m3u" placeholder="URL M3U">

<button class="loginButton">

CARGAR LISTA

</button>

`;

            updateFocus();

        };

        showXtream();

        const tabXtream = document.getElementById("tabXtream");
        const tabM3U = document.getElementById("tabM3U");

        if (tabXtream && tabM3U) {

            tabXtream.onclick = () => {

                tabXtream.classList.add("active");
                tabM3U.classList.remove("active");

                showXtream();

            };

            tabM3U.onclick = () => {

                tabM3U.classList.add("active");
                tabXtream.classList.remove("active");

                showM3U();

            };

        }

    }

}   