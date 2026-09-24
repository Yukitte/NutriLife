(function () {
    const id = Number(new URLSearchParams(window.location.search).get("id"));
    const nutri = window.NUTRICIONISTAS_MOCK.find((n) => n.id === id);

    if (!nutri) {
        document.getElementById("agenda-nao-encontrada").hidden = false;
        return;
    }

    const $ = (elId) => document.getElementById(elId);
    const iniciais = (nome) => nome.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
    const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
    const tituloMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
    const dataLonga = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    const chaveDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const lerChave = (chave) => new Date(`${chave}T12:00:00`);
    const capitalizar = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const primeiroMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 1);

    let mesVisivel = new Date(primeiroMes);
    let diaSelecionado = null;
    let horaSelecionada = null;
    let consulta = null;
    const agendas = {};

    const grid = $("calendar-grid");
    const form = $("booking-form");
    const vazio = $("booking-vazio");
    const sucesso = $("booking-sucesso");
    const confirmar = $("confirmar");

    function agendaDoMes(data) {
        const chave = `${data.getFullYear()}-${data.getMonth()}`;
        if (!agendas[chave]) agendas[chave] = window.gerarAgendaMock(nutri.id, data.getFullYear(), data.getMonth());
        return agendas[chave];
    }

    function statusDoDia(data) {
        const chave = chaveDe(data);
        const dia = agendaDoMes(data)[chave];

        if (consulta && consulta.chave === chave) return { tipo: "marcada", texto: "Sua consulta", detalhe: consulta.hora };
        if (data <= hoje) return { tipo: "passado" };
        if (!dia) return { tipo: "sem-atendimento", texto: "Sem atendimento" };
        if (dia.fechada) return { tipo: "fechada", texto: "Agenda fechada" };
        if (!dia.horarios.length) return { tipo: "fechada", texto: "Lotado" };
        if (dia.horarios.length === 1) return { tipo: "ultima", texto: "Última vaga", detalhe: dia.horarios[0] };
        return {
            tipo: "disponivel",
            texto: `${dia.horarios.length} horários`,
            detalhe: `${dia.horarios[0]} – ${dia.horarios[dia.horarios.length - 1]}`
        };
    }

    function renderizarCalendario() {
        const ano = mesVisivel.getFullYear();
        const mes = mesVisivel.getMonth();
        const inicioSemana = new Date(ano, mes, 1).getDay();
        const totalDias = new Date(ano, mes + 1, 0).getDate();

        $("calendar-titulo").textContent = capitalizar(tituloMes.format(mesVisivel));
        $("mes-anterior").disabled = mesVisivel <= primeiroMes;
        $("mes-seguinte").disabled = mesVisivel >= ultimoMes;

        const celulas = [];
        for (let i = 0; i < inicioSemana; i++) {
            const vaziaEl = document.createElement("span");
            vaziaEl.className = "day day--vazio";
            celulas.push(vaziaEl);
        }

        for (let dia = 1; dia <= totalDias; dia++) {
            const data = new Date(ano, mes, dia);
            const chave = chaveDe(data);
            const status = statusDoDia(data);
            const clicavel = ["disponivel", "ultima", "marcada"].includes(status.tipo);

            const el = document.createElement(clicavel ? "button" : "div");
            el.className = `day day--${status.tipo}`;
            if (chave === diaSelecionado) el.classList.add("day--selecionado");
            if (data.getTime() === hoje.getTime()) el.classList.add("day--hoje");

            el.innerHTML = `
                <span class="day__numero"></span>
                <span class="day__texto"></span>
                <span class="day__detalhe"></span>
            `;
            el.querySelector(".day__numero").textContent = dia;
            el.querySelector(".day__texto").textContent = status.texto || "";
            el.querySelector(".day__detalhe").textContent = status.detalhe || "";

            if (clicavel) {
                el.type = "button";
                el.setAttribute("aria-label", `${dataLonga.format(data)}: ${status.texto}${status.detalhe ? `, ${status.detalhe}` : ""}`);
                el.addEventListener("click", () => selecionarDia(chave));
            }

            celulas.push(el);
        }

        grid.replaceChildren(...celulas);
    }

    function mostrarPainel(painel) {
        vazio.hidden = painel !== vazio;
        form.hidden = painel !== form;
        sucesso.hidden = painel !== sucesso;
    }

    function selecionarDia(chave) {
        diaSelecionado = chave;
        horaSelecionada = null;
        confirmar.disabled = true;
        renderizarCalendario();

        if (consulta && consulta.chave === chave) {
            mostrarSucesso();
            return;
        }

        const data = lerChave(chave);
        const horarios = agendaDoMes(data)[chave].horarios;

        $("booking-data").textContent = capitalizar(dataLonga.format(data));
        $("horarios").replaceChildren(...horarios.map((hora) => {
            const botao = document.createElement("button");
            botao.type = "button";
            botao.className = "time-slot";
            botao.textContent = hora;
            botao.setAttribute("role", "radio");
            botao.setAttribute("aria-checked", "false");
            botao.addEventListener("click", () => {
                horaSelecionada = hora;
                confirmar.disabled = false;
                $("horarios").querySelectorAll(".time-slot").forEach((b) => {
                    const ativo = b === botao;
                    b.classList.toggle("time-slot--ativo", ativo);
                    b.setAttribute("aria-checked", String(ativo));
                });
            });
            return botao;
        }));

        mostrarPainel(form);
    }

    function mostrarSucesso() {
        const data = lerChave(consulta.chave);
        $("booking-sucesso-texto").textContent =
            `${capitalizar(dataLonga.format(data))}, às ${consulta.hora}, com ${nutri.nome} (${consulta.modalidade.toLowerCase()}).`;
        mostrarPainel(sucesso);
    }

    function montarModalidades() {
        $("modalidades").replaceChildren(...nutri.atendimento.map((tipo, i) => {
            const label = document.createElement("label");
            label.className = "mode-option";
            label.innerHTML = `<input type="radio" name="modalidade"><span></span>`;
            const input = label.querySelector("input");
            input.value = tipo;
            input.checked = i === 0;
            label.querySelector("span").textContent = tipo;
            return label;
        }));
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!diaSelecionado || !horaSelecionada) return;

        const modalidade = form.querySelector("input[name='modalidade']:checked").value;

        if (consulta) {
            const anterior = agendaDoMes(lerChave(consulta.chave))[consulta.chave];
            anterior.horarios = [...anterior.horarios, consulta.hora].sort();
        }

        const dia = agendaDoMes(lerChave(diaSelecionado))[diaSelecionado];
        dia.horarios = dia.horarios.filter((h) => h !== horaSelecionada);
        consulta = { chave: diaSelecionado, hora: horaSelecionada, modalidade };

        window.agendarConsultaMock({ nutricionistaId: nutri.id, data: consulta.chave, hora: consulta.hora, modalidade });

        renderizarCalendario();
        mostrarSucesso();
    });

    $("marcar-outra").addEventListener("click", () => {
        diaSelecionado = null;
        renderizarCalendario();
        mostrarPainel(vazio);
    });

    $("mes-anterior").addEventListener("click", () => {
        mesVisivel = new Date(mesVisivel.getFullYear(), mesVisivel.getMonth() - 1, 1);
        renderizarCalendario();
    });

    $("mes-seguinte").addEventListener("click", () => {
        mesVisivel = new Date(mesVisivel.getFullYear(), mesVisivel.getMonth() + 1, 1);
        renderizarCalendario();
    });

    document.title = `Agenda de ${nutri.nome} | NutriLife`;
    $("voltar-perfil").href = `/pages/paciente/perfil-nutricionista.html?id=${nutri.id}`;
    $("agenda-avatar").textContent = iniciais(nutri.nome);
    $("agenda-nome").textContent = `Agenda de ${nutri.nome}`;
    $("agenda-resumo").textContent = `${nutri.especialidade} · Consulta ${moeda.format(nutri.valorConsulta)} · ${nutri.atendimento.join(" e ")}`;
    $("booking-valor").textContent = moeda.format(nutri.valorConsulta);

    montarModalidades();
    renderizarCalendario();
    $("agenda").hidden = false;
})();
