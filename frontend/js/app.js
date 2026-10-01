const api = window.NutriLifeAPI;
const TOKEN_KEY = "nutrilife_access_token";
const USER_KEY = "nutrilife_user";

function setStatus(element, message, type) {
    if (!element) return;
    element.textContent = message;
    element.className = `auth-status${type ? ` is-${type}` : ""}`;
}

function saveSession(auth) {
    api.salvarToken(auth.access_token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(auth.usuario));
}

function switchAuthTab(tabName) {
    document.querySelectorAll(".auth-tab").forEach((tab) => {
        const active = tab.dataset.authTab === tabName;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".auth-form").forEach((form) => {
        form.classList.toggle("is-active", form.dataset.authForm === tabName);
    });
}

async function submitAuthForm(event, action) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const status = form.querySelector(".auth-status");
    const values = Object.fromEntries(new FormData(form).entries());
    button.disabled = true;
    setStatus(status, "Aguarde...", "");

    try {
        const auth = await action(values);
        saveSession(auth);
        setStatus(status, "Acesso confirmado. Abrindo painel...", "success");
        window.location.href = "../../dashboard.html";
    } catch (error) {
        const message = error.status === 409
            ? "Este e-mail já está cadastrado."
            : error.status === 422
                ? "Confira os dados informados e tente novamente."
                : error.status === 401
                    ? "E-mail ou senha inválidos."
                    : error.message || "Não foi possível conectar à API.";
        setStatus(status, message, "error");
    } finally {
        button.disabled = false;
    }
}

function initAuthPage() {
    if (api.possuiToken()) {
        window.location.href = "../../dashboard.html";
        return;
    }

    document.getElementById("login-form").addEventListener("submit", (event) => {
        submitAuthForm(event, ({ email, senha }) => api.login({ email, senha }));
    });
    document.getElementById("register-form").addEventListener("submit", (event) => {
        submitAuthForm(event, ({ nome, email, senha }) =>
            api.cadastrarUsuario({ nome, email, senha }));
    });
    document.querySelectorAll(".auth-tab").forEach((tab) => {
        tab.addEventListener("click", () => switchAuthTab(tab.dataset.authTab));
    });
}

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function renderPlans(plans) {
    const container = document.getElementById("plans-list");
    container.replaceChildren();
    if (!plans.length) {
        container.append(createElement("p", "item-meta", "Ainda não há planos alimentares."));
        return;
    }

    plans.forEach((plan) => {
        const article = createElement("article", "plan-card");
        article.append(
            createElement("h4", "item-title", plan.titulo),
            createElement("p", "item-meta", plan.descricao),
            createElement(
                "p",
                "item-meta",
                plan.paciente_nome
                    ? `Paciente: ${plan.paciente_nome} · Nutricionista: ${plan.nutricionista_nome}`
                    : `Nutricionista: ${plan.nutricionista_nome}`,
            ),
        );
        const meals = document.createElement("ul");
        plan.refeicoes.forEach((meal) => meals.append(createElement("li", "", meal)));
        article.append(meals);

        const currentUser = JSON.parse(sessionStorage.getItem(USER_KEY) || "{}");
        if (currentUser.perfil === "nutricionista") {
            const editButton = createElement("button", "btn btn--ghost", "Editar plano");
            editButton.type = "button";
            const editForm = createElement("form", "dashboard-form plan-edit-form");
            editForm.hidden = true;

            const title = document.createElement("input");
            title.name = "titulo";
            title.value = plan.titulo;
            title.required = true;
            title.minLength = 3;
            title.maxLength = 120;
            const description = document.createElement("textarea");
            description.name = "descricao";
            description.value = plan.descricao;
            description.required = true;
            description.maxLength = 1000;
            const mealsInput = document.createElement("textarea");
            mealsInput.name = "refeicoes";
            mealsInput.value = plan.refeicoes.join("\n");
            mealsInput.required = true;
            const editFields = [
                ["Título", title],
                ["Orientações", description],
                ["Refeições (uma por linha)", mealsInput],
            ];
            editFields.forEach(([labelText, input]) => {
                const group = createElement("div", "input-group");
                const label = createElement("label", "", labelText);
                input.id = `plan-${plan.id}-${input.name}`;
                label.htmlFor = input.id;
                group.append(label, input);
                editForm.append(group);
            });
            const saveButton = createElement("button", "btn btn--primary", "Salvar alterações");
            saveButton.type = "submit";
            const cancelButton = createElement("button", "btn btn--ghost", "Cancelar");
            cancelButton.type = "button";
            cancelButton.addEventListener("click", () => {
                editForm.hidden = true;
                editButton.hidden = false;
            });
            editForm.append(saveButton, cancelButton);
            editButton.addEventListener("click", () => {
                editForm.hidden = false;
                editButton.hidden = true;
            });
            editForm.addEventListener("submit", async (event) => {
                event.preventDefault();
                saveButton.disabled = true;
                const values = Object.fromEntries(new FormData(editForm).entries());
                try {
                    await api.atualizarPlano(plan.id, {
                        titulo: values.titulo,
                        descricao: values.descricao,
                        refeicoes: values.refeicoes.split("\n")
                            .map((meal) => meal.trim())
                            .filter(Boolean),
                    });
                    await loadDashboard();
                } catch (error) {
                    showDashboardError(error.message);
                } finally {
                    saveButton.disabled = false;
                }
            });
            const removeButton = createElement("button", "btn btn--ghost", "Excluir plano");
            removeButton.type = "button";
            removeButton.addEventListener("click", async () => {
                if (!window.confirm("Deseja excluir este plano alimentar?")) return;
                try {
                    await api.excluirPlano(plan.id);
                    await loadDashboard();
                } catch (error) {
                    showDashboardError(error.message);
                }
            });
            article.append(editButton, editForm, removeButton);
        }
        container.append(article);
    });
}

function showDashboardError(message) {
    const status = document.getElementById("dashboard-status");
    if (status) {
        status.textContent = message;
        status.hidden = false;
    }
}

async function loadDashboard() {
    const user = await api.perfil();
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    document.getElementById("user-name").textContent = user.nome.split(" ")[0];
    document.getElementById("user-role").textContent =
        user.perfil === "nutricionista" ? "Nutricionista" : "Paciente";

    const plans = await api.listarPlanos();
    document.getElementById("plans-count").textContent = String(plans.length);
    renderPlans(plans);

    const formPanel = document.getElementById("create-plan-panel");
    const patientsPanel = document.getElementById("patients-panel");
    if (user.perfil === "nutricionista") {
        formPanel.hidden = false;
        patientsPanel.hidden = false;
        const patients = await api.listarPacientes();
        const select = document.getElementById("plan-patient");
        select.replaceChildren(new Option("Selecione um paciente", ""));
        patients.forEach((patient) => {
            select.add(new Option(`${patient.nome} — ${patient.email}`, patient.id));
        });
        const list = document.getElementById("patients-list");
        list.replaceChildren(...patients.map((patient) =>
            createElement("li", "", `${patient.nome} — ${patient.email}`)));
    }
}

function initDashboardPage() {
    document.getElementById("logout-button").addEventListener("click", () => {
        api.limparToken();
        sessionStorage.removeItem(USER_KEY);
        window.location.href = "./pages/auth/login.html";
    });

    document.getElementById("create-plan-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form).entries());
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            await api.criarPlano({
                paciente_id: values.paciente_id,
                titulo: values.titulo,
                descricao: values.descricao,
                refeicoes: values.refeicoes.split("\n").map((meal) => meal.trim()).filter(Boolean),
            });
            form.reset();
            await loadDashboard();
        } catch (error) {
            showDashboardError(error.message);
        } finally {
            button.disabled = false;
        }
    });

    loadDashboard().catch((error) => {
        if (error.status === 401) {
            api.limparToken();
            sessionStorage.removeItem(USER_KEY);
            window.location.href = "./pages/auth/login.html";
            return;
        }
        showDashboardError(error.message || "Não foi possível carregar seus dados.");
    });
}

document.addEventListener("DOMContentLoaded", () => {
    if (document.body.dataset.page === "auth") initAuthPage();
    if (document.body.dataset.page === "dashboard") initDashboardPage();
});
