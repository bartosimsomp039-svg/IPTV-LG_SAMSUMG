import { FocusManager } from "./FocusManager";

export class Keyboard {

    // Reemplaza el listener anterior al cambiar de página
    private static currentHandler: ((e: KeyboardEvent) => void) | null = null;

    constructor(focus: FocusManager, onBack?: () => void) {

        if (Keyboard.currentHandler) {
            window.removeEventListener("keydown", Keyboard.currentHandler);
        }

        const handler = (e: KeyboardEvent) => {

            switch (e.key) {

                case "ArrowUp":
                    e.preventDefault();
                    focus.moveUp();
                    break;

                case "ArrowDown":
                    e.preventDefault();
                    focus.moveDown();
                    break;

                case "ArrowLeft":
                    e.preventDefault();
                    focus.moveLeft();
                    break;

                case "ArrowRight":
                    e.preventDefault();
                    focus.moveRight();
                    break;

                case "Enter":
                    e.preventDefault();
                    focus.confirm();
                    break;

                // Botón Atrás — Samsung, LG, controles estándar
                case "Escape":
                case "GoBack":
                case "XF86Back":
                    e.preventDefault();
                    onBack?.();
                    break;

            }

        };

        Keyboard.currentHandler = handler;

        window.addEventListener("keydown", handler);

    }

}