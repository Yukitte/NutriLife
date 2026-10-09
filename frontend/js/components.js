(function () {
    async function loadComponent(el) {
        const name = el.getAttribute("data-component");
        if (!name) return;

        const raiz = el.getAttribute("data-raiz") || "./";
        const url = `${raiz}components/${name}.html`;

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const template = document.createElement("template");
            template.innerHTML = (await res.text()).replaceAll("{{raiz}}", raiz);
            const ativo = el.dataset.ativo && template.content.getElementById(el.dataset.ativo);
            if (ativo) {
                ativo.classList.add("is-active");
                ativo.setAttribute("aria-current", "page");
            }
            el.replaceWith(template.content);
        } catch (err) {
            console.error(`[components] falha ao carregar "${name}" (${url}):`, err);
        }
    }

    window.componentesCarregados = Promise.all(
        [...document.querySelectorAll("[data-component]")].map(loadComponent),
    );
})();
