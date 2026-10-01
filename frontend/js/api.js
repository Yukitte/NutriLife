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
        solicitarRecuperacaoSenha: (email) => request("/auth/recuperar-senha", {
            method: "POST",
            body: JSON.stringify({ email }),
        }),
        redefinirSenha: (token, senha) => request("/auth/redefinir-senha", {
            method: "POST",
            body: JSON.stringify({ token, senha }),
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
        listarNutricionistas: (estado) => {
            const query = estado ? `?estado=${encodeURIComponent(estado)}` : "";
            return request(`/usuarios/nutricionistas${query}`);
        },
        obterNutricionista: (id) =>
            request(`/usuarios/nutricionistas/${encodeURIComponent(id)}`),
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
        listarCategoriasAlimentos: () => request("/alimentos/categorias"),
        obterFonteAlimentos: () => request("/alimentos/fonte"),
        obterAlimento: (id) => request(`/alimentos/${encodeURIComponent(id)}`),
        buscarAlimentos: (busca, categoria, offset) => {
            const params = new URLSearchParams();
            if (busca) params.set("busca", busca);
            if (categoria) params.set("categoria", categoria);
            params.set("limit", "20");
            params.set("offset", String(offset || 0));
            return request(`/alimentos?${params}`);
        },
        obterHorarios: (id, inicio, fim) => {
            const params = new URLSearchParams({
                nutricionista_id: id,
                inicio,
                fim,
            });
            return request(`/consultas/disponibilidade?${params}`);
        },
        listarConsultas: () => request("/consultas"),
        marcarConsulta: (appointment) => request("/consultas", {
            method: "POST",
            body: JSON.stringify(appointment),
        }),
        cancelarConsulta: (id) => request(`/consultas/${encodeURIComponent(id)}/cancelar`, {
            method: "PUT",
        }),
        confirmarPagamento: (id, link) =>
            request(`/consultas/${encodeURIComponent(id)}/confirmar-pagamento`, {
                method: "PUT",
                body: JSON.stringify({ link_reuniao: link }),
            }),
        minhaDisponibilidade: () => request("/consultas/minha-disponibilidade"),
        salvarDisponibilidade: (availability) => request(
            "/consultas/minha-disponibilidade",
            { method: "PUT", body: JSON.stringify(availability) },
        ),
        salvarToken: (token) => sessionStorage.setItem(TOKEN_KEY, token),
        limparToken: () => sessionStorage.removeItem(TOKEN_KEY),
        possuiToken: () => Boolean(sessionStorage.getItem(TOKEN_KEY)),
    };
})();
