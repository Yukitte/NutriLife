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
    const title = document.querySelector(".auth-title");
    const intro = document.querySelector(".auth-intro");
    if (title && intro) {
        const isRegistration = tabName === "register";
        title.textContent = isRegistration ? "Crie sua conta" : "Acesse sua conta";
        intro.textContent = isRegistration
            ? "Cadastre-se para começar sua jornada nutricional."
            : "Entre para acompanhar sua jornada nutricional.";
    }
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

function initPasswordResetPage() {
    const form = document.getElementById("password-reset-form");
    const token = new URLSearchParams(window.location.search).get("token");
    const emailGroup = document.getElementById("reset-email-group");
    const email = document.getElementById("reset-email");
    const passwordFields = document.getElementById("reset-password-fields");
    const password = document.getElementById("reset-password");
    const confirmation = document.getElementById("reset-confirm-password");
    emailGroup.hidden = Boolean(token);
    email.required = !token;
    passwordFields.hidden = !token;
    password.required = Boolean(token);
    confirmation.required = Boolean(token);

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const status = document.getElementById("reset-status");
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            if (token) {
                if (password.value !== confirmation.value) {
                    throw new Error("As senhas não conferem.");
                }
                await api.redefinirSenha(token, password.value);
                setStatus(status, "Senha redefinida. Você já pode fazer login.", "success");
                form.reset();
                button.hidden = true;
            } else {
                await api.solicitarRecuperacaoSenha(email.value);
                setStatus(
                    status,
                    "Se o e-mail estiver cadastrado, enviaremos instruções para redefinir sua senha.",
                    "success",
                );
                form.reset();
            }
        } catch (error) {
            setStatus(status, error.message || "Não foi possível redefinir a senha.", "error");
        } finally {
            button.disabled = false;
        }
    });
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
        submitAuthForm(event, (values) => api.cadastrarUsuario(values));
    });
    document.querySelectorAll(".auth-tab").forEach((tab) => {
        tab.addEventListener("click", () => switchAuthTab(tab.dataset.authTab));
    });
    const typeSelect = document.getElementById("register-type");
    const crnGroup = document.getElementById("register-crn-group");
    const crnInput = document.getElementById("register-crn");
    const updateCrnRequirement = () => {
        const isNutritionist = typeSelect.value === "nutricionista";
        crnGroup.hidden = !isNutritionist;
        crnInput.required = isNutritionist;
    };
    typeSelect.addEventListener("change", updateCrnRequirement);
    updateCrnRequirement();
}

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function inputGroup(labelText, input) {
    const group = createElement("div", "input-group");
    const label = createElement("label", "", labelText);
    const id = `field-${Math.random().toString(36).slice(2)}`;
    input.id = id;
    label.htmlFor = id;
    group.append(label, input);
    return group;
}

let foodCategoriesPromise;
let foodSourcePromise;

function nutrientText(value, unit) {
    return value === null || value === undefined
        ? "não informado"
        : `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${unit}`;
}

function updateCatalogOption(row) {
    const food = row.catalogFood;
    if (!food) return;
    const grams = Number(row.querySelector('[name="quantidade"]').value);
    const summary = row.querySelector(".food-nutrition-summary");
    const calories = row.querySelector('[name="calorias"]');
    if (!Number.isFinite(grams) || grams <= 0 || grams > 10000) {
        summary.textContent = "Informe uma quantidade entre 0,01 e 10.000 g.";
        return;
    }

    const nutrients = food.nutrients_per_100g;
    const factor = grams / 100;
    const energy = nutrients.energia_kcal;
    calories.value = energy === null || energy === undefined
        ? "0"
        : String(Math.round(energy * factor));
    row.dataset.energiaKcal = energy === null || energy === undefined
        ? ""
        : String(energy * factor);
    ["proteina_g", "carboidrato_g", "gordura_g", "fibra_g", "sodio_mg"].forEach((key) => {
        const value = nutrients[key];
        row.dataset[key] = value === null || value === undefined
            ? ""
            : String(value * factor);
    });
    summary.textContent = [
        `Energia: ${nutrientText(row.dataset.energiaKcal || null, "kcal")}`,
        `Proteína: ${nutrientText(row.dataset.proteina_g || null, "g")}`,
        `Carboidratos: ${nutrientText(row.dataset.carboidrato_g || null, "g")}`,
        `Gorduras: ${nutrientText(row.dataset.gordura_g || null, "g")}`,
        `Fibras: ${nutrientText(row.dataset.fibra_g || null, "g")}`,
        `Sódio: ${nutrientText(row.dataset.sodio_mg || null, "mg")}`,
    ].join(" · ");
}

function selectCatalogFood(row, food, savedOption) {
    const foodName = row.querySelector('[name="alimento"]');
    const measure = row.querySelector('[name="medida"]');
    const quantity = row.querySelector('[name="quantidade"]');
    const calories = row.querySelector('[name="calorias"]');
    const portions = row.querySelector(".food-portion-select");
    const saved = savedOption || {};
    row.catalogFood = food;
    row.dataset.foodId = food.id;
    row.dataset.foodCategory = food.category;
    foodName.value = food.name;

    const portionOptions = [
        { label: "100 g (referência)", gram_weight: 100 },
        ...food.portions,
    ];
    portions.replaceChildren(...portionOptions.map((portion) =>
        new Option(portion.label, String(portion.gram_weight))));
    const savedPortionIndex = portionOptions.findIndex(
        (portion) => portion.label === saved.porcao,
    );
    portions.selectedIndex = savedPortionIndex >= 0 ? savedPortionIndex : 0;
    portions.disabled = false;
    measure.value = "g";
    measure.readOnly = true;
    quantity.value = String(saved.quantidade || portionOptions[portions.selectedIndex].gram_weight);
    quantity.max = "10000";
    quantity.step = "0.01";
    calories.readOnly = true;
    row.dataset.portion = saved.porcao || portionOptions[portions.selectedIndex].label;
    updateCatalogOption(row);
}

function clearCatalogFood(row) {
    row.catalogFood = null;
    delete row.dataset.foodId;
    delete row.dataset.foodCategory;
    delete row.dataset.portion;
    [
        "energiaKcal",
        "proteina_g",
        "carboidrato_g",
        "gordura_g",
        "fibra_g",
        "sodio_mg",
    ].forEach((key) => delete row.dataset[key]);
    row.querySelector(".food-portion-select").replaceChildren(
        new Option("Selecione um alimento do catálogo", ""),
    );
    row.querySelector(".food-portion-select").disabled = true;
    row.querySelector('[name="medida"]').readOnly = false;
    row.querySelector('[name="calorias"]').readOnly = false;
    row.querySelector(".food-nutrition-summary").textContent = "";
}

function populateFoodCategories(select) {
    if (!foodCategoriesPromise) foodCategoriesPromise = api.listarCategoriasAlimentos();
    foodCategoriesPromise.then((categories) => {
        if (!select.isConnected || select.options.length > 1) return;
        categories.forEach((category) => select.add(new Option(category, category)));
    }).catch((error) => {
        const status = select.closest(".food-option-row")
            .querySelector(".food-search-status");
        status.textContent = `Não foi possível carregar categorias: ${error.message}`;
    });
}

function populateFoodSource(target) {
    if (!foodSourcePromise) foodSourcePromise = api.obterFonteAlimentos();
    foodSourcePromise.then((source) => {
        if (!target.isConnected) return;
        target.replaceChildren();
        const link = document.createElement("a");
        link.href = source.source_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = `${source.name} — ${source.publisher || source.citation}`;
        const note = createElement(
            "span",
            "",
            ` Valores por 100 g. ${source.note || ""}`,
        );
        target.append("Fonte de dados: ", link, note);
    }).catch((error) => {
        if (target.isConnected) {
            target.textContent = `Não foi possível carregar a fonte dos alimentos: ${error.message}`;
        }
    });
}

function appendMealEditor(container, initialMeal) {
    const meal = initialMeal || {
        horario: "07:00",
        nome: "",
        opcoes: [{ nome: "", quantidade: 1, medida: "porção", calorias: 0 }],
    };
    const card = document.createElement("fieldset");
    card.className = "meal-editor";
    const legend = createElement("legend", "", meal.nome || "Nova refeição");
    const hour = document.createElement("input");
    hour.type = "time";
    hour.name = "horario";
    hour.value = meal.horario || "07:00";
    hour.required = true;
    const name = document.createElement("input");
    name.name = "nome";
    name.value = meal.nome || "";
    name.minLength = 2;
    name.maxLength = 120;
    name.required = true;
    const foods = createElement("div", "food-option-list");

    function addFoodOption(option) {
        const data = option || { nome: "", quantidade: 1, medida: "porção", calorias: 0 };
        const row = createElement("div", "food-option-row");
        const foodName = document.createElement("input");
        foodName.name = "alimento";
        foodName.type = "search";
        foodName.placeholder = "Digite para buscar na base USDA";
        foodName.maxLength = 250;
        foodName.value = data.nome || "";
        foodName.required = true;
        const category = document.createElement("select");
        category.className = "food-category-select";
        category.add(new Option("Todas as categorias", ""));
        populateFoodCategories(category);
        const results = createElement("div", "food-search-results");
        results.setAttribute("role", "group");
        results.setAttribute("aria-label", "Resultados de alimentos");
        const searchStatus = createElement("p", "food-search-status item-meta");
        searchStatus.setAttribute("role", "status");
        searchStatus.setAttribute("aria-live", "polite");
        const searchControls = createElement("div", "food-search-controls");
        searchControls.append(inputGroup("Filtrar por categoria", category));
        const sourceNote = createElement("p", "food-source-note item-meta");
        populateFoodSource(sourceNote);
        const searchPanel = createElement("div", "food-catalog-search");
        searchPanel.append(sourceNote, searchControls, searchStatus, results);
        const quantity = document.createElement("input");
        quantity.name = "quantidade";
        quantity.type = "number";
        quantity.min = "0.01";
        quantity.step = "0.01";
        quantity.value = data.quantidade || 1;
        quantity.required = true;
        const measure = document.createElement("input");
        measure.name = "medida";
        measure.placeholder = "Medida (xícara, g...)";
        measure.value = data.medida || "";
        measure.required = true;
        const portions = document.createElement("select");
        portions.className = "food-portion-select";
        portions.disabled = true;
        portions.add(new Option("Selecione um alimento do catálogo", ""));
        const calories = document.createElement("input");
        calories.name = "calorias";
        calories.type = "number";
        calories.min = "0";
        calories.step = "1";
        calories.value = data.calorias || 0;
        calories.required = true;
        const nutritionSummary = createElement("p", "food-nutrition-summary item-meta");
        nutritionSummary.setAttribute("aria-live", "polite");

        let debounce;
        let requestVersion = 0;
        let searchOffset = 0;
        let searchTotal = 0;
        const runSearch = async (append) => {
            const version = ++requestVersion;
            const term = foodName.value.trim();
            const foodCategory = category.value;
            if (term.length < 2 && !foodCategory) {
                results.replaceChildren();
                searchOffset = 0;
                searchTotal = 0;
                searchStatus.textContent = "Digite ao menos 2 caracteres ou escolha uma categoria.";
                return;
            }
            if (!append) searchOffset = 0;
            const offset = searchOffset;
            if (append) {
                const previousMoreButton = results.querySelector(".food-search-more");
                if (previousMoreButton) previousMoreButton.remove();
            }
            searchStatus.textContent = "Buscando alimentos...";
            try {
                const response = await api.buscarAlimentos(term, foodCategory, offset);
                if (!row.isConnected || version !== requestVersion) return;
                if (!append) results.replaceChildren();
                response.items.forEach((food) => {
                    const result = createElement(
                        "button",
                        "food-result",
                        `${food.name} · ${food.category}`,
                    );
                    result.type = "button";
                    result.addEventListener("click", () => {
                        selectCatalogFood(row, food);
                        results.replaceChildren();
                        searchStatus.textContent =
                            "Alimento USDA selecionado. Valores nutricionais calculados por gramas.";
                    });
                    results.append(result);
                });
                searchOffset = offset + response.items.length;
                searchTotal = response.total;
                if (searchOffset < searchTotal) {
                    const more = createElement("button", "btn btn--ghost food-search-more", "Carregar mais alimentos");
                    more.type = "button";
                    more.addEventListener("click", () => runSearch(true));
                    results.append(more);
                }
                searchStatus.textContent = response.total
                    ? `${response.total} alimento(s) encontrado(s); exibindo ${searchOffset}.`
                    : "Nenhum alimento encontrado para essa busca.";
            } catch (error) {
                if (row.isConnected && version === requestVersion) {
                    searchStatus.textContent = `Erro ao buscar alimentos: ${error.message}`;
                }
            }
        };
        foodName.addEventListener("input", () => {
            if (row.dataset.foodId) clearCatalogFood(row);
            window.clearTimeout(debounce);
            debounce = window.setTimeout(() => runSearch(false), 250);
        });
        category.addEventListener("change", () => runSearch(false));
        portions.addEventListener("change", () => {
            const selected = portions.selectedOptions[0];
            if (!selected || !selected.value) return;
            quantity.value = selected.value;
            row.dataset.portion = selected.textContent || "";
            updateCatalogOption(row);
        });
        quantity.addEventListener("input", () => {
            if (row.dataset.foodId) updateCatalogOption(row);
        });
        measure.addEventListener("input", () => {
            if (row.dataset.foodId) clearCatalogFood(row);
        });
        if (data.alimento_id) {
            row.dataset.foodId = data.alimento_id;
            row.dataset.foodCategory = data.categoria || "";
            row.dataset.portion = data.porcao || "";
        }
        row.append(
            inputGroup("Alimento (busca no catálogo ou entrada manual)", foodName),
            searchPanel,
            inputGroup("Porção do catálogo", portions),
            inputGroup("Quantidade (em gramas para alimentos USDA)", quantity),
            inputGroup("Medida (seleções USDA usam gramas)", measure),
            inputGroup("Calorias (kcal)", calories),
            nutritionSummary,
        );
        if (data.alimento_id) {
            api.obterAlimento(data.alimento_id).then((food) => {
                if (row.isConnected) selectCatalogFood(row, food, data);
            }).catch((error) => {
                if (row.isConnected) {
                    searchStatus.textContent =
                        `Não foi possível recuperar o alimento salvo: ${error.message}`;
                }
            });
        }
        const remove = createElement("button", "btn btn--ghost", "Remover opção");
        remove.type = "button";
        remove.addEventListener("click", () => {
            if (foods.children.length > 1) row.remove();
        });
        row.append(remove);
        foods.append(row);
    }

    const addFood = createElement("button", "btn btn--ghost", "Adicionar opção de substituição");
    addFood.type = "button";
    addFood.addEventListener("click", () => addFoodOption());
    const removeMeal = createElement("button", "btn btn--ghost", "Remover refeição");
    removeMeal.type = "button";
    removeMeal.addEventListener("click", () => {
        if (container.children.length > 1) card.remove();
    });
    name.addEventListener("input", () => {
        legend.textContent = name.value || "Nova refeição";
    });
    card.append(
        legend,
        inputGroup("Horário", hour),
        inputGroup("Nome da refeição", name),
        foods,
        addFood,
        removeMeal,
    );
    (meal.opcoes || []).forEach(addFoodOption);
    if (!meal.opcoes || meal.opcoes.length === 0) addFoodOption();
    container.append(card);
}

function collectMeals(container) {
    return [...container.querySelectorAll(".meal-editor")].map((card) => ({
        horario: card.querySelector('[name="horario"]').value,
        nome: card.querySelector('[name="nome"]').value,
        opcoes: [...card.querySelectorAll(".food-option-row")].map((row) => {
            const option = {
                nome: row.querySelector('[name="alimento"]').value,
                quantidade: Number(row.querySelector('[name="quantidade"]').value),
                medida: row.querySelector('[name="medida"]').value,
                calorias: Number(row.querySelector('[name="calorias"]').value),
            };
            if (row.dataset.foodId) {
                option.alimento_id = row.dataset.foodId;
                option.categoria = row.dataset.foodCategory;
                option.porcao = row.dataset.portion;
                option.energia_kcal = row.dataset.energiaKcal
                    ? Number(row.dataset.energiaKcal)
                    : null;
                ["proteina_g", "carboidrato_g", "gordura_g", "fibra_g", "sodio_mg"]
                    .forEach((key) => {
                        option[key] = row.dataset[key] ? Number(row.dataset[key]) : null;
                    });
            }
            return option;
        }),
    }));
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
            createElement(
                "p",
                "item-meta",
                `${plan.objetivo || "Objetivo não definido"} · ${plan.duracao_meses || "—"} meses`,
            ),
            createElement("p", "item-meta", plan.descricao),
            createElement(
                "p",
                "item-meta",
                plan.paciente_nome
                    ? `Paciente: ${plan.paciente_nome} · Nutricionista: ${plan.nutricionista_nome}`
                    : `Nutricionista: ${plan.nutricionista_nome}`,
            ),
        );
        const meals = document.createElement("div");
        meals.className = "plan-meals";
        plan.refeicoes.forEach((meal) => {
            const section = createElement("section", "plan-meal");
            section.append(
                createElement("h5", "", `${meal.horario} · ${meal.nome}`),
            );
            const options = document.createElement("ul");
            meal.opcoes.forEach((option) => {
                const nutrition = option.alimento_id
                    ? ` · Proteína ${nutrientText(option.proteina_g, "g")}, carboidratos ${nutrientText(option.carboidrato_g, "g")}, gorduras ${nutrientText(option.gordura_g, "g")}`
                    : "";
                options.append(createElement(
                    "li",
                    "",
                    `${option.nome} — ${option.quantidade} ${option.medida} · ${option.calorias} kcal${nutrition}`,
                ));
            });
            section.append(options);
            meals.append(section);
        });
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
            const objective = document.createElement("input");
            objective.name = "objetivo";
            objective.value = plan.objetivo || "";
            objective.required = true;
            const duration = document.createElement("input");
            duration.name = "duracao_meses";
            duration.type = "number";
            duration.min = "1";
            duration.max = "60";
            duration.value = plan.duracao_meses || 6;
            duration.required = true;
            const description = document.createElement("textarea");
            description.name = "descricao";
            description.value = plan.descricao;
            description.required = true;
            description.maxLength = 1000;
            const mealsInput = createElement("div", "meal-editor-list");
            plan.refeicoes.forEach((meal) => appendMealEditor(mealsInput, meal));
            const editFields = [
                ["Título", title],
                ["Objetivo", objective],
                ["Duração (meses)", duration],
                ["Orientações", description],
            ];
            editFields.forEach(([labelText, input]) => {
                const group = createElement("div", "input-group");
                const label = createElement("label", "", labelText);
                input.id = `plan-${plan.id}-${input.name}`;
                label.htmlFor = input.id;
                group.append(label, input);
                editForm.append(group);
            });
            editForm.append(mealsInput);
            const addMeal = createElement("button", "btn btn--ghost", "Adicionar refeição");
            addMeal.type = "button";
            addMeal.addEventListener("click", () => appendMealEditor(mealsInput));
            editForm.append(addMeal);
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
                        objetivo: values.objetivo,
                        duracao_meses: Number(values.duracao_meses),
                        descricao: values.descricao,
                        refeicoes: collectMeals(mealsInput),
                    });
                    await loadCurrentPage();
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
                    await loadCurrentPage();
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

function formatDateTime(value) {
    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
    }).format(new Date(value));
}

function formatTime(value) {
    return new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}

async function loadSearchPage(user) {
    if (user.perfil !== "paciente") {
        window.location.replace("../dashboard.html");
        return;
    }
    const dateElement = document.getElementById("today-date");
    dateElement.textContent = new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "full",
    }).format(new Date());
    const results = document.getElementById("nutritionists-list");

    async function search(state) {
        results.replaceChildren(createElement("p", "item-meta", "Buscando profissionais..."));
        try {
            const professionals = await api.listarNutricionistas(state);
            results.replaceChildren();
            if (!professionals.length) {
                results.append(createElement("p", "item-meta", "Nenhum profissional encontrado para esse estado."));
                return;
            }
            professionals.forEach((professional) => {
                const card = createElement("article", "panel professional-card");
                card.append(
                    createElement("h2", "", professional.nome),
                    createElement("p", "item-meta", `CRN ${professional.crn || "não informado"} · ${professional.estado}`),
                    createElement("p", "", professional.especialidades.join(" · ") || "Especialidades não informadas"),
                    createElement("p", "professional-price", new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                    }).format(professional.valor_consulta)),
                );
                const link = createElement("a", "btn btn--primary", "Ver perfil");
                link.href = `./perfil-nutricionista.html?id=${encodeURIComponent(professional.id)}`;
                card.append(link);
                results.append(card);
            });
        } catch (error) {
            showDashboardError(error.message);
            results.replaceChildren();
        }
    }

    document.getElementById("search-form").addEventListener("submit", (event) => {
        event.preventDefault();
        search(document.getElementById("state-filter").value);
    });
    await search("");
}

async function loadProfessionalProfile(user) {
    if (user.perfil !== "paciente") {
        window.location.replace("../dashboard.html");
        return;
    }
    const id = new URLSearchParams(window.location.search).get("id");
    const container = document.getElementById("professional-profile");
    if (!id) {
        showDashboardError("Perfil profissional não informado.");
        return;
    }
    const professional = await api.obterNutricionista(id);
    container.replaceChildren(
        createElement("span", "eyebrow", "Perfil profissional"),
        createElement("h1", "", professional.nome),
        createElement("p", "item-meta", `CRN ${professional.crn || "não informado"} · ${professional.estado}`),
        createElement("h3", "", "Especialidades"),
        createElement("p", "", professional.especialidades.join(" · ") || "Não informadas"),
        createElement("h3", "", "Sobre"),
        createElement("p", "", professional.biografia || "Este profissional ainda não adicionou uma biografia."),
        createElement("p", "item-meta", `Nota média: ${professional.nota_media.toFixed(1)} · Pacientes atendidos: ${professional.total_pacientes} · Na plataforma desde ${professional.data_inicio}`),
        createElement("p", "professional-price", new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
        }).format(professional.valor_consulta)),
    );
    if (professional.telefone) {
        const phone = professional.telefone.startsWith("55")
            ? professional.telefone
            : `55${professional.telefone}`;
        const whatsapp = createElement("a", "btn btn--ghost", "Falar pelo WhatsApp");
        whatsapp.href = `https://wa.me/${phone}`;
        whatsapp.target = "_blank";
        whatsapp.rel = "noopener noreferrer";
        container.append(whatsapp);
    }
    const schedule = createElement("a", "btn btn--primary", "Marcar consulta");
    schedule.href = `./agendamento.html?id=${encodeURIComponent(professional.id)}`;
    container.append(schedule);
}

function firstOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function loadBookingPage(user) {
    if (user.perfil !== "paciente") {
        window.location.replace("../dashboard.html");
        return;
    }
    const nutritionistId = new URLSearchParams(window.location.search).get("id");
    if (!nutritionistId) {
        window.location.replace("./busca.html");
        return;
    }
    const professional = await api.obterNutricionista(nutritionistId);
    document.getElementById("booking-professional").textContent = professional.nome;
    const monthLabel = document.getElementById("calendar-month");
    const calendar = document.getElementById("availability-calendar");
    const slotsContainer = document.getElementById("available-slots");
    const selectedTitle = document.getElementById("selected-date-title");
    let month = firstOfMonth(new Date());
    let slotsByDate = new Map();

    async function renderMonth() {
        monthLabel.textContent = new Intl.DateTimeFormat("pt-BR", {
            month: "long",
            year: "numeric",
        }).format(month);
        const start = dateKey(month);
        const end = dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));
        slotsByDate = new Map();
        const slots = await api.obterHorarios(nutritionistId, start, end);
        const scheduledWeekdays = new Set();
        slots.forEach((slot) => {
            const key = slot.data_local;
            const [year, monthNumber, dayNumber] = key.split("-").map(Number);
            scheduledWeekdays.add(new Date(year, monthNumber - 1, dayNumber).getDay());
            if (!slotsByDate.has(key)) slotsByDate.set(key, []);
            slotsByDate.get(key).push(slot);
        });

        calendar.replaceChildren();
        const firstWeekday = (month.getDay() + 6) % 7;
        for (let blank = 0; blank < firstWeekday; blank += 1) {
            calendar.append(createElement("span", "calendar-day calendar-day--empty", ""));
        }
        const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
        for (let day = 1; day <= daysInMonth; day += 1) {
            const date = new Date(month.getFullYear(), month.getMonth(), day);
            const key = dateKey(date);
            const daySlots = slotsByDate.get(key) || [];
            const isScheduledDay = scheduledWeekdays.has(date.getDay());
            const isFutureDate = key >= dateKey(new Date());
            const button = createElement(
                "button",
                `calendar-day${daySlots.length
                    ? " calendar-day--available"
                    : isScheduledDay && isFutureDate
                        ? " calendar-day--closed"
                        : ""}`,
            );
            button.type = "button";
            button.disabled = daySlots.length === 0;
            const number = createElement("span", "calendar-day__number", String(day));
            button.append(number);
            if (daySlots.length) {
                button.append(
                    createElement(
                        "span",
                        "calendar-day__status",
                        `Disponível · ${daySlots.length} ${daySlots.length === 1 ? "vaga" : "vagas"}`,
                    ),
                    createElement(
                        "span",
                        "calendar-day__time",
                        `${formatTime(daySlots[0].inicio)} – ${formatTime(daySlots[daySlots.length - 1].fim)}`,
                    ),
                );
            } else if (isScheduledDay && isFutureDate) {
                button.append(createElement("span", "calendar-day__status", "Sem horários"));
            }
            button.setAttribute(
                "aria-label",
                `${day} ${monthLabel.textContent}: ${
                    daySlots.length
                        ? `${daySlots.length} ${daySlots.length === 1 ? "horário disponível" : "horários disponíveis"}`
                        : "sem horários disponíveis"
                }`,
            );
            button.addEventListener("click", () => {
                selectedTitle.textContent = new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "full",
                }).format(date);
                slotsContainer.replaceChildren();
                daySlots.forEach((slot) => {
                    const button = createElement("button", "btn btn--ghost", formatDateTime(slot.inicio));
                    button.type = "button";
                    button.addEventListener("click", async () => {
                        button.disabled = true;
                        try {
                            const appointment = await api.marcarConsulta({
                                nutricionista_id: nutritionistId,
                                inicio: slot.inicio,
                            });
                            slotsContainer.replaceChildren(
                                createElement("p", "item-meta", "Horário reservado. A consulta aguarda a confirmação manual do pagamento."),
                            );
                            if (appointment.link_pagamento) {
                                const payment = createElement("a", "btn btn--primary", "Ir para pagamento PagSeguro");
                                payment.href = appointment.link_pagamento;
                                payment.target = "_blank";
                                payment.rel = "noopener noreferrer";
                                slotsContainer.append(payment);
                            }
                        } catch (error) {
                            button.disabled = false;
                            showDashboardError(error.message);
                        }
                    });
                    slotsContainer.append(button);
                });
            });
            calendar.append(button);
        }
    }

    document.getElementById("previous-month").addEventListener("click", () => {
        month = new Date(month.getFullYear(), month.getMonth() - 1, 1);
        renderMonth().catch((error) => showDashboardError(error.message));
    });
    document.getElementById("next-month").addEventListener("click", () => {
        month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
        renderMonth().catch((error) => showDashboardError(error.message));
    });
    await renderMonth();
}

async function loadAppointmentsPage(user) {
    const items = await api.listarConsultas();
    const container = document.getElementById("appointments-list");
    container.replaceChildren();
    if (!items.length) {
        container.append(createElement("p", "item-meta", "Você ainda não tem consultas."));
        return;
    }
    items.forEach((appointment) => {
        const card = createElement("article", "panel appointment-card");
        const otherParty = user.perfil === "paciente"
            ? `Nutricionista: ${appointment.nutricionista_nome}`
            : `Paciente: ${appointment.paciente_nome}`;
        card.append(
            createElement("h3", "", otherParty),
            createElement("p", "", formatDateTime(appointment.inicio)),
            createElement(
                "p",
                `item-tag item-tag--${appointment.status}`,
                appointment.status.replaceAll("_", " "),
            ),
        );
        if (user.perfil === "paciente" && appointment.status === "pendente_pagamento" && appointment.link_pagamento) {
            const payment = createElement("a", "btn btn--primary", "Pagar pelo PagSeguro");
            payment.href = appointment.link_pagamento;
            payment.target = "_blank";
            payment.rel = "noopener noreferrer";
            card.append(payment);
        }
        if (user.perfil === "nutricionista" && appointment.status === "pendente_pagamento") {
            const payment = createElement("a", "btn btn--ghost", "Conferir pagamento");
            payment.href = appointment.link_pagamento || "#";
            payment.target = "_blank";
            payment.rel = "noopener noreferrer";
            card.append(payment);
            const confirm = createElement("button", "btn btn--primary", "Confirmar pagamento");
            confirm.type = "button";
            confirm.addEventListener("click", async () => {
                const teamsLink = window.prompt("Informe o link da reunião do Microsoft Teams:");
                if (!teamsLink) return;
                try {
                    await api.confirmarPagamento(appointment.id, teamsLink);
                    await loadAppointmentsPage(user);
                } catch (error) {
                    showDashboardError(error.message);
                }
            });
            card.append(confirm);
        }
        if (appointment.status !== "cancelada") {
            const cancel = createElement("button", "btn btn--ghost", "Cancelar consulta");
            cancel.type = "button";
            cancel.addEventListener("click", async () => {
                if (!window.confirm("Deseja cancelar esta consulta?")) return;
                try {
                    await api.cancelarConsulta(appointment.id);
                    await loadAppointmentsPage(user);
                } catch (error) {
                    showDashboardError(error.message);
                }
            });
            card.append(cancel);
        }
        if (appointment.status === "confirmada" && appointment.link_reuniao) {
            const meeting = createElement("a", "btn btn--primary", "Entrar na chamada");
            meeting.href = appointment.link_reuniao;
            meeting.target = "_blank";
            meeting.rel = "noopener noreferrer";
            card.append(meeting);
        }
        container.append(card);
    });
}

const WEEKDAY_NAMES = [
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
    "Domingo",
];

function createAvailabilityWindow(day, windowData) {
    const row = createElement("div", "weekday-window");
    const start = document.createElement("input");
    start.name = "inicio";
    start.type = "time";
    start.value = windowData?.inicio || "09:00";
    start.required = true;
    const end = document.createElement("input");
    end.name = "fim";
    end.type = "time";
    end.value = windowData?.fim || "17:00";
    end.required = true;
    const duration = document.createElement("select");
    duration.name = "duracao_minutos";
    [
        ["30", "30 min"],
        ["45", "45 min"],
        ["60", "60 min"],
        ["90", "90 min"],
    ].forEach(([value, label]) => {
        const option = new Option(label, value);
        option.selected = Number(value) === (windowData?.duracao_minutos || 60);
        duration.add(option);
    });
    const remove = createElement("button", "btn btn--ghost weekday-window__remove", "Remover");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remover horário de ${WEEKDAY_NAMES[day]}`);
    remove.addEventListener("click", () => {
        row.remove();
        document.dispatchEvent(new Event("availabilitychange"));
    });
    row.append(
        inputGroup("Início", start),
        inputGroup("Fim", end),
        inputGroup("Duração", duration),
        remove,
    );
    row.querySelectorAll("input, select").forEach((control) => {
        control.addEventListener("input", () => {
            document.dispatchEvent(new Event("availabilitychange"));
        });
        control.addEventListener("change", () => {
            document.dispatchEvent(new Event("availabilitychange"));
        });
    });
    return row;
}

function getAvailabilityDraft() {
    return [...document.querySelectorAll(".weekday-schedule")].flatMap((schedule) => {
        const checkbox = schedule.querySelector('[name="weekday"]');
        if (!checkbox.checked) return [];
        return [...schedule.querySelectorAll(".weekday-window")].map((row) => ({
            dia_semana: Number(checkbox.value),
            inicio: row.querySelector('[name="inicio"]').value,
            fim: row.querySelector('[name="fim"]').value,
            duracao_minutos: Number(row.querySelector('[name="duracao_minutos"]').value),
        }));
    });
}

function renderAvailabilityDay(selectedDate, weeklySchedule) {
    const title = document.getElementById("availability-selected-date");
    const details = document.getElementById("availability-day-schedule");
    const dayOfWeek = (selectedDate.getDay() + 6) % 7;
    const daySchedule = weeklySchedule.filter((window) => window.dia_semana === dayOfWeek);
    title.textContent = new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
    }).format(selectedDate);
    details.replaceChildren();
    if (!daySchedule.length) {
        details.append(createElement("p", "item-meta", "Sem horários de atendimento neste dia."));
        return;
    }
    daySchedule.forEach((window) => {
        details.append(createElement(
            "p",
            "availability-day-slot",
            `${window.inicio} – ${window.fim} · consultas de ${window.duracao_minutos} min`,
        ));
    });
}

function renderProfessionalAvailabilityCalendar(month, selectedDate) {
    const calendar = document.getElementById("professional-availability-calendar");
    const monthLabel = document.getElementById("availability-calendar-month");
    const weeklySchedule = getAvailabilityDraft();
    const windowsByWeekday = new Map();
    weeklySchedule.forEach((window) => {
        if (!windowsByWeekday.has(window.dia_semana)) {
            windowsByWeekday.set(window.dia_semana, []);
        }
        windowsByWeekday.get(window.dia_semana).push(window);
    });
    monthLabel.textContent = new Intl.DateTimeFormat("pt-BR", {
        month: "long",
        year: "numeric",
    }).format(month);
    calendar.replaceChildren();
    const firstWeekday = (month.getDay() + 6) % 7;
    for (let blank = 0; blank < firstWeekday; blank += 1) {
        calendar.append(createElement("span", "calendar-day calendar-day--empty", ""));
    }
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(month.getFullYear(), month.getMonth(), day);
        const dayOfWeek = (date.getDay() + 6) % 7;
        const windows = windowsByWeekday.get(dayOfWeek) || [];
        const isSelected = date.toDateString() === selectedDate.toDateString();
        const button = createElement(
            "button",
            `calendar-day${windows.length ? " calendar-day--available" : ""}${isSelected ? " calendar-day--selected" : ""}`,
        );
        button.type = "button";
        button.append(createElement("span", "calendar-day__number", String(day)));
        if (windows.length) {
            button.append(createElement("span", "calendar-day__status", "Atendimento"));
            windows.forEach((window) => {
                button.append(createElement(
                    "span",
                    "calendar-day__time",
                    `${window.inicio}–${window.fim}`,
                ));
            });
        }
        button.setAttribute(
            "aria-label",
            `${new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(date)}${
                windows.length
                    ? `, atendimento ${windows.map((window) => `${window.inicio} a ${window.fim}`).join(", ")}`
                    : ", sem atendimento configurado"
            }`,
        );
        button.addEventListener("click", () => {
            selectedDate.setTime(date.getTime());
            renderProfessionalAvailabilityCalendar(month, selectedDate);
            renderAvailabilityDay(selectedDate, weeklySchedule);
        });
        calendar.append(button);
    }
    renderAvailabilityDay(selectedDate, weeklySchedule);
}

async function loadProfessionalCalendarPage() {
    const current = await api.minhaDisponibilidade();
    const form = document.getElementById("availability-form");
    const scheduleContainer = document.getElementById("weekday-schedules");
    const monthLabel = document.getElementById("availability-calendar-month");
    let month = firstOfMonth(new Date());
    let selectedDate = new Date();

    document.getElementById("timezone").value = current.fuso_horario;
    WEEKDAY_NAMES.forEach((weekdayName, day) => {
        const daySchedule = current.horarios.filter((window) => window.dia_semana === day);
        const section = createElement("section", "weekday-schedule");
        const heading = createElement("div", "weekday-schedule__heading");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.name = "weekday";
        checkbox.value = String(day);
        checkbox.checked = daySchedule.length > 0;
        const label = createElement("label", "", weekdayName);
        const checkboxId = `weekday-${day}`;
        checkbox.id = checkboxId;
        label.htmlFor = checkboxId;
        const addWindow = createElement("button", "btn btn--ghost weekday-schedule__add", "Adicionar horário");
        addWindow.type = "button";
        heading.append(checkbox, label, addWindow);
        const windows = createElement("div", "weekday-schedule__windows");
        daySchedule.forEach((window) => windows.append(createAvailabilityWindow(day, window)));
        if (!daySchedule.length) windows.hidden = true;
        addWindow.hidden = !checkbox.checked;
        checkbox.addEventListener("change", () => {
            windows.hidden = !checkbox.checked;
            addWindow.hidden = !checkbox.checked;
            if (checkbox.checked && !windows.children.length) {
                windows.append(createAvailabilityWindow(day));
            }
            section.classList.toggle("is-active", checkbox.checked);
            renderProfessionalAvailabilityCalendar(month, selectedDate);
        });
        addWindow.addEventListener("click", () => {
            windows.append(createAvailabilityWindow(day));
            renderProfessionalAvailabilityCalendar(month, selectedDate);
        });
        section.classList.toggle("is-active", checkbox.checked);
        section.append(heading, windows);
        scheduleContainer.append(section);
    });

    const updateCalendar = () => renderProfessionalAvailabilityCalendar(month, selectedDate);
    document.addEventListener("availabilitychange", updateCalendar);
    document.getElementById("timezone").addEventListener("change", updateCalendar);
    document.getElementById("availability-previous-month").addEventListener("click", () => {
        month = new Date(month.getFullYear(), month.getMonth() - 1, 1);
        selectedDate = new Date(month.getFullYear(), month.getMonth(), 1);
        updateCalendar();
    });
    document.getElementById("availability-next-month").addEventListener("click", () => {
        month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
        selectedDate = new Date(month.getFullYear(), month.getMonth(), 1);
        updateCalendar();
    });
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            await api.salvarDisponibilidade({
                fuso_horario: document.getElementById("timezone").value,
                horarios: getAvailabilityDraft(),
            });
            showDashboardError("Disponibilidade salva.");
        } catch (error) {
            showDashboardError(error.message);
        } finally {
            button.disabled = false;
        }
    });
    monthLabel.textContent = "";
    updateCalendar();
}

function initPageHandlers() {
    const page = document.body.dataset.page;
    if (page === "plans") {
        const createPlanForm = document.getElementById("create-plan-form");
        const mealEditor = document.getElementById("meal-editor");
        document.getElementById("add-meal").addEventListener("click", () => {
            appendMealEditor(mealEditor);
        });
        if (createPlanForm) createPlanForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const values = Object.fromEntries(new FormData(form).entries());
            try {
                await api.criarPlano({
                    paciente_id: values.paciente_id,
                    titulo: values.titulo,
                    objetivo: values.objetivo,
                    duracao_meses: Number(values.duracao_meses),
                    descricao: values.descricao,
                    refeicoes: collectMeals(mealEditor),
                });
                form.reset();
                mealEditor.replaceChildren();
                appendMealEditor(mealEditor);
                await loadCurrentPage();
            } catch (error) {
                showDashboardError(error.message);
            }
        });
    }
    if (page === "professional-profile-edit") {
        document.getElementById("professional-profile-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const values = Object.fromEntries(new FormData(form).entries());
            try {
                await api.atualizarPerfil({
                    telefone: values.telefone,
                    endereco: values.endereco,
                    cep: values.cep,
                    estado: values.estado,
                    especialidades: values.especialidades.split(",")
                        .map((specialty) => specialty.trim()).filter(Boolean),
                    biografia: values.biografia,
                    valor_consulta: Number(values.valor_consulta),
                    pagseguro_link: values.pagseguro_link || null,
                });
                showDashboardError("Perfil atualizado.");
            } catch (error) {
                showDashboardError(error.message);
            }
        });
    }
}

async function setCurrentUser() {
    const user = await api.perfil();
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    const name = document.getElementById("user-name");
    const role = document.getElementById("user-role");
    if (name) name.textContent = user.nome.split(" ")[0];
    if (role) role.textContent =
        user.perfil === "nutricionista" ? "Nutricionista" : "Paciente";
    const patientsNav = document.getElementById("patients-nav");
    const patientsAction = document.getElementById("patients-action");
    if (patientsNav) patientsNav.hidden = user.perfil !== "nutricionista";
    if (patientsAction) patientsAction.hidden = user.perfil !== "nutricionista";
    const nutritionistOnlyLinks = ["availability-nav", "profile-nav", "calendar-nav"];
    nutritionistOnlyLinks.forEach((id) => {
        const link = document.getElementById(id);
        if (link) link.hidden = user.perfil !== "nutricionista";
    });
    const patientOnlyLinks = ["search-nav"];
    patientOnlyLinks.forEach((id) => {
        const link = document.getElementById(id);
        if (link) link.hidden = user.perfil !== "paciente";
    });
    return user;
}

async function loadDashboard(user) {
    const plans = await api.listarPlanos();
    const count = document.getElementById("plans-count");
    if (count) count.textContent = String(plans.length);

    if (user.perfil === "nutricionista") {
        const patients = await api.listarPacientes();
        const patientsCard = document.getElementById("patients-count-card");
        const patientsCount = document.getElementById("patients-count");
        if (patientsCard) patientsCard.hidden = false;
        if (patientsCount) patientsCount.textContent = String(patients.length);
    }
}

async function loadPlansPage(user) {
    const formPanel = document.getElementById("create-plan-panel");
    if (user.perfil === "nutricionista" && formPanel) {
        formPanel.hidden = false;
        const mealEditor = document.getElementById("meal-editor");
        if (!mealEditor.children.length) appendMealEditor(mealEditor);
        const patients = await api.listarPacientes();
        const select = document.getElementById("plan-patient");
        select.replaceChildren(new Option("Selecione um paciente", ""));
        patients.forEach((patient) => {
            select.add(new Option(`${patient.nome} — ${patient.email}`, patient.id));
        });
    }

    const plans = await api.listarPlanos();
    renderPlans(plans);
}

async function loadPatientsPage(user) {
    if (user.perfil !== "nutricionista") {
        window.location.replace("../dashboard.html");
        return;
    }

    const patients = await api.listarPacientes();
    const list = document.getElementById("patients-list");
    list.replaceChildren();
    if (!patients.length) {
        list.append(createElement("li", "", "Ainda não há pacientes cadastrados."));
        return;
    }
    patients.forEach((patient) => {
        const item = document.createElement("li");
        const info = document.createElement("div");
        info.append(
            createElement("span", "item-title", patient.nome),
            createElement("span", "item-meta", patient.email),
        );
        const plansLink = createElement("a", "btn btn--ghost", "Ver planos");
        plansLink.href = "./planos.html";
        item.append(info, plansLink);
        list.append(item);
    });
}

async function loadCurrentPage() {
    const user = await setCurrentUser();
    const page = document.body.dataset.page;
    if (page === "dashboard") return loadDashboard(user);
    if (page === "plans") return loadPlansPage(user);
    if (page === "patients") return loadPatientsPage(user);
    if (page === "search") return loadSearchPage(user);
    if (page === "professional-profile") return loadProfessionalProfile(user);
    if (page === "booking") return loadBookingPage(user);
    if (page === "appointments") return loadAppointmentsPage(user);
    if (page === "professional-calendar") {
        if (user.perfil !== "nutricionista") {
            window.location.replace("../dashboard.html");
            return;
        }
        return loadProfessionalCalendarPage();
    }
    if (page === "professional-profile-edit") {
        if (user.perfil !== "nutricionista") {
            window.location.replace("../dashboard.html");
            return;
        }
        const form = document.getElementById("professional-profile-form");
        form.elements.telefone.value = user.telefone;
        form.elements.endereco.value = user.endereco;
        form.elements.cep.value = user.cep;
        form.elements.estado.value = user.estado;
        form.elements.especialidades.value = user.especialidades.join(", ");
        form.elements.biografia.value = user.biografia;
        form.elements.valor_consulta.value = user.valor_consulta;
        form.elements.pagseguro_link.value = user.pagseguro_link || "";
        return;
    }
}

function initProtectedPage() {
    const page = document.body.dataset.page;
    const isSubpage = page !== "dashboard";
    const loginUrl = isSubpage ? "./auth/login.html" : "./pages/auth/login.html";
    const logoutButton = document.getElementById("logout-button");
    if (logoutButton) {
        logoutButton.addEventListener("click", () => {
            api.limparToken();
            sessionStorage.removeItem(USER_KEY);
            window.location.href = loginUrl;
        });
    }

    initPageHandlers();

    if (!api.possuiToken()) {
        window.location.replace(loginUrl);
        return;
    }

    loadCurrentPage().catch((error) => {
        if (error.status === 401) {
            api.limparToken();
            sessionStorage.removeItem(USER_KEY);
            window.location.replace(loginUrl);
            return;
        }
        showDashboardError(error.message || "Não foi possível carregar seus dados.");
    });
}

document.addEventListener("DOMContentLoaded", () => {
    if (document.body.dataset.page === "auth") initAuthPage();
    if (document.body.dataset.page === "password-reset") initPasswordResetPage();
    if (["dashboard", "plans", "patients", "search", "professional-profile", "booking", "appointments", "professional-calendar", "professional-profile-edit"].includes(document.body.dataset.page)) {
        initProtectedPage();
    }
});
