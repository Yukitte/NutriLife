(function () {
    const TOKEN_KEY = "nutrilife_access_token";

    async function request(path, options) {
        const settings = options || {};
        const headers = new Headers(settings.headers || {});
        const token = sessionStorage.getItem(TOKEN_KEY);
        if (token) headers.set("Authorization", `Bearer ${token}`);
        if (settings.body && !(settings.body instanceof FormData)) {
            headers.set("Content-Type", "application/json");
        }

        const response = await fetch(`${window.NUTRILIFE_API_URL}${path}`, {
            ...settings,
            headers,
        });

        if (!response.ok) {
            let detail = `Erro na API (${response.status})`;
            try {
                const body = await response.json();
                detail = body.detail || detail;
            } catch (error) {
                if (!(error instanceof SyntaxError)) throw error;
            }
            const apiError = new Error(detail);
            apiError.status = response.status;
            throw apiError;
        }

        return response.status === 204 ? null : response.json();
    }

    window.NutriLifeAPI = {
        cadastrarUsuario: (usuario) => request("/usuarios", {
            method: "POST",
            body: JSON.stringify(usuario),
        }),
        login: (credenciais) => request("/auth/login", {
            method: "POST",
            body: JSON.stringify(credenciais),
        }),
        perfil: () => request("/usuarios/me"),
        atualizarPerfil: (usuario) => request("/usuarios/me", {
            method: "PUT",
            body: JSON.stringify(usuario),
        }),
        excluirConta: () => request("/usuarios/me", {
            method: "DELETE",
        }),
        listarPacientes: () => request("/usuarios"),
        listarPlanos: () => request("/planos"),
        criarPlano: (plano) => request("/planos", {
            method: "POST",
            body: JSON.stringify(plano),
        }),
        atualizarPlano: (id, plano) => request(`/planos/${encodeURIComponent(id)}`, {
            method: "PUT",
            body: JSON.stringify(plano),
        }),
        excluirPlano: (id) => request(`/planos/${encodeURIComponent(id)}`, {
            method: "DELETE",
        }),
        salvarToken: (token) => sessionStorage.setItem(TOKEN_KEY, token),
        limparToken: () => sessionStorage.removeItem(TOKEN_KEY),
        possuiToken: () => Boolean(sessionStorage.getItem(TOKEN_KEY)),
    };
})();
