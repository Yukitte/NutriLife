const api = window.NutriLifeAPI;
const TOKEN_KEY = "nutrilife_access_token";
const USER_KEY = "nutrilife_user";
let adminUsersCache = [];

function mostrarToast(mensagem, tipo = "sucesso") {
    if (!mensagem) return;
    let area = document.getElementById("toast-area");
    if (!area) {
        area = document.createElement("div");
        area.id = "toast-area";
        area.className = "toast-area";
        document.body.append(area);
    }
    const toast = document.createElement("div");
    toast.className = `toast toast--${tipo}`;
    toast.setAttribute("role", tipo === "erro" ? "alert" : "status");
    const texto = document.createElement("p");
    texto.textContent = mensagem;
    const fechar = document.createElement("button");
    fechar.type = "button";
    fechar.className = "toast__close";
    fechar.textContent = "✕";
    fechar.setAttribute("aria-label", "Fechar mensagem");
    const remover = () => {
        toast.classList.add("is-leaving");
        window.setTimeout(() => toast.remove(), 200);
    };
    fechar.addEventListener("click", remover);
    toast.append(texto, fechar);
    area.append(toast);
    window.setTimeout(remover, tipo === "erro" ? 6000 : 4000);
}

function setStatus(element, message, type) {
    if (!element) return;
    if (type === "error" || type === "success") {
        element.textContent = "";
        element.className = "auth-status";
        mostrarToast(message, type === "error" ? "erro" : "sucesso");
        return;
    }
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

function montarEnderecoCadastro(values) {
    const { rua, numero, complemento, bairro, cidade, confirmar_senha: _confirmacao, ...resto } = values;
    const complementoTexto = complemento && complemento.trim() ? ` - ${complemento.trim()}` : "";
    return { ...resto, endereco: `${rua.trim()}, ${numero.trim()}${complementoTexto}, ${bairro.trim()}, ${cidade.trim()}` };
}

function configurarCpf(input) {
    if (!input) return;
    input.addEventListener("input", () => {
        const digitos = input.value.replace(/\D/g, "").slice(0, 11);
        input.value = digitos
            .replace(/^(\d{3})(\d)/, "$1.$2")
            .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
            .replace(/\.(\d{3})(\d)/, ".$1-$2");
    });
}

function configurarTelefone(input) {
    if (!input) return;
    input.addEventListener("input", () => {
        const digitos = input.value.replace(/\D/g, "").slice(0, 11);
        let valor = digitos;
        if (digitos.length > 2) valor = `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
        if (digitos.length > 6) {
            const meio = digitos.length === 11 ? 7 : 6;
            valor = `(${digitos.slice(0, 2)}) ${digitos.slice(2, meio)}-${digitos.slice(meio)}`;
        }
        input.value = valor;
    });
}

function configurarConfirmacaoSenha(senha, confirmacao) {
    if (!senha || !confirmacao) return;
    const validar = () => {
        const diferente = confirmacao.value && confirmacao.value !== senha.value;
        confirmacao.setCustomValidity(diferente ? "As senhas não coincidem." : "");
    };
    senha.addEventListener("input", validar);
    confirmacao.addEventListener("input", validar);
}

function adicionarOlhoSenha() {
    document.querySelectorAll('input[type="password"]').forEach((input) => {
        if (input.closest(".password-field")) return;
        const campo = document.createElement("div");
        campo.className = "password-field";
        input.parentNode.insertBefore(campo, input);
        campo.append(input);

        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = "password-toggle";
        botao.setAttribute("aria-label", "Mostrar senha");
        botao.setAttribute("aria-pressed", "false");
        botao.addEventListener("click", () => {
            const mostrar = input.type === "password";
            input.type = mostrar ? "text" : "password";
            botao.classList.toggle("is-visible", mostrar);
            botao.setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha");
            botao.setAttribute("aria-pressed", String(mostrar));
        });
        campo.append(botao);
    });
}

function configurarBuscaCep(form) {
    const cep = form.elements.cep;
    const dica = form.querySelector("#register-cep-hint");
    if (!cep || !dica) return;

    const mostrarDica = (texto, erro = false) => {
        dica.textContent = texto;
        dica.classList.toggle("input-hint--error", erro);
    };

    const buscar = async (digitos) => {
        mostrarDica("Buscando endereço...");
        try {
            const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
            if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
            const dados = await resposta.json();
            if (cep.value.replace(/\D/g, "") !== digitos) return;
            if (dados.erro) {
                mostrarDica("CEP não encontrado. Preencha o endereço manualmente.", true);
                return;
            }
            form.elements.rua.value = dados.logradouro || "";
            form.elements.bairro.value = dados.bairro || "";
            form.elements.cidade.value = dados.localidade || "";
            form.elements.estado.value = dados.uf || "";
            mostrarDica("Endereço encontrado. Confira e informe o número.");
            form.elements.numero.focus();
        } catch {
            mostrarDica("Não foi possível buscar o CEP. Preencha o endereço manualmente.", true);
        }
    };

    cep.addEventListener("input", () => {
        const digitos = cep.value.replace(/\D/g, "").slice(0, 8);
        cep.value = digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
        if (digitos.length === 8) buscar(digitos);
        else mostrarDica("Digite o CEP para preencher o endereço.");
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
            ? error.message || "Este e-mail já está cadastrado."
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
    const password = document.getElementById("reset-password");
    const confirmation = document.getElementById("reset-confirm-password");
    configurarCpf(document.getElementById("reset-cpf"));
    configurarConfirmacaoSenha(password, confirmation);

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const status = document.getElementById("reset-status");
        const button = form.querySelector('button[type="submit"]');
        const values = Object.fromEntries(new FormData(form).entries());
        button.disabled = true;
        try {
            await api.redefinirSenhaPorCpf({ cpf: values.cpf, email: values.email, senha: values.senha });
            setStatus(status, "Senha redefinida. Você já pode fazer login.", "success");
            form.reset();
            button.hidden = true;
        } catch (error) {
            const message = error.status === 422
                ? "Confira o CPF e o e-mail informados."
                : error.message || "Não foi possível redefinir a senha.";
            setStatus(status, message, "error");
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

    const loginForm = document.getElementById("login-form");
    if (loginForm) {
        loginForm.addEventListener("submit", (event) => {
            submitAuthForm(event, ({ email, senha }) => api.login({ email, senha }));
        });
    }
    const registerForm = document.getElementById("register-form");
    if (registerForm) {
        registerForm.addEventListener("submit", (event) => {
            submitAuthForm(event, (values) => api.cadastrarUsuario(montarEnderecoCadastro(values)));
        });
        configurarBuscaCep(registerForm);
        configurarTelefone(registerForm.elements.telefone);
        configurarCpf(registerForm.elements.cpf);
        configurarConfirmacaoSenha(registerForm.elements.senha, registerForm.elements.confirmar_senha);
        registerForm.elements.crn?.addEventListener("input", (event) => {
            event.target.value = event.target.value.toUpperCase();
        });
    }
    document.querySelectorAll(".auth-tab").forEach((tab) => {
        tab.addEventListener("click", () => switchAuthTab(tab.dataset.authTab));
    });
    const typeSelect = document.getElementById("register-type");
    const crnGroup = document.getElementById("register-crn-group");
    const crnInput = document.getElementById("register-crn");
    if (typeSelect && crnGroup && crnInput) {
        const updateCrnRequirement = () => {
            const isNutritionist = typeSelect.value === "nutricionista";
            crnGroup.hidden = !isNutritionist;
            crnInput.required = isNutritionist;
        };
        typeSelect.addEventListener("change", updateCrnRequirement);
        updateCrnRequirement();
    }
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
        alimentos: [{ nome: "", quantidade: 1, medida: "porção", calorias: 0 }],
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

    function buildFoodRow(option, removeLabel, onRemove) {
        const data = option || { nome: "", quantidade: 1, medida: "porção", calorias: 0 };
        const row = createElement("div", "food-option-row");
        const foodName = document.createElement("input");
        foodName.name = "alimento";
        foodName.type = "search";
        foodName.placeholder = "Buscar alimento na TACO ou digitar";
        foodName.setAttribute("aria-label", "Alimento");
        foodName.autocomplete = "off";
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
        quantity.setAttribute("aria-label", "Quantidade");
        const measure = document.createElement("input");
        measure.name = "medida";
        measure.placeholder = "g, xícara...";
        measure.setAttribute("aria-label", "Medida");
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
        calories.setAttribute("aria-label", "Calorias (kcal)");
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
                        searchStatus.textContent = "";
                        searchPanel.hidden = true;
                        row.dispatchEvent(new Event("input", { bubbles: true }));
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
        const nameField = createElement("div", "food-row__name");
        searchPanel.classList.add("food-row__dropdown");
        searchPanel.hidden = true;
        nameField.append(foodName, searchPanel);
        portions.setAttribute("aria-label", "Porção do catálogo");
        const details = createElement("div", "food-row__details");
        details.append(portions, nutritionSummary);
        row.append(nameField, quantity, measure, calories, details);

        const showDropdown = () => {
            searchPanel.hidden = false;
        };
        foodName.addEventListener("focus", showDropdown);
        foodName.addEventListener("input", showDropdown);
        nameField.addEventListener("focusout", (event) => {
            if (!nameField.contains(event.relatedTarget)) {
                window.setTimeout(() => {
                    if (!nameField.contains(document.activeElement)) searchPanel.hidden = true;
                }, 150);
            }
        });
        foodName.addEventListener("keydown", (event) => {
            if (event.key === "Escape") searchPanel.hidden = true;
        });
        if (data.alimento_id) {
            api.obterAlimento(data.alimento_id).then((food) => {
                if (!row.isConnected) return;
                selectCatalogFood(row, food, data);
                row.dispatchEvent(new Event("input", { bubbles: true }));
            }).catch((error) => {
                if (row.isConnected) {
                    searchStatus.textContent =
                        `Não foi possível recuperar o alimento salvo: ${error.message}`;
                }
            });
        }
        const remove = createElement("button", "food-row__remove", "✕");
        remove.type = "button";
        remove.title = removeLabel;
        remove.setAttribute("aria-label", removeLabel);
        remove.addEventListener("click", () => {
            onRemove(row);
            card.dispatchEvent(new Event("input"));
        });
        row.insertBefore(remove, row.querySelector(".food-row__details"));
        return row;
    }

    function addFoodItem(item) {
        const wrapper = createElement("div", "meal-food-item");
        const substitutes = createElement("div", "food-substitutes");
        const addSubstitute = (data) => {
            const row = buildFoodRow(data, "Remover substituição", (target) => target.remove());
            row.classList.add("food-option-row--substitute");
            substitutes.append(row);
        };
        const main = buildFoodRow(item, "Remover alimento", () => {
            if (foods.children.length > 1) {
                wrapper.remove();
            } else {
                showDashboardError("A refeição precisa ter pelo menos um alimento.");
            }
        });
        main.classList.add("food-option-row--main");
        const addSubstituteButton = createElement("button", "food-substitutes__add", "+ substituição");
        addSubstituteButton.type = "button";
        addSubstituteButton.addEventListener("click", () => addSubstitute());
        wrapper.append(main, substitutes, addSubstituteButton);
        ((item && item.substituicoes) || []).forEach(addSubstitute);
        foods.append(wrapper);
    }

    const addFood = createElement("button", "btn btn--ghost meal-editor__add-food", "+ Adicionar alimento");
    addFood.type = "button";
    addFood.addEventListener("click", () => addFoodItem());
    const removeMeal = createElement("button", "btn meal-editor__remove", "Excluir refeição");
    removeMeal.type = "button";
    removeMeal.addEventListener("click", () => {
        if (container.children.length <= 1) {
            showDashboardError("O plano precisa ter pelo menos uma refeição.");
            return;
        }
        const nomeRefeicao = name.value.trim();
        const descricao = nomeRefeicao ? `a refeição "${nomeRefeicao}"` : "esta refeição";
        if (!window.confirm(`Excluir ${descricao} do plano?`)) return;
        card.remove();
        showDashboardSuccess(nomeRefeicao
            ? `Refeição "${nomeRefeicao}" excluída. Salve o plano para confirmar.`
            : "Refeição excluída. Salve o plano para confirmar.");
    });
    name.addEventListener("input", () => {
        legend.textContent = name.value || "Nova refeição";
    });
    name.placeholder = "Ex.: Café da manhã";
    const total = createElement("span", "meal-editor__total", "0 kcal");
    const toggle = createElement("button", "panel-toggle");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Esconder refeição");
    toggle.addEventListener("click", () => {
        const recolhida = card.classList.toggle("is-collapsed");
        toggle.setAttribute("aria-expanded", String(!recolhida));
        toggle.setAttribute("aria-label", recolhida ? "Mostrar refeição" : "Esconder refeição");
    });
    const head = createElement("div", "meal-editor__head");
    head.append(inputGroup("Refeição", name), inputGroup("Horário", hour), total, toggle);
    const columns = createElement("div", "food-columns");
    ["Alimento", "Qtd.", "Medida", "kcal", ""].forEach((titulo) => columns.append(createElement("span", "", titulo)));
    const body = createElement("div", "meal-editor__body");
    const actions = createElement("div", "meal-editor__actions");
    actions.append(addFood, removeMeal);
    body.append(columns, foods, actions);
    const updateTotal = () => {
        const kcal = [...card.querySelectorAll(".food-option-row--main [name='calorias']")]
            .reduce((soma, campo) => soma + (Number(campo.value) || 0), 0);
        total.textContent = `${kcal} kcal`;
    };
    card.addEventListener("input", updateTotal);
    card.addEventListener("change", updateTotal);
    card.append(legend, head, body);
    const mealFoods = alimentosDaRefeicao(meal);
    mealFoods.forEach(addFoodItem);
    if (mealFoods.length === 0) addFoodItem();
    updateTotal();
    container.append(card);
}

document.addEventListener("mousedown", (event) => {
    document.querySelectorAll(".food-row__dropdown:not([hidden])").forEach((dropdown) => {
        if (!dropdown.parentElement.contains(event.target)) dropdown.hidden = true;
    });
});

function alimentosDaRefeicao(meal) {
    if (meal.alimentos) return meal.alimentos;
    if (!meal.opcoes || meal.opcoes.length === 0) return [];
    const [principal, ...substituicoes] = meal.opcoes;
    return [{ ...principal, substituicoes }];
}

function collectMeals(container) {
    return [...container.querySelectorAll(".meal-editor")].map((card) => ({
        horario: card.querySelector('[name="horario"]').value,
        nome: card.querySelector('[name="nome"]').value,
        alimentos: [...card.querySelectorAll(".meal-food-item")].map((item) => ({
            ...readFoodRow(item.querySelector(".food-option-row--main")),
            substituicoes: [...item.querySelectorAll(".food-option-row--substitute")].map(readFoodRow),
        })),
    }));
}

function readFoodRow(row) {
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
}

const MEAL_TEMPLATES = {
    equilibrada: [
        ["07:00", "Café da manhã"],
        ["10:00", "Lanche da manhã"],
        ["12:30", "Almoço"],
        ["16:00", "Lanche da tarde"],
        ["19:30", "Jantar"],
    ],
    emagrecimento: [
        ["07:00", "Café da manhã"],
        ["10:00", "Lanche da manhã"],
        ["12:30", "Almoço"],
        ["16:00", "Lanche da tarde"],
        ["19:00", "Jantar"],
    ],
    ganho_massa: [
        ["07:00", "Café da manhã"],
        ["10:00", "Lanche pré-treino"],
        ["12:30", "Almoço"],
        ["16:00", "Lanche pós-treino"],
        ["19:30", "Jantar"],
        ["21:30", "Ceia"],
    ],
    vegetariana: [
        ["07:00", "Café da manhã"],
        ["10:00", "Lanche da manhã"],
        ["12:30", "Almoço vegetariano"],
        ["16:00", "Lanche da tarde"],
        ["19:30", "Jantar vegetariano"],
    ],
};

function createMealTemplateControls(mealContainer, objectiveInput) {
    const controls = createElement("div", "meal-template-controls");
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Base de refeições");
    select.add(new Option("Selecione uma base de refeições", ""));
    [
        ["equilibrada", "Alimentação equilibrada"],
        ["emagrecimento", "Objetivo: emagrecimento"],
        ["ganho_massa", "Objetivo: ganho de massa"],
        ["vegetariana", "Alimentação vegetariana"],
    ].forEach(([value, label]) => select.add(new Option(label, value)));
    const objectives = {
        equilibrada: "Alimentação equilibrada",
        emagrecimento: "Emagrecimento",
        ganho_massa: "Ganho de massa",
        vegetariana: "Alimentação vegetariana",
    };
    const apply = createElement("button", "btn btn--ghost", "Carregar base");
    apply.type = "button";
    apply.addEventListener("click", () => {
        const template = MEAL_TEMPLATES[select.value];
        if (!template) {
            showDashboardError("Selecione uma base de refeições.");
            return;
        }
        const existingMeals = [...mealContainer.querySelectorAll(".meal-editor")];
        const hasContent = existingMeals.length > 1 || existingMeals.some((meal) =>
            meal.querySelector('[name="nome"]').value.trim()
            || [...meal.querySelectorAll('[name="alimento"]')]
                .some((food) => food.value.trim()),
        );
        if (
            hasContent
            && !window.confirm("Carregar esta base substituirá as refeições atuais. Deseja continuar?")
        ) {
            return;
        }
        if (objectiveInput) objectiveInput.value = objectives[select.value];
        mealContainer.replaceChildren();
        template.forEach(([horario, nome]) => {
            appendMealEditor(mealContainer, { horario, nome, alimentos: [] });
        });
    });
    const note = createElement(
        "p",
        "item-meta meal-template-note",
        "As bases organizam horários e refeições; selecione os alimentos no catálogo TACO e ajuste cada plano às necessidades da paciente.",
    );
    controls.append(
        inputGroup("Base de refeições", select),
        apply,
        note,
    );
    return controls;
}

let html2pdfPromise;

function carregarGeradorPdf() {
    if (window.html2pdf) return Promise.resolve(window.html2pdf);
    if (!html2pdfPromise) {
        html2pdfPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/html2pdf.js@0.14.0/dist/html2pdf.bundle.min.js";
            script.onload = () => resolve(window.html2pdf);
            script.onerror = () => {
                html2pdfPromise = null;
                reject(new Error("Não foi possível carregar o gerador de PDF."));
            };
            document.head.append(script);
        });
    }
    return html2pdfPromise;
}

function montarPlanoPdf(plan, nutricionista) {
    const logo = document.querySelector(".brand-logo")?.src
        || new URL("../assets/images/NutriLife-logo-semfundo.png", window.location.href).href;
    const emitidoEm = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());
    const refeicoes = plan.refeicoes.map((meal) => ({ ...meal, alimentos: alimentosDaRefeicao(meal) }));
    const kcalDaRefeicao = (meal) => meal.alimentos.reduce((total, food) => total + (Number(food.calorias) || 0), 0);
    const kcalDia = refeicoes.reduce((total, meal) => total + kcalDaRefeicao(meal), 0);
    const quantidade = (food) => `${Number(food.quantidade).toLocaleString("pt-BR")} ${food.medida}`;

    const pagina = createElement("div", "pdf-plano");

    const cabecalho = createElement("header", "pdf-header");
    const imagem = document.createElement("img");
    imagem.src = logo;
    imagem.alt = "NutriLife";
    imagem.className = "pdf-logo";
    const titulo = createElement("div", "pdf-header__title");
    titulo.append(
        createElement("span", "pdf-eyebrow", "Plano alimentar"),
        createElement("h1", "", plan.paciente_nome || plan.titulo),
    );
    cabecalho.append(imagem, titulo, createElement("span", "pdf-header__date", `Emitido em ${emitidoEm}`));

    const cards = createElement("section", "pdf-cards");
    const crn = nutricionista?.crn ? formatarCrn(nutricionista.crn) : "";
    [
        ["Nutricionista", plan.nutricionista_nome, crn],
        ["Meta", plan.objetivo || "Não definida", ""],
        ["Duração", `${plan.duracao_meses} ${plan.duracao_meses === 1 ? "mês" : "meses"}`, ""],
        ["Total diário", `${kcalDia.toLocaleString("pt-BR")} kcal`, `${refeicoes.length} refeições`],
    ].forEach(([rotulo, valor, detalhe]) => {
        const card = createElement("div", "pdf-card");
        card.append(createElement("span", "pdf-card__label", rotulo), createElement("strong", "", valor));
        if (detalhe) card.append(createElement("span", "pdf-card__detail", detalhe));
        cards.append(card);
    });

    const orientacoes = createElement("section", "pdf-orientacoes");
    orientacoes.append(createElement("h2", "", "Orientações"), createElement("p", "", plan.descricao));

    const listaRefeicoes = createElement("section", "pdf-refeicoes");
    listaRefeicoes.append(createElement("h2", "", "Refeições"));
    refeicoes.forEach((meal) => {
        const bloco = createElement("article", "pdf-refeicao");
        const topo = createElement("div", "pdf-refeicao__head");
        topo.append(
            createElement("span", "pdf-refeicao__hora", meal.horario),
            createElement("h3", "", meal.nome),
            createElement("span", "pdf-refeicao__kcal", `${kcalDaRefeicao(meal).toLocaleString("pt-BR")} kcal`),
        );
        const tabela = createElement("table", "pdf-tabela");
        const cabecalhoTabela = createElement("thead");
        const linhaTitulos = createElement("tr");
        ["Alimento", "Quantidade", "kcal"].forEach((texto) => linhaTitulos.append(createElement("th", "", texto)));
        cabecalhoTabela.append(linhaTitulos);
        const corpo = createElement("tbody");
        meal.alimentos.forEach((food) => {
            const linha = createElement("tr");
            linha.append(
                createElement("td", "", food.nome),
                createElement("td", "", quantidade(food)),
                createElement("td", "", String(food.calorias)),
            );
            corpo.append(linha);
            (food.substituicoes || []).forEach((sub) => {
                const linhaSub = createElement("tr", "pdf-tabela__sub");
                linhaSub.append(
                    createElement("td", "", `ou ${sub.nome}`),
                    createElement("td", "", quantidade(sub)),
                    createElement("td", "", String(sub.calorias)),
                );
                corpo.append(linhaSub);
            });
        });
        tabela.append(cabecalhoTabela, corpo);
        bloco.append(topo, tabela);
        listaRefeicoes.append(bloco);
    });

    const rodape = createElement(
        "footer",
        "pdf-footer",
        `Plano elaborado por ${plan.nutricionista_nome}${crn ? ` (${crn})` : ""} · NutriLife — cuidado nutricional de forma simples, organizada e próxima.`,
    );

    pagina.append(cabecalho, cards, orientacoes, listaRefeicoes, rodape);
    return pagina;
}

async function baixarPlanoPdf(plan) {
    const [html2pdf, nutricionista] = await Promise.all([
        carregarGeradorPdf(),
        api.obterNutricionista(plan.nutricionista_id).catch(() => null),
    ]);
    const pagina = montarPlanoPdf(plan, nutricionista);
    const area = createElement("div", "pdf-area");
    area.append(pagina);
    document.body.append(area);
    try {
        await Promise.all([...pagina.querySelectorAll("img")].map((img) => img.decode().catch(() => {})));
        const nomeArquivo = (plan.paciente_nome || plan.titulo || "plano")
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        await html2pdf()
            .set({
                margin: [10, 10, 14, 10],
                filename: `plano-alimentar-${nomeArquivo}.pdf`,
                image: { type: "jpeg", quality: 0.96 },
                html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
                jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
                pagebreak: { mode: ["css", "legacy"], avoid: [".pdf-refeicao", ".pdf-cards", ".pdf-header"] },
            })
            .from(pagina)
            .toPdf()
            .get("pdf")
            .then((pdf) => {
                const total = pdf.internal.getNumberOfPages();
                for (let numero = 1; numero <= total; numero += 1) {
                    pdf.setPage(numero);
                    pdf.setFontSize(8);
                    pdf.setTextColor(51, 102, 51);
                    pdf.text(
                        `NutriLife · Página ${numero} de ${total}`,
                        pdf.internal.pageSize.getWidth() / 2,
                        pdf.internal.pageSize.getHeight() - 6,
                        { align: "center" },
                    );
                }
            })
            .save();
    } finally {
        area.remove();
    }
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
            createElement("h4", "item-title", plan.paciente_nome || plan.titulo),
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
            const descreverAlimento = (option) => {
                const nutrition = option.alimento_id
                    ? ` · Proteína ${nutrientText(option.proteina_g, "g")}, carboidratos ${nutrientText(option.carboidrato_g, "g")}, gorduras ${nutrientText(option.gordura_g, "g")}`
                    : "";
                return `${option.nome} — ${option.quantidade} ${option.medida} · ${option.calorias} kcal${nutrition}`;
            };
            const alimentos = alimentosDaRefeicao(meal);
            const totalKcal = alimentos.reduce((total, food) => total + (Number(food.calorias) || 0), 0);
            section.querySelector("h5").textContent += ` · ${totalKcal} kcal`;
            const options = createElement("ul", "plan-meal__foods");
            alimentos.forEach((food) => {
                const item = createElement("li", "", descreverAlimento(food));
                if (food.substituicoes && food.substituicoes.length) {
                    const substitutes = createElement("ul", "plan-meal__substitutes");
                    food.substituicoes.forEach((substitute) => {
                        substitutes.append(createElement("li", "", `ou ${descreverAlimento(substitute)}`));
                    });
                    item.append(substitutes);
                }
                options.append(item);
            });
            section.append(options);
            meals.append(section);
        });
        article.append(meals);

        const download = createElement("button", "btn btn--primary plan-download", "Baixar plano em PDF");
        download.type = "button";
        download.addEventListener("click", async () => {
            download.disabled = true;
            download.textContent = "Gerando PDF...";
            try {
                await baixarPlanoPdf(plan);
                showDashboardSuccess("PDF do plano alimentar baixado.");
            } catch {
                showDashboardError("Não foi possível gerar o PDF. Verifique sua conexão e tente novamente.");
            } finally {
                download.disabled = false;
                download.textContent = "Baixar plano em PDF";
            }
        });
        article.append(download);

        const currentUser = JSON.parse(sessionStorage.getItem(USER_KEY) || "{}");
        if (currentUser.perfil === "nutricionista") {
            const editButton = createElement("button", "btn btn--ghost", "Editar plano");
            editButton.type = "button";
            const editForm = createElement("form", "dashboard-form plan-edit-form");
            editForm.hidden = true;

            const title = document.createElement("input");
            title.name = "titulo";
            title.value = plan.paciente_nome || plan.titulo;
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
            editForm.append(createMealTemplateControls(mealsInput, objective));
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
                    showDashboardSuccess("Plano atualizado com sucesso.");
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
                    showDashboardSuccess("Plano excluído.");
                } catch (error) {
                    showDashboardError(error.message);
                }
            });
            article.append(editButton, editForm, removeButton);
        }
        container.append(article);
    });
}

function renderAdminUsers(users) {
    const container = document.getElementById("admin-users-list");
    const search = document.getElementById("admin-user-search").value
        .trim()
        .toLocaleLowerCase("pt-BR");
    const filteredUsers = users.filter((user) =>
        `${user.nome} ${user.email}`.toLocaleLowerCase("pt-BR").includes(search),
    );
    container.replaceChildren();
    if (!filteredUsers.length) {
        container.append(createElement("p", "item-meta", "Nenhum usuário encontrado."));
        return;
    }

    filteredUsers.forEach((user) => {
        const card = createElement("article", "admin-user-card");
        const header = createElement("div", "admin-user-card__header");
        header.append(
            createElement("h2", "", user.nome),
            createElement(
                "span",
                `item-tag${user.ativo ? "" : " admin-user-status--inactive"}`,
                user.ativo ? "Ativo" : "Desativado",
            ),
        );
        card.append(header, createElement("p", "item-meta", user.email));
        if (user.perfil === "administrador") {
            card.append(createElement(
                "p",
                "item-meta",
                "Conta administrativa protegida; não pode ser editada ou excluída por este painel.",
            ));
            container.append(card);
            return;
        }

        const form = createElement("form", "dashboard-form admin-user-form");
        const name = document.createElement("input");
        name.name = "nome";
        name.value = user.nome;
        name.required = true;
        name.minLength = 2;
        name.maxLength = 120;
        const email = document.createElement("input");
        email.name = "email";
        email.type = "email";
        email.value = user.email;
        email.required = true;
        const phone = document.createElement("input");
        phone.name = "telefone";
        phone.type = "tel";
        phone.value = user.telefone || "";
        const address = document.createElement("input");
        address.name = "endereco";
        address.value = user.endereco || "";
        const zip = document.createElement("input");
        zip.name = "cep";
        zip.value = user.cep || "";
        const state = document.createElement("select");
        state.name = "estado";
        state.add(new Option("Selecione", ""));
        [
            "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT",
            "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO",
            "RR", "SC", "SP", "SE", "TO",
        ].forEach((uf) => state.add(new Option(uf, uf)));
        state.value = user.estado || "";
        const profile = document.createElement("select");
        profile.name = "perfil";
        profile.add(new Option("Paciente", "paciente"));
        profile.add(new Option("Nutricionista", "nutricionista"));
        profile.value = user.perfil;
        const crn = document.createElement("input");
        crn.name = "crn";
        crn.value = user.crn || "";
        crn.minLength = 4;
        crn.maxLength = 20;
        const crnGroup = inputGroup("CRN", crn);
        const specialties = document.createElement("input");
        specialties.name = "especialidades";
        specialties.value = (user.especialidades || []).join(", ");
        const biography = document.createElement("textarea");
        biography.name = "biografia";
        biography.value = user.biografia || "";
        biography.maxLength = 2000;
        const consultationPrice = document.createElement("input");
        consultationPrice.name = "valor_consulta";
        consultationPrice.type = "number";
        consultationPrice.min = "0";
        consultationPrice.max = "100000";
        consultationPrice.step = "0.01";
        consultationPrice.value = String(user.valor_consulta || 0);
        const paymentLink = document.createElement("input");
        paymentLink.name = "pagseguro_link";
        paymentLink.type = "url";
        paymentLink.value = user.pagseguro_link || "";
        const active = document.createElement("input");
        active.name = "ativo";
        active.type = "checkbox";
        active.checked = user.ativo;
        const activeGroup = inputGroup("Conta ativa", active);
        activeGroup.classList.add("admin-user-form__active");
        const professionalFields = createElement(
            "div",
            "admin-user-form__professional-fields",
        );
        professionalFields.append(
            inputGroup("Especialidades (separadas por vírgula)", specialties),
            inputGroup("Biografia", biography),
            inputGroup("Valor da consulta (R$)", consultationPrice),
            inputGroup("Link de pagamento (HTTPS)", paymentLink),
        );
        const updateProfessionalFields = () => {
            const isNutritionist = profile.value === "nutricionista";
            crnGroup.hidden = !isNutritionist;
            crn.required = isNutritionist;
            professionalFields.hidden = !isNutritionist;
        };
        profile.addEventListener("change", updateProfessionalFields);
        updateProfessionalFields();

        form.append(
            inputGroup("Nome completo", name),
            inputGroup("E-mail", email),
            inputGroup("Telefone", phone),
            inputGroup("Endereço", address),
            inputGroup("CEP", zip),
            inputGroup("Estado (UF)", state),
            inputGroup("Perfil", profile),
            crnGroup,
            professionalFields,
            activeGroup,
        );
        const actions = createElement("div", "admin-user-actions");
        const save = createElement("button", "btn btn--primary", "Salvar alterações");
        save.type = "submit";
        actions.append(save);
        if (user.id !== JSON.parse(sessionStorage.getItem(USER_KEY) || "{}").id) {
            const remove = createElement("button", "btn btn--ghost", "Excluir conta");
            remove.type = "button";
            remove.addEventListener("click", async () => {
                if (!window.confirm(
                    `Excluir a conta de ${user.nome}? Contas com consultas ou planos só podem ser desativadas.`,
                )) return;
                remove.disabled = true;
                try {
                    await api.excluirUsuarioAdministrador(user.id);
                    await loadAdminUsersPage();
                    showDashboardSuccess("Usuário excluído.");
                } catch (error) {
                    showDashboardError(error.message);
                    remove.disabled = false;
                }
            });
            actions.append(remove);
        }
        form.append(actions);
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            save.disabled = true;
            const values = Object.fromEntries(new FormData(form).entries());
            const payload = {
                nome: values.nome,
                email: values.email,
                telefone: values.telefone || null,
                endereco: values.endereco || null,
                cep: values.cep || null,
                estado: values.estado || null,
                perfil: values.perfil,
                ativo: active.checked,
            };
            if (values.perfil === "nutricionista") {
                payload.crn = values.crn;
                payload.especialidades = values.especialidades
                    .split(",").map((value) => value.trim()).filter(Boolean);
                payload.biografia = values.biografia || null;
                payload.valor_consulta = Number(values.valor_consulta);
                payload.pagseguro_link = values.pagseguro_link || null;
            } else {
                payload.crn = null;
            }
            try {
                await api.atualizarUsuarioAdministrador(user.id, payload);
                await loadAdminUsersPage();
                showDashboardSuccess("Usuário atualizado.");
            } catch (error) {
                showDashboardError(error.message);
                save.disabled = false;
            }
        });
        card.append(form);
        container.append(card);
    });
}

async function loadAdminUsersPage() {
    adminUsersCache = await api.listarUsuariosAdministrador();
    const search = document.getElementById("admin-user-search");
    if (search.dataset.bound !== "true") {
        search.addEventListener("input", () => renderAdminUsers(adminUsersCache));
        search.dataset.bound = "true";
    }
    renderAdminUsers(adminUsersCache);
}

function showDashboardError(message) {
    mostrarToast(message || "Não foi possível concluir a ação.", "erro");
}

function showDashboardSuccess(message) {
    mostrarToast(message, "sucesso");
}

function formatarCrn(crn) {
    if (!crn) return "CRN não informado";
    return /^crn/i.test(crn) ? crn : `CRN ${crn}`;
}

function formatDateTime(value) {
    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        hourCycle: "h23",
    }).format(new Date(value));
}

function formatTime(value) {
    return new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(new Date(value));
}

async function loadSearchPage(user) {
    if (user.perfil !== "paciente") {
        window.location.replace("../dashboard.html");
        return;
    }
    const dateElement = document.getElementById("today-date");
    if (dateElement) {
        dateElement.textContent = new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "full",
        }).format(new Date());
    }
    const results = document.getElementById("nutritionists-list");

    async function search(state, radius) {
        results.replaceChildren(createElement("p", "item-meta", "Buscando profissionais..."));
        try {
            let professionals;
            try {
                professionals = await api.listarNutricionistasProximos({ estado: state, raioKm: radius });
            } catch (error) {
                if (error.status !== 422 || radius) throw error;
                professionals = await api.listarNutricionistas(state);
            }
            results.replaceChildren();
            if (!professionals.length) {
                results.append(createElement("p", "item-meta", radius
                    ? `Nenhum profissional encontrado em até ${radius} km.`
                    : "Nenhum profissional encontrado para esse estado."));
                return;
            }
            professionals.forEach((professional) => {
                const card = createElement("article", "panel professional-card");
                if (professional.distancia_km != null) {
                    card.append(createElement("span", "professional-distance", `${professional.distancia_km.toLocaleString("pt-BR")} km de você`));
                }
                card.append(
                    createElement("h2", "", professional.nome),
                    createElement("p", "item-meta", `${formatarCrn(professional.crn)} · ${professional.estado}`),
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
        search(
            document.getElementById("state-filter").value,
            document.getElementById("distance-filter")?.value || "",
        );
    });
    await search("", "");
}

async function loadPatientHomePage(user) {
    if (user.perfil !== "paciente") {
        window.location.replace("../dashboard.html");
        return;
    }
    const [plans, appointments] = await Promise.all([
        api.listarPlanos(),
        api.listarConsultas(),
    ]);
    document.getElementById("patient-plans-count").textContent = String(plans.length);
    document.getElementById("patient-appointments-count").textContent = String(appointments.length);
    await loadSearchPage(user);
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
    const iniciais = professional.nome.split(" ").slice(0, 2).map((parte) => parte[0]).join("").toUpperCase();
    const preco = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(professional.valor_consulta);
    const desde = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" })
        .format(new Date(`${professional.data_inicio}T12:00:00`));

    const hero = createElement("section", "pro-hero");
    const info = createElement("div", "pro-hero__info");
    info.append(
        createElement("span", "eyebrow", `${formatarCrn(professional.crn)}`),
        createElement("h1", "", professional.nome),
        createElement("p", "pro-hero__specialty", professional.especialidades[0] || "Nutricionista"),
    );
    const tags = createElement("div", "pro-tags");
    tags.append(createElement("span", "pro-tag", professional.estado));
    info.append(tags);

    const cta = createElement("div", "pro-hero__cta");
    const price = createElement("span", "pro-hero__price", "Consulta");
    price.append(createElement("strong", "", preco));
    const schedule = createElement("a", "btn btn--primary", "Marcar consulta");
    schedule.href = `./agendamento.html?id=${encodeURIComponent(professional.id)}`;
    cta.append(price, schedule);
    if (professional.telefone) {
        const phone = professional.telefone.startsWith("55")
            ? professional.telefone
            : `55${professional.telefone}`;
        const whatsapp = createElement("a", "btn btn--ghost", "Falar pelo WhatsApp");
        whatsapp.href = `https://wa.me/${phone}`;
        whatsapp.target = "_blank";
        whatsapp.rel = "noopener noreferrer";
        cta.append(whatsapp);
    }
    hero.append(createElement("span", "pro-hero__avatar", iniciais), info, cta);

    const stats = createElement("section", "pro-stats");
    [
        [professional.nota_media ? `${professional.nota_media.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 5` : "—", professional.nota_media ? "nota média" : "ainda sem avaliações"],
        [String(professional.total_pacientes), "pacientes atendidos"],
        [desde.replace(" de ", "/").replace(".", ""), "no NutriLife desde"],
    ].forEach(([valor, rotulo]) => {
        const stat = createElement("article", "pro-stat");
        stat.append(createElement("span", "pro-stat__value", valor), createElement("span", "pro-stat__label", rotulo));
        stats.append(stat);
    });

    const about = createElement("section", "pro-section");
    about.append(
        createElement("h2", "", "Sobre"),
        createElement("p", "pro-bio", professional.biografia || "Este profissional ainda não adicionou uma biografia."),
        createElement("h3", "", "Especialidades"),
    );
    const specialties = createElement("div", "pro-tags");
    (professional.especialidades.length ? professional.especialidades : ["Não informadas"])
        .forEach((nome) => specialties.append(createElement("span", "pro-tag pro-tag--outline", nome)));
    about.append(specialties);

    const back = createElement("a", "pro-back", "← Voltar para nutricionistas");
    back.href = "./busca.html";
    const reviews = createElement("section", "pro-section pro-reviews");
    const reviewsHead = createElement("div", "pro-reviews__head");
    reviewsHead.append(createElement("h2", "", "Avaliações"), createElement("span", "pro-reviews__count", ""));
    reviews.append(
        reviewsHead,
        createElement("div", "review-form-area"),
        createElement("ul", "reviews"),
    );

    container.replaceChildren(back, hero, stats, about, reviews);
    await carregarComentariosDoPerfil(professional, reviews);
}

function estrelasTexto(nota) {
    return "★".repeat(nota) + "☆".repeat(5 - nota);
}

function formatarDataComentario(valor) {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(valor));
}

function criarCardComentario(comentario, nomeNutricionista, aoResponder) {
    const item = createElement("li", "review");
    const avatar = createElement("span", "review__avatar", comentario.anonimo ? "?" : comentario.autor.charAt(0).toUpperCase());
    avatar.setAttribute("aria-hidden", "true");
    const corpo = createElement("div", "review__body");
    const cabecalho = createElement("div", "review__head");
    const estrelas = createElement("span", "review__stars", estrelasTexto(comentario.nota));
    estrelas.setAttribute("aria-label", `Nota ${comentario.nota} de 5`);
    cabecalho.append(createElement("strong", "", comentario.autor), estrelas);
    const data = createElement("time", "review__date", formatarDataComentario(comentario.criado_em));
    data.dateTime = comentario.criado_em;
    corpo.append(cabecalho, createElement("p", "", comentario.comentario), data);

    if (comentario.resposta) {
        const resposta = createElement("div", "review__reply");
        const rotulo = createElement("span", "review__reply-label", "Resposta de ");
        rotulo.append(createElement("strong", "", nomeNutricionista));
        const dataResposta = createElement("time", "review__date", formatarDataComentario(comentario.resposta.respondido_em));
        resposta.append(rotulo, createElement("p", "", comentario.resposta.texto), dataResposta);
        corpo.append(resposta);
    }

    if (aoResponder) {
        const form = createElement("form", "review-reply-form");
        const campo = document.createElement("textarea");
        campo.name = "texto";
        campo.required = true;
        campo.minLength = 2;
        campo.maxLength = 1000;
        campo.rows = 2;
        campo.placeholder = "Escreva sua resposta ao paciente";
        campo.value = comentario.resposta?.texto || "";
        const botao = createElement("button", "btn btn--primary", comentario.resposta ? "Atualizar resposta" : "Responder");
        botao.type = "submit";
        form.append(campo, botao);
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            botao.disabled = true;
            try {
                await aoResponder(comentario.id, campo.value);
            } catch (error) {
                showDashboardError(error.message || "Não foi possível salvar a resposta.");
                botao.disabled = false;
            }
        });
        corpo.append(form);
    }

    item.append(avatar, corpo);
    return item;
}

function criarFormularioComentario(comentarioAtual, aoSalvar) {
    const form = createElement("form", "review-form panel");
    form.id = "review-form";
    form.dataset.collapsible = "";
    const cabecalho = createElement("div", "panel__head");
    const titulo = comentarioAtual ? "Editar seu comentário" : "Deixe seu comentário";
    const alternar = createElement("button", "panel-toggle");
    alternar.type = "button";
    cabecalho.append(createElement("h3", "", titulo), alternar);
    form.append(cabecalho);

    const seletor = createElement("div", "star-input");
    seletor.setAttribute("role", "radiogroup");
    seletor.setAttribute("aria-label", "Nota de 1 a 5 estrelas");
    let nota = comentarioAtual?.nota || 0;
    const botoes = [1, 2, 3, 4, 5].map((valor) => {
        const estrela = createElement("button", "star-input__star", "★");
        estrela.type = "button";
        estrela.setAttribute("role", "radio");
        estrela.setAttribute("aria-label", `${valor} ${valor === 1 ? "estrela" : "estrelas"}`);
        estrela.addEventListener("click", () => {
            nota = valor;
            atualizarEstrelas();
        });
        seletor.append(estrela);
        return estrela;
    });
    const atualizarEstrelas = () => botoes.forEach((estrela, i) => {
        estrela.classList.toggle("is-active", i < nota);
        estrela.setAttribute("aria-checked", String(i + 1 === nota));
    });
    atualizarEstrelas();

    const campo = document.createElement("textarea");
    campo.name = "comentario";
    campo.required = true;
    campo.minLength = 3;
    campo.maxLength = 1000;
    campo.rows = 4;
    campo.placeholder = "Conte como foi seu acompanhamento";
    campo.value = comentarioAtual?.comentario || "";

    const anonimo = createElement("label", "review-form__anonymous");
    const caixa = document.createElement("input");
    caixa.type = "checkbox";
    caixa.checked = Boolean(comentarioAtual?.anonimo);
    anonimo.append(caixa, document.createTextNode(" Publicar como anônimo"));

    const status = createElement("p", "auth-status", "");
    const botao = createElement("button", "btn btn--primary", comentarioAtual ? "Atualizar comentário" : "Publicar comentário");
    botao.type = "submit";
    form.append(seletor, campo, anonimo, botao, status);
    configurarCardRecolhivel(form, Boolean(comentarioAtual));

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!nota) {
            setStatus(status, "Escolha uma nota de 1 a 5 estrelas.", "error");
            return;
        }
        botao.disabled = true;
        try {
            await aoSalvar({ nota, comentario: campo.value, anonimo: caixa.checked });
        } catch (error) {
            setStatus(status, error.message || "Não foi possível salvar o comentário.", "error");
            botao.disabled = false;
        }
    });
    return form;
}

async function carregarComentariosDoPerfil(professional, secao) {
    const lista = secao.querySelector(".reviews");
    const areaFormulario = secao.querySelector(".review-form-area");
    const contador = secao.querySelector(".pro-reviews__count");

    const [comentarios, meu] = await Promise.all([
        api.listarComentarios(professional.id),
        api.meuComentario(professional.id).catch(() => ({ pode_comentar: false, comentario: null })),
    ]);

    contador.textContent = comentarios.length === 1 ? "1 avaliação" : `${comentarios.length} avaliações`;
    lista.replaceChildren(...comentarios.map((comentario) => criarCardComentario(comentario, professional.nome)));
    if (!comentarios.length) {
        lista.append(createElement("li", "reviews-empty", "Este nutricionista ainda não recebeu avaliações."));
    }

    if (meu.pode_comentar) {
        areaFormulario.replaceChildren(criarFormularioComentario(meu.comentario, async (dados) => {
            await api.salvarComentario(professional.id, dados);
            await carregarComentariosDoPerfil(professional, secao);
            showDashboardSuccess(meu.comentario ? "Comentário atualizado." : "Comentário publicado.");
        }));
    } else {
        areaFormulario.replaceChildren(createElement(
            "p",
            "item-meta review-form-hint",
            "Você poderá avaliar este nutricionista depois de receber um plano alimentar ou ter uma consulta com ele.",
        ));
    }
}

async function carregarComentariosRecebidos(nomeNutricionista) {
    const lista = document.getElementById("received-reviews");
    if (!lista) return;
    const comentarios = await api.comentariosRecebidos();
    lista.replaceChildren(...comentarios.map((comentario) => criarCardComentario(
        comentario,
        nomeNutricionista,
        async (comentarioId, texto) => {
            await api.responderComentario(comentarioId, texto);
            await carregarComentariosRecebidos(nomeNutricionista);
            showDashboardSuccess("Resposta enviada.");
        },
    )));
    if (!comentarios.length) {
        lista.append(createElement("li", "reviews-empty", "Você ainda não recebeu comentários de pacientes."));
    }
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
        const firstWeekday = month.getDay();
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
                            const message = appointment.link_pagamento
                                ? "Horário reservado. A consulta aguarda a confirmação manual do pagamento."
                                : "Horário solicitado. Aguarde a confirmação da nutricionista.";
                            slotsContainer.replaceChildren(createElement("p", "item-meta", message));
                            showDashboardSuccess(message);
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

function renderPatientAssessmentSummary(card, assessment) {
    if (!assessment) return;
    const summary = createElement("section", "consultation-summary");
    summary.append(createElement("h4", "", "Resumo da consulta"));
    const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
    summary.append(createElement(
        "p",
        "",
        `Peso: ${numberFormat.format(assessment.peso_kg)} kg · Altura: ${numberFormat.format(assessment.altura_cm)} cm · IMC: ${numberFormat.format(assessment.imc)}`,
    ));
    summary.append(createElement(
        "p",
        "item-meta",
        `Avaliação registrada em ${new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
        }).format(new Date(assessment.data_registro))}`,
    ));
    summary.append(createElement(
        "p",
        "item-meta",
        assessment.taxa_metabolica_basal_kcal === null
            ? "TMB: estimativa automática indisponível para menores de 18 anos."
            : `TMB estimada: ${assessment.taxa_metabolica_basal_kcal} kcal/dia`,
    ));
    card.append(summary);
}

function createAssessmentNumberField(label, name, value, min, max, step) {
    const input = document.createElement("input");
    input.name = name;
    input.type = "number";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.required = name !== "circunferencia_abdominal_cm";
    if (value !== undefined && value !== null) input.value = String(value);
    return { input, group: inputGroup(label, input) };
}

function createAssessmentEditor(appointment, user, savedAssessment) {
    const section = createElement("section", "consultation-assessment");
    section.append(createElement("h4", "", "Avaliação nutricional"));
    const form = createElement("form", "dashboard-form consultation-assessment__form");
    const age = createAssessmentNumberField("Idade (anos)", "idade_anos", savedAssessment?.idade_anos, 1, 120, 1);
    const sex = document.createElement("select");
    sex.name = "sexo_biologico";
    sex.required = true;
    sex.add(new Option("Selecione", ""));
    sex.add(new Option("Feminino", "feminino"));
    sex.add(new Option("Masculino", "masculino"));
    if (savedAssessment?.sexo_biologico) sex.value = savedAssessment.sexo_biologico;
    const weight = createAssessmentNumberField("Peso (kg)", "peso_kg", savedAssessment?.peso_kg, 0.1, 500, 0.1);
    const height = createAssessmentNumberField("Altura (cm)", "altura_cm", savedAssessment?.altura_cm, 1, 260, 0.1);
    const waist = createAssessmentNumberField(
        "Circunferência abdominal (cm, opcional)",
        "circunferencia_abdominal_cm",
        savedAssessment?.circunferencia_abdominal_cm,
        0.1,
        300,
        0.1,
    );
    const notes = document.createElement("textarea");
    notes.name = "anotacoes";
    notes.maxLength = 5000;
    notes.value = savedAssessment?.anotacoes || "";
    const fields = createElement("div", "consultation-assessment__fields");
    fields.append(
        age.group,
        inputGroup("Sexo biológico (para a estimativa da TMB)", sex),
        weight.group,
        height.group,
        waist.group,
    );
    const notesGroup = inputGroup(
        "Anotações clínicas (visíveis somente para a nutricionista)",
        notes,
    );
    notesGroup.classList.add("consultation-assessment__notes");
    const submit = createElement("button", "btn btn--primary", "Salvar avaliação");
    submit.type = "submit";
    const status = createElement("p", "item-meta", "");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    form.append(
        fields,
        notesGroup,
        createElement(
            "p",
            "item-meta consultation-assessment__notice",
            "O IMC e a TMB são calculados pelo sistema. A TMB usa a fórmula Mifflin–St Jeor para adultos; para menores de 18 anos ela não é estimada automaticamente.",
        ),
        status,
        submit,
    );
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        submit.disabled = true;
        status.textContent = "Salvando avaliação...";
        const payload = Object.fromEntries(new FormData(form).entries());
        payload.idade_anos = Number(payload.idade_anos);
        payload.peso_kg = Number(payload.peso_kg);
        payload.altura_cm = Number(payload.altura_cm);
        payload.circunferencia_abdominal_cm = payload.circunferencia_abdominal_cm
            ? Number(payload.circunferencia_abdominal_cm)
            : null;
        try {
            await api.salvarAvaliacaoConsulta(appointment.id, payload);
            await loadAppointmentsPage(user);
            showDashboardSuccess("Avaliação salva e vinculada a este paciente.");
        } catch (error) {
            showDashboardError(error.message || "Não foi possível salvar a avaliação.");
            submit.disabled = false;
        }
    });
    section.append(form);
    return section;
}

async function openConsultationAssessment(card, appointment, user, button) {
    button.disabled = true;
    try {
        const existing = card.querySelector(".consultation-assessment");
        if (existing) {
            existing.remove();
            return;
        }
        const assessment = appointment.avaliacao_registrada
            ? await api.obterAvaliacaoConsulta(appointment.id)
            : null;
        card.append(createAssessmentEditor(appointment, user, assessment));
    } catch (error) {
        showDashboardError(error.message || "Não foi possível carregar a avaliação.");
    } finally {
        button.disabled = false;
    }
}

async function loadAppointmentsPage(user) {
    const items = await api.listarConsultas();
    const container = document.getElementById("appointments-list");
    container.replaceChildren();
    const patientId = new URLSearchParams(window.location.search).get("paciente_id");
    const visibleItems = user.perfil === "nutricionista" && patientId
        ? items.filter((appointment) => appointment.paciente_id === patientId)
        : items;
    if (!visibleItems.length) {
        container.append(createElement("p", "item-meta", "Você ainda não tem consultas."));
        return;
    }
    visibleItems.forEach((appointment) => {
        const card = createElement("article", "panel appointment-card");
        const otherParty = user.perfil === "paciente"
            ? `Nutricionista: ${appointment.nutricionista_nome}`
            : `Paciente: ${appointment.paciente_nome}`;
        const appointmentStatus = {
            pendente_pagamento: "Aguardando pagamento",
            pendente_confirmacao: "Aguardando confirmação",
            confirmada: "Confirmada",
            cancelada: "Cancelada",
        }[appointment.status] || appointment.status.replaceAll("_", " ");
        card.append(
            createElement("h3", "", otherParty),
            createElement("p", "", formatDateTime(appointment.inicio)),
            createElement(
                "p",
                `item-tag item-tag--${appointment.status}`,
                appointmentStatus,
            ),
        );
        if (user.perfil === "nutricionista" && appointment.status === "confirmada") {
            const assessmentButton = createElement(
                "button",
                "btn btn--ghost",
                appointment.avaliacao_registrada ? "Editar avaliação" : "Registrar avaliação",
            );
            assessmentButton.type = "button";
            assessmentButton.addEventListener("click", () => {
                openConsultationAssessment(card, appointment, user, assessmentButton);
            });
            card.append(assessmentButton);
        }
        if (user.perfil === "paciente") {
            renderPatientAssessmentSummary(card, appointment.resumo_avaliacao);
        }
        if (user.perfil === "paciente" && appointment.status === "pendente_pagamento" && appointment.link_pagamento) {
            const payment = createElement("a", "btn btn--primary", "Pagar pelo PagSeguro");
            payment.href = appointment.link_pagamento;
            payment.target = "_blank";
            payment.rel = "noopener noreferrer";
            card.append(payment);
        }
        if (
            user.perfil === "nutricionista"
            && ["pendente_pagamento", "pendente_confirmacao"].includes(appointment.status)
        ) {
            if (appointment.link_pagamento) {
                const payment = createElement("a", "btn btn--ghost", "Conferir pagamento");
                payment.href = appointment.link_pagamento;
                payment.target = "_blank";
                payment.rel = "noopener noreferrer";
                card.append(payment);
            }
            const confirm = createElement(
                "button",
                "btn btn--primary",
                appointment.link_pagamento ? "Confirmar pagamento" : "Confirmar consulta",
            );
            confirm.type = "button";
            confirm.addEventListener("click", async () => {
                confirm.disabled = true;
                try {
                    await api.confirmarConsulta(appointment.id);
                    await loadAppointmentsPage(user);
                    showDashboardSuccess("Consulta confirmada.");
                } catch (error) {
                    showDashboardError(error.message);
                    confirm.disabled = false;
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
                    showDashboardSuccess("Consulta cancelada.");
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
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
];

function calendarWeekdayToAvailabilityIndex(day) {
    return (day + 6) % 7;
}

function availabilityIndexToWeekdayName(day) {
    return WEEKDAY_NAMES[(day + 1) % 7];
}

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
    remove.setAttribute("aria-label", `Remover horário de ${availabilityIndexToWeekdayName(day)}`);
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
    const dayOfWeek = calendarWeekdayToAvailabilityIndex(selectedDate.getDay());
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
    const firstWeekday = month.getDay();
    for (let blank = 0; blank < firstWeekday; blank += 1) {
        calendar.append(createElement("span", "calendar-day calendar-day--empty", ""));
    }
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(month.getFullYear(), month.getMonth(), day);
        const dayOfWeek = calendarWeekdayToAvailabilityIndex(date.getDay());
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
    WEEKDAY_NAMES.forEach((weekdayName, calendarDay) => {
        const day = calendarWeekdayToAvailabilityIndex(calendarDay);
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
            showDashboardSuccess("Disponibilidade salva.");
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
        const patientSelect = document.getElementById("plan-patient");
        const titleInput = document.getElementById("plan-title");
        patientSelect.addEventListener("change", () => {
            const patientName = patientSelect.selectedOptions[0]?.dataset.patientName;
            if (patientName) titleInput.value = patientName;
        });
        createPlanForm.insertBefore(
            createMealTemplateControls(
                mealEditor,
                document.getElementById("plan-objective"),
            ),
            mealEditor,
        );
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
                showDashboardSuccess("Plano criado com sucesso.");
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
                showDashboardSuccess("Perfil atualizado.");
            } catch (error) {
                showDashboardError(error.message);
            }
        });
    }
}

const MENU_POR_PERFIL = {
    "overview-nav": ["nutricionista", "administrador"],
    "patient-home-nav": ["paciente"],
    "search-nav": ["paciente"],
    "patients-nav": ["nutricionista"],
    "plans-nav": ["paciente", "nutricionista"],
    "appointments-nav": ["paciente", "nutricionista"],
    "availability-nav": ["nutricionista"],
    "profile-nav": ["nutricionista"],
    "admin-users-nav": ["administrador"],
};

function aplicarMenuPorPerfil(perfil) {
    Object.entries(MENU_POR_PERFIL).forEach(([id, perfis]) => {
        const link = document.getElementById(id);
        if (link) link.hidden = !perfis.includes(perfil);
    });
}

async function setCurrentUser() {
    const user = await api.perfil();
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    const name = document.getElementById("user-name");
    const role = document.getElementById("user-role");
    if (name) name.textContent = user.nome.split(" ")[0];
    if (role) {
        role.textContent = {
            nutricionista: "Nutricionista",
            administrador: "Administrador",
            paciente: "Paciente",
        }[user.perfil];
    }
    const patientsAction = document.getElementById("patients-action");
    if (patientsAction) patientsAction.hidden = user.perfil !== "nutricionista";
    const adminAction = document.getElementById("admin-users-action");
    if (adminAction) adminAction.hidden = user.perfil !== "administrador";
    const patientHomeAction = document.getElementById("patient-home-action");
    if (patientHomeAction) patientHomeAction.hidden = user.perfil !== "paciente";
    aplicarMenuPorPerfil(user.perfil);
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
            const option = new Option(`${patient.nome} — ${patient.email}`, patient.id);
            option.dataset.patientName = patient.nome;
            select.add(option);
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
        const consultationsLink = createElement("a", "btn btn--ghost", "Ver consultas");
        consultationsLink.href = `./consultas.html?paciente_id=${encodeURIComponent(patient.id)}`;
        const actions = createElement("div", "patient-action-links");
        actions.append(plansLink, consultationsLink);
        item.append(info, actions);
        list.append(item);
    });
}

async function loadCurrentPage() {
    const user = await setCurrentUser();
    const page = document.body.dataset.page;
    if (page === "admin-users") {
        if (user.perfil !== "administrador") {
            window.location.replace("../dashboard.html");
            return;
        }
        return loadAdminUsersPage();
    }
    if (page === "dashboard") return loadDashboard(user);
    if (page === "plans") return loadPlansPage(user);
    if (page === "patients") return loadPatientsPage(user);
    if (page === "search") return loadSearchPage(user);
    if (page === "patient-home") return loadPatientHomePage(user);
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
        await carregarComentariosRecebidos(user.nome);
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

    const usuarioSalvo = JSON.parse(sessionStorage.getItem(USER_KEY) || "null");
    if (usuarioSalvo) aplicarMenuPorPerfil(usuarioSalvo.perfil);

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

function configurarCardRecolhivel(card, recolhidoPorPadrao = false) {
    const botao = card.querySelector(".panel-toggle");
    if (!botao) return;
    const titulo = card.querySelector(".panel__head h3")?.textContent || "card";
    const chave = `nutrilife_card_${card.id}`;
    const aplicar = (recolhido) => {
        card.classList.toggle("is-collapsed", recolhido);
        botao.setAttribute("aria-expanded", String(!recolhido));
        botao.setAttribute("aria-label", `${recolhido ? "Mostrar" : "Esconder"} ${titulo}`);
    };
    try {
        const salvo = localStorage.getItem(chave);
        aplicar(salvo === null ? recolhidoPorPadrao : salvo === "1");
    } catch {
        aplicar(recolhidoPorPadrao);
    }
    botao.addEventListener("click", () => {
        const recolhido = !card.classList.contains("is-collapsed");
        aplicar(recolhido);
        try {
            localStorage.setItem(chave, recolhido ? "1" : "0");
        } catch {}
    });
}

function configurarCardsRecolhiveis() {
    document.querySelectorAll("[data-collapsible]").forEach((card) => configurarCardRecolhivel(card));
}

document.addEventListener("DOMContentLoaded", () => {
    configurarCardsRecolhiveis();
    if (["auth", "password-reset"].includes(document.body.dataset.page)) adicionarOlhoSenha();
    if (document.body.dataset.page === "auth") initAuthPage();
    if (document.body.dataset.page === "password-reset") initPasswordResetPage();
    if (["dashboard", "plans", "patients", "search", "patient-home", "professional-profile", "booking", "appointments", "professional-calendar", "professional-profile-edit", "admin-users"].includes(document.body.dataset.page)) {
        initProtectedPage();
    }
});
