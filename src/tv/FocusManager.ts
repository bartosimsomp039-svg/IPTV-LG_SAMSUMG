export class FocusManager {

    private elements: HTMLElement[] = [];

    private current = 0;

    private columns = 1;

    public register(selector: string): void {

        this.elements = Array.from(
            document.querySelectorAll<HTMLElement>(selector)
        );

        this.columns = this.detectColumns();

        this.current = 0;

        if (this.elements.length > 0) {
            this.focus(0);
        }

    }

    // Detecta cuántas columnas tiene el grid mirando la posición Y del primer elemento
    private detectColumns(): number {

        if (this.elements.length < 2) return 1;

        const firstTop = this.elements[0].getBoundingClientRect().top;

        let count = 1;

        for (let i = 1; i < this.elements.length; i++) {

            const top = this.elements[i].getBoundingClientRect().top;

            if (Math.abs(top - firstTop) < 5) {
                count++;
            } else {
                break;
            }

        }

        return count;

    }

    public moveRight(): void {

        const col = this.current % this.columns;

        if (col < this.columns - 1 && this.current + 1 < this.elements.length) {
            this.focus(this.current + 1);
        }

    }

    public moveLeft(): void {

        const col = this.current % this.columns;

        if (col > 0) {
            this.focus(this.current - 1);
        }

    }

    public moveDown(): void {

        const next = this.current + this.columns;

        if (next < this.elements.length) {
            this.focus(next);
        }

    }

    public moveUp(): void {

        const prev = this.current - this.columns;

        if (prev >= 0) {
            this.focus(prev);
        }

    }

    public confirm(): void {

        this.elements[this.current]?.click();

    }

    // Compatibilidad con Login (usa next/previous)
    public next(): void { this.moveDown(); }

    public previous(): void { this.moveUp(); }

    private focus(index: number): void {

        this.elements.forEach(e => e.classList.remove("tv-focus"));

        this.current = index;

        this.elements[index].classList.add("tv-focus");

        this.elements[index].focus();

        this.elements[index].scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });

    }

}