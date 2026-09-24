(function () {
    const pacienteMock = { nome: "Julia" };

    const nutricionistas = window.NUTRICIONISTAS_MOCK;

    const lista = document.getElementById("nutri-list");
    const vazio = document.getElementById("nutri-empty");
    const contador = document.getElementById("nutri-count");
    const chips = document.querySelectorAll(".distance-filter .chip");
    const filtroEspecialidade = document.getElementById("filtro-especialidade");
    let limiteKm = Infinity;

    const iniciais = (nome) => nome.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
    const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
    const km = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

    function saudacao() {
        document.getElementById("nome-paciente").textContent = pacienteMock.nome;
        document.getElementById("avatar-paciente").textContent = iniciais(pacienteMock.nome);

        document.getElementById("data-hoje").textContent =
            new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());
    }

    function criarItem(n) {
        const li = document.createElement("li");
        li.className = "nutri-card";
        li.innerHTML = `
            <div class="nutri-card__top">
                <span class="nutri-card__avatar" aria-hidden="true"></span>
                <div class="nutri-card__info">
                    <strong></strong>
                    <span class="nutri-card__specialty"></span>
                </div>
                <span class="nutri-card__distance"></span>
            </div>
            <div class="nutri-card__bottom">
                <span class="nutri-card__price">Consulta <strong></strong></span>
                <a class="btn btn--primary nutri-card__btn">Ver perfil</a>
            </div>
        `;

        li.querySelector(".nutri-card__avatar").textContent = iniciais(n.nome);
        li.querySelector(".nutri-card__info strong").textContent = n.nome;
        li.querySelector(".nutri-card__specialty").textContent = n.especialidade;
        li.querySelector(".nutri-card__distance").textContent = `${km.format(n.distanciaKm)} km`;
        li.querySelector(".nutri-card__price strong").textContent = moeda.format(n.valorConsulta);

        const btn = li.querySelector(".nutri-card__btn");
        btn.href = `/pages/paciente/perfil-nutricionista.html?id=${n.id}`;
        btn.setAttribute("aria-label", `Ver perfil de ${n.nome}`);
        return li;
    }

    function renderizar() {
        const filtrados = nutricionistas
            .filter((n) => n.distanciaKm <= limiteKm)
            .filter((n) => !filtroEspecialidade.value || n.especialidade === filtroEspecialidade.value)
            .sort((a, b) => a.distanciaKm - b.distanciaKm);

        lista.replaceChildren(...filtrados.map(criarItem));
        vazio.hidden = filtrados.length > 0;
        contador.textContent = filtrados.length === 1
            ? "1 nutricionista encontrado"
            : `${filtrados.length} nutricionistas encontrados`;
    }

    chips.forEach((chip) => {
        chip.addEventListener("click", () => {
            chips.forEach((c) => {
                c.classList.toggle("chip--active", c === chip);
                c.setAttribute("aria-pressed", String(c === chip));
            });
            limiteKm = Number(chip.dataset.distancia) || Infinity;
            renderizar();
        });
    });

    window.preencherEspecialidades(filtroEspecialidade);
    filtroEspecialidade.addEventListener("change", renderizar);

    saudacao();
    renderizar();
})();
