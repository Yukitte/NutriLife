(function () {
    const form = document.getElementById("cadastro-form");
    const feedback = form.querySelector(".auth-feedback");
    const telefone = document.getElementById("telefone");
    const cep = document.getElementById("cep");
    const tipo = document.getElementById("tipo");
    const crnField = document.getElementById("crn-field");
    const crn = document.getElementById("crn");
    const especialidadeField = document.getElementById("especialidade-field");
    const especialidade = document.getElementById("especialidade");
    const cepHint = document.getElementById("cep-hint");
    const rua = document.getElementById("rua");
    const numero = document.getElementById("numero");
    const bairro = document.getElementById("bairro");
    const cidade = document.getElementById("cidade");
    const estado = document.getElementById("estado");
    const senha = document.getElementById("senha");
    const confirmarSenha = document.getElementById("confirmar-senha");

    function cadastrarMock(dados) {
        const { senha: _senha, ...dadosSemSenha } = dados;
        console.info("[mock] cadastro:", dadosSemSenha);
    }

    const somenteDigitos = (valor) => valor.replace(/\D/g, "");

    telefone.addEventListener("input", () => {
        const d = somenteDigitos(telefone.value).slice(0, 11);
        let v = d;
        if (d.length > 2) v = `(${d.slice(0, 2)}) ${d.slice(2)}`;
        if (d.length > 6) {
            const meio = d.length === 11 ? 7 : 6;
            v = `(${d.slice(0, 2)}) ${d.slice(2, meio)}-${d.slice(meio)}`;
        }
        telefone.value = v;
    });

    const mostrarDicaCep = (texto, erro = false) => {
        cepHint.textContent = texto;
        cepHint.classList.toggle("field-hint--erro", erro);
    };

    async function buscarCep(digitos) {
        mostrarDicaCep("Buscando endereço...");
        try {
            const res = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const dados = await res.json();

            if (somenteDigitos(cep.value) !== digitos) return;

            if (dados.erro) {
                mostrarDicaCep("CEP não encontrado. Preencha o endereço manualmente.", true);
                return;
            }

            rua.value = dados.logradouro || "";
            bairro.value = dados.bairro || "";
            cidade.value = dados.localidade || "";
            estado.value = dados.uf || "";
            mostrarDicaCep("Endereço encontrado. Confira e informe o número.");
            numero.focus();
        } catch (err) {
            console.error("[cadastro] falha ao consultar o CEP:", err);
            mostrarDicaCep("Não foi possível buscar o CEP. Preencha o endereço manualmente.", true);
        }
    }

    cep.addEventListener("input", () => {
        const d = somenteDigitos(cep.value).slice(0, 8);
        cep.value = d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;

        if (d.length === 8) buscarCep(d);
        else mostrarDicaCep("Digite o CEP para preencher o endereço.");
    });

    const validarConfirmacao = () => {
        const diferente = confirmarSenha.value && confirmarSenha.value !== senha.value;
        confirmarSenha.setCustomValidity(diferente ? "As senhas não coincidem." : "");
    };

    senha.addEventListener("input", validarConfirmacao);
    confirmarSenha.addEventListener("input", validarConfirmacao);

    window.preencherEspecialidades(especialidade);

    tipo.addEventListener("change", () => {
        const ehNutricionista = tipo.value === "nutricionista";
        crnField.hidden = !ehNutricionista;
        especialidadeField.hidden = !ehNutricionista;
        crn.required = ehNutricionista;
        especialidade.required = ehNutricionista;
        if (!ehNutricionista) {
            crn.value = "";
            especialidade.value = "";
        }
    });

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const dados = Object.fromEntries(new FormData(form));
        delete dados.confirmarSenha;

        cadastrarMock(dados);

        feedback.textContent = "Cadastro validado! A conexão com o servidor será ativada em breve.";
        feedback.classList.add("auth-feedback--success");
    });
})();
