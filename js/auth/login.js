(function () {
    const form = document.getElementById("login-form");

    function entrarMock(dados) {
        console.info("[mock] login:", { email: dados.email });
        window.location.href = "/pages/paciente/home.html";
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        entrarMock(Object.fromEntries(new FormData(form)));
    });
})();
