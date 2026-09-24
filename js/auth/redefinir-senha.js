(function () {
    const etapaLabel = document.getElementById("reset-etapa");
    const formEmail = document.getElementById("form-email");
    const formCodigo = document.getElementById("form-codigo");
    const formSenha = document.getElementById("form-senha");
    const sucesso = document.getElementById("reset-sucesso");
    const linkLogin = document.querySelector(".auth-switch");

    const email = document.getElementById("email");
    const emailInformado = document.getElementById("email-informado");
    const codigo = document.getElementById("codigo");
    const feedbackCodigo = formCodigo.querySelector(".auth-feedback");
    const novaSenha = document.getElementById("nova-senha");
    const confirmarNovaSenha = document.getElementById("confirmar-nova-senha");

    const etapas = [formEmail, formCodigo, formSenha, sucesso];

    const solicitarCodigoMock = (email) => console.info("[mock] solicitar código:", email);
    const verificarCodigoMock = (email) => console.info("[mock] verificar código:", email);
    const reenviarCodigoMock = (email) => console.info("[mock] reenviar código:", email);
    const salvarNovaSenhaMock = (email) => console.info("[mock] salvar nova senha:", email);

    function mostrarEtapa(indice) {
        etapas.forEach((el, i) => { el.hidden = i !== indice; });
        etapaLabel.textContent = indice < 3 ? `Etapa ${indice + 1} de 3` : "Tudo certo";
        linkLogin.hidden = indice === 3;

        const primeiroCampo = etapas[indice].querySelector("input");
        if (primeiroCampo) primeiroCampo.focus();
    }

    formEmail.addEventListener("submit", (event) => {
        event.preventDefault();

        solicitarCodigoMock(email.value);

        emailInformado.textContent = email.value;
        codigo.value = "";
        feedbackCodigo.textContent = "";
        feedbackCodigo.classList.remove("auth-feedback--success");
        mostrarEtapa(1);
    });

    codigo.addEventListener("input", () => {
        codigo.value = codigo.value.replace(/\D/g, "").slice(0, 6);
    });

    formCodigo.addEventListener("submit", (event) => {
        event.preventDefault();

        verificarCodigoMock(email.value);

        mostrarEtapa(2);
    });

    document.getElementById("reenviar-codigo").addEventListener("click", () => {
        reenviarCodigoMock(email.value);

        feedbackCodigo.textContent = "Enviamos um novo código para o seu email.";
        feedbackCodigo.classList.add("auth-feedback--success");
    });

    document.getElementById("trocar-email").addEventListener("click", () => mostrarEtapa(0));

    const validarConfirmacao = () => {
        const diferente = confirmarNovaSenha.value && confirmarNovaSenha.value !== novaSenha.value;
        confirmarNovaSenha.setCustomValidity(diferente ? "As senhas não coincidem." : "");
    };

    novaSenha.addEventListener("input", validarConfirmacao);
    confirmarNovaSenha.addEventListener("input", validarConfirmacao);

    formSenha.addEventListener("submit", (event) => {
        event.preventDefault();

        salvarNovaSenhaMock(email.value);

        mostrarEtapa(3);
    });
})();
