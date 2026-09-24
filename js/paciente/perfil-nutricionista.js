(function () {
    const id = Number(new URLSearchParams(window.location.search).get("id"));
    const nutri = window.NUTRICIONISTAS_MOCK.find((n) => n.id === id);

    if (!nutri) {
        document.getElementById("perfil-nao-encontrado").hidden = false;
        return;
    }

    const $ = (elId) => document.getElementById(elId);
    const iniciais = (nome) => nome.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
    const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
    const decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const dataCurta = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" });
    const dataAvaliacao = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
    const lerData = (iso) => new Date(`${iso}T12:00:00`);
    const estrelas = (nota) => {
        const cheias = Math.min(5, Math.max(0, Math.round(nota - 0.01)));
        return "★".repeat(cheias) + "☆".repeat(5 - cheias);
    };

    document.title = `${nutri.nome} | NutriLife`;

    $("perfil-avatar").textContent = iniciais(nutri.nome);
    $("perfil-crn").textContent = nutri.crn;
    $("perfil-nome").textContent = nutri.nome;
    $("perfil-especialidade").textContent = nutri.especialidade;
    $("perfil-distancia").textContent = `${decimal.format(nutri.distanciaKm)} km de você`;
    $("perfil-local").textContent = nutri.local;
    $("perfil-atendimento").textContent = nutri.atendimento.join(" e ");
    $("perfil-valor").textContent = moeda.format(nutri.valorConsulta);

    const total = nutri.avaliacoes.length;
    $("perfil-nota").textContent = `${decimal.format(nutri.nota)} / 5`;
    $("perfil-estrelas").textContent = estrelas(nutri.nota);
    $("perfil-total-avaliacoes").textContent = total === 1 ? "1 avaliação" : `${total} avaliações`;
    $("perfil-pacientes").textContent = nutri.pacientesAtendidos;
    $("perfil-desde").textContent = dataCurta.format(lerData(nutri.desde)).replace(" de ", "/").replace(".", "");

    $("perfil-bio").textContent = nutri.bio;
    $("perfil-especialidades").replaceChildren(...nutri.especialidades.map((nome) => {
        const li = document.createElement("li");
        li.className = "tag tag--outline";
        li.textContent = nome;
        return li;
    }));

    function criarResposta(resposta) {
        const div = document.createElement("div");
        div.className = "review__reply";
        div.innerHTML = `
            <span class="review__reply-label">Resposta de <strong></strong></span>
            <p></p>
            <time class="review__date"></time>
        `;
        div.querySelector("strong").textContent = nutri.nome;
        div.querySelector("p").textContent = resposta.texto;
        const data = div.querySelector("time");
        data.dateTime = resposta.data;
        data.textContent = dataAvaliacao.format(lerData(resposta.data));
        return div;
    }

    $("avaliacoes-contagem").textContent = $("perfil-total-avaliacoes").textContent;
    $("avaliacoes-vazio").hidden = total > 0;
    $("perfil-avaliacoes").replaceChildren(...nutri.avaliacoes.map((a) => {
        const autor = a.autor || "Anônimo";
        const li = document.createElement("li");
        li.className = "review";
        li.innerHTML = `
            <span class="review__avatar" aria-hidden="true"></span>
            <div class="review__body">
                <div class="review__head">
                    <strong></strong>
                    <span class="review__stars"></span>
                </div>
                <p></p>
                <time class="review__date"></time>
            </div>
        `;
        li.querySelector(".review__avatar").textContent = a.autor ? iniciais(a.autor) : "?";
        li.querySelector("strong").textContent = autor;
        const stars = li.querySelector(".review__stars");
        stars.textContent = estrelas(a.nota);
        stars.setAttribute("aria-label", `Nota ${a.nota} de 5`);
        li.querySelector("p").textContent = a.comentario;
        const data = li.querySelector("time");
        data.dateTime = a.data;
        data.textContent = dataAvaliacao.format(lerData(a.data));

        if (a.resposta) li.querySelector(".review__body").append(criarResposta(a.resposta));
        return li;
    }));

    $("marcar-consulta").href = `/pages/paciente/agenda-nutricionista.html?id=${nutri.id}`;

    $("perfil").hidden = false;
})();
