(function () {
    const PARTIALS_DIR = "/components";

    async function loadComponent(el) {
        const name = el.getAttribute("data-component");
        if (!name) return;

        const url = `${PARTIALS_DIR}/${name}.html`;

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const html = await res.text();
            el.outerHTML = html;
        } catch (err) {
            console.error(`[components] falha ao carregar "${name}" (${url}):`, err);
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll("[data-component]").forEach(loadComponent);
    });
})();