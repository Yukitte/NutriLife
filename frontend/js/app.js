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
    const grams = row.seletorMedida.gramas();
    const summary = row.querySelector(".food-nutrition-summary");
    const calories = row.querySelector('[name="calorias"]');
    if (!grams || grams > 10000) {
        summary.textContent = "Informe uma quantidade que resulte entre 0,1 e 10.000 g.";
        delete row.dataset.gramas;
        return;
    }
    row.dataset.gramas = String(grams);

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
        `${grams.toLocaleString("pt-BR")} g`,
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
    const saved = savedOption || {};
    const savedMeasure = saved.medida_caseira && saved.quantidade_caseira ? saved.medida_caseira : null;
    row.catalogFood = food;
    row.dataset.foodId = food.id;
    row.dataset.foodCategory = food.category;
    foodName.value = food.name;
    measure.hidden = true;
    measure.value = "g";
    row.seletorMedida.select.hidden = false;
    quantity.max = "10000";
    quantity.step = "any";
    calories.readOnly = true;
    row.seletorMedida.vincular(food, savedMeasure, (achou) => {
        quantity.value = String(achou ? saved.quantidade_caseira : saved.quantidade || 100);
        updateCatalogOption(row);
    });
}

function clearCatalogFood(row) {
    row.catalogFood = null;
    delete row.dataset.foodId;
    delete row.dataset.foodCategory;
    delete row.dataset.gramas;
    [
        "energiaKcal",
        "proteina_g",
        "carboidrato_g",
        "gordura_g",
        "fibra_g",
        "sodio_mg",
    ].forEach((key) => delete row.dataset[key]);
    row.seletorMedida.vincular(null);
    row.seletorMedida.select.hidden = true;
    const measure = row.querySelector('[name="medida"]');
    measure.hidden = false;
    if (measure.value === "g") measure.value = "";
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
                    result.addEventListener("mousedown", (event) => event.preventDefault());
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
        row.seletorMedida = criarSeletorMedida(quantity, () => {
            if (row.dataset.foodId) updateCatalogOption(row);
            row.dispatchEvent(new Event("input", { bubbles: true }));
        });
        row.seletorMedida.select.hidden = true;
        quantity.addEventListener("input", () => {
            if (row.dataset.foodId) updateCatalogOption(row);
        });
        measure.addEventListener("input", () => {
            if (row.dataset.foodId) clearCatalogFood(row);
        });
        if (data.alimento_id) {
            row.dataset.foodId = data.alimento_id;
            row.dataset.foodCategory = data.categoria || "";
            row.dataset.gramas = String(data.quantidade);
            measure.hidden = true;
        }
        const nameField = createElement("div", "food-row__name");
        searchPanel.classList.add("food-row__dropdown");
        searchPanel.hidden = true;
        nameField.append(foodName, searchPanel);
        const details = createElement("div", "food-row__details");
        details.append(nutritionSummary);
        const measureField = createElement("div", "food-row__measure");
        measureField.append(measure, row.seletorMedida.select);
        row.append(nameField, quantity, measureField, calories, details, row.seletorMedida.cadastro);

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
                const rotulo = row.seletorMedida.rotulo();
                option.quantidade = Number(row.dataset.gramas) || option.quantidade;
                option.medida = "g";
                option.alimento_id = row.dataset.foodId;
                option.categoria = row.dataset.foodCategory;
                option.porcao = rotulo ? `${rotulo} · ${row.seletorMedida.peso().toLocaleString("pt-BR")} g` : "gramas";
                option.quantidade_caseira = rotulo ? Number(row.querySelector('[name="quantidade"]').value) : null;
                option.medida_caseira = rotulo;
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

const MACROS_DIETA = [
    ["proteina_g", "Proteínas", 4],
    ["carboidrato_g", "Carboidratos", 4],
    ["gordura_g", "Gorduras", 9],
];

function calcularNutricaoPlano(plan) {
    const chaves = ["proteina_g", "carboidrato_g", "gordura_g", "fibra_g", "sodio_mg"];
    let semDados = 0;
    const refeicoes = plan.refeicoes.map((meal) => {
        const linha = { horario: meal.horario, nome: meal.nome, energia_kcal: 0 };
        chaves.forEach((chave) => { linha[chave] = null; });
        alimentosDaRefeicao(meal).forEach((food) => {
            linha.energia_kcal += Number(food.calorias) || 0;
            if (!food.alimento_id) semDados += 1;
            chaves.forEach((chave) => {
                if (food[chave] !== null && food[chave] !== undefined) linha[chave] = (linha[chave] || 0) + Number(food[chave]);
            });
        });
        return linha;
    });
    const total = { energia_kcal: refeicoes.reduce((soma, linha) => soma + linha.energia_kcal, 0) };
    chaves.forEach((chave) => {
        const valores = refeicoes.map((linha) => linha[chave]).filter((valor) => valor !== null);
        total[chave] = valores.length ? valores.reduce((soma, valor) => soma + valor, 0) : null;
    });
    const energiaMacros = MACROS_DIETA.reduce((soma, [chave, , kcal]) => soma + (total[chave] || 0) * kcal, 0);
    const distribuicao = MACROS_DIETA.map(([chave, rotulo, kcal]) => ({
        chave,
        rotulo,
        gramas: total[chave],
        percentual: energiaMacros ? Math.round(((total[chave] || 0) * kcal / energiaMacros) * 100) : null,
    }));
    return { refeicoes, total, distribuicao, semDados };
}

function montarTabelaNutricaoDieta(plan, classe) {
    const nutricao = calcularNutricaoPlano(plan);
    const tabela = createElement("table", classe);
    const cabecalho = createElement("thead");
    const titulos = createElement("tr");
    ["Refeição", ...NUTRIENTES_RECEITA.map(([, rotulo, unidade]) => `${rotulo} (${unidade})`)].forEach((texto) => titulos.append(createElement("th", "", texto)));
    cabecalho.append(titulos);
    const corpo = createElement("tbody");
    const adicionarLinha = (rotulo, valores, classeLinha = "") => {
        const linha = createElement("tr", classeLinha);
        linha.append(createElement("th", "", rotulo));
        NUTRIENTES_RECEITA.forEach(([chave, , unidade, casas]) => {
            const valor = valores[chave];
            linha.append(createElement("td", "", valor === null || valor === undefined
                ? "–"
                : Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: chave === "energia_kcal" ? 0 : casas })));
        });
        corpo.append(linha);
    };
    nutricao.refeicoes.forEach((linha) => adicionarLinha(`${linha.horario} · ${linha.nome}`, linha));
    adicionarLinha("Total do dia", nutricao.total, "nutrition-diet__total");
    tabela.append(cabecalho, corpo);
    return { tabela, nutricao };
}

function montarDistribuicaoMacros(nutricao, classe) {
    const bloco = createElement("div", classe);
    const barra = createElement("div", `${classe}__bar`);
    const legenda = createElement("div", `${classe}__legend`);
    nutricao.distribuicao.forEach((macro) => {
        const parte = createElement("span", `${classe}__part ${classe}__part--${macro.chave}`);
        parte.style.width = `${macro.percentual || 0}%`;
        barra.append(parte);
        const item = createElement("span", "");
        item.append(
            createElement("i", `${classe}__swatch ${classe}__part--${macro.chave}`),
            createElement("strong", "", macro.percentual === null ? "–" : `${macro.percentual}%`),
            createElement("span", "", `${macro.rotulo} · ${macro.gramas === null ? "–" : `${Math.round(macro.gramas).toLocaleString("pt-BR")} g`}`),
        );
        legenda.append(item);
    });
    bloco.append(barra, legenda);
    return bloco;
}

function avisoNutricaoDieta(nutricao) {
    const base = "Valores calculados pela Tabela TACO a partir dos alimentos principais (substituições não entram na soma). A distribuição considera 4 kcal/g de proteínas e carboidratos e 9 kcal/g de gorduras.";
    return nutricao.semDados
        ? `${base} ${nutricao.semDados} ${nutricao.semDados === 1 ? "alimento foi digitado" : "alimentos foram digitados"} fora da TACO e ${nutricao.semDados === 1 ? "entra" : "entram"} só com as calorias informadas.`
        : base;
}

function textoQuantidadeAlimento(food) {
    const numero = (valor) => Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    if (food.medida_caseira && food.quantidade_caseira) {
        return `${numero(food.quantidade_caseira)} ${food.medida_caseira.toLowerCase()} (${numero(food.quantidade)} g)`;
    }
    return `${numero(food.quantidade)} ${food.medida}`;
}

function montarPlanoPdf(plan, nutricionista) {
    const logo = document.querySelector(".brand-logo")?.src
        || new URL("../assets/images/NutriLife-logo-semfundo.png", window.location.href).href;
    const emitidoEm = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());
    const refeicoes = plan.refeicoes.map((meal) => ({ ...meal, alimentos: alimentosDaRefeicao(meal) }));
    const kcalDaRefeicao = (meal) => meal.alimentos.reduce((total, food) => total + (Number(food.calorias) || 0), 0);
    const kcalDia = refeicoes.reduce((total, meal) => total + kcalDaRefeicao(meal), 0);
    const quantidade = textoQuantidadeAlimento;

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

    const resumoNutricional = createElement("section", "pdf-nutricao");
    const { tabela: tabelaNutricao, nutricao } = montarTabelaNutricaoDieta(plan, "pdf-tabela pdf-tabela--nutricao");
    resumoNutricional.append(
        createElement("h2", "", "Tabela nutricional da dieta"),
        ...(comparacaoGastoDieta(plan, nutricao.total.energia_kcal) ? [createElement("p", "pdf-nutricao__gasto", comparacaoGastoDieta(plan, nutricao.total.energia_kcal).texto)] : []),
        montarDistribuicaoMacros(nutricao, "pdf-macros"),
        tabelaNutricao,
        createElement("p", "pdf-nutricao__nota", avisoNutricaoDieta(nutricao)),
    );

    pagina.append(cabecalho, cards, orientacoes, resumoNutricional, listaRefeicoes);
    const receitasPlano = receitasDoPlano(plan.id);
    if (receitasPlano.length) pagina.append(montarReceitasPdf(receitasPlano));
    return pagina;
}

async function baixarPlanoPdf(plan) {
    const [html2pdf, nutricionista] = await Promise.all([
        carregarGeradorPdf(),
        api.obterNutricionista(plan.nutricionista_id).catch(() => null),
    ]);
    const pagina = montarPlanoPdf(plan, nutricionista);
    const crn = nutricionista?.crn ? formatarCrn(nutricionista.crn) : "";
    const textoFinal = `Plano elaborado por ${plan.nutricionista_nome}${crn ? ` (${crn})` : ""} · NutriLife — cuidado nutricional de forma simples, organizada e próxima.`;
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
                margin: [10, 0, 14, 0],
                filename: `plano-alimentar-${nomeArquivo}.pdf`,
                image: { type: "jpeg", quality: 0.96 },
                html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
                jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
                pagebreak: { mode: ["css", "legacy"], avoid: [".pdf-refeicao", ".pdf-receita", ".pdf-receitas__inicio", ".pdf-cards", ".pdf-header", ".pdf-orientacoes", ".pdf-nutricao"] },
            })
            .from(pagina)
            .toPdf()
            .get("pdf")
            .then((pdf) => {
                const total = pdf.internal.getNumberOfPages();
                pdf.setPage(1);
                pdf.setFillColor(236, 241, 236);
                pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), 10.2, "F");
                for (let numero = 1; numero <= total; numero += 1) {
                    pdf.setPage(numero);
                    pdf.setTextColor(51, 102, 51);
                    if (numero === total) {
                        pdf.setFontSize(7.5);
                        pdf.text(textoFinal, pdf.internal.pageSize.getWidth() / 2, pdf.internal.pageSize.getHeight() - 10, { align: "center" });
                    }
                    pdf.setFontSize(8);
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

let receitasCarregadas = [];

const NUTRIENTES_RECEITA = [
    ["energia_kcal", "Energia", "kcal", 0],
    ["proteina_g", "Proteínas", "g", 1],
    ["carboidrato_g", "Carboidratos", "g", 1],
    ["gordura_g", "Gorduras", "g", 1],
    ["fibra_g", "Fibras", "g", 1],
    ["sodio_mg", "Sódio", "mg", 0],
];

function receitasDoPlano(planoId) {
    return receitasCarregadas.filter((receita) => receita.planos.some((plano) => plano.id === planoId));
}

function valorNutriente(valor, unidade, casas) {
    return valor === null || valor === undefined
        ? "–"
        : `${Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: casas })} ${unidade}`;
}

function textoPorcoes(porcoes) {
    return `${porcoes} ${porcoes === 1 ? "porção" : "porções"}`;
}

function resumoReceita(receita) {
    const kcal = receita.nutricao_porcao?.energia_kcal;
    return [
        receita.categoria,
        `${receita.tempo_preparo_min} min`,
        textoPorcoes(receita.porcoes),
        kcal != null ? `${Math.round(kcal).toLocaleString("pt-BR")} kcal por porção` : "",
    ].filter(Boolean).join(" · ");
}

function textoIngrediente(ingrediente) {
    const quantidadeCaseira = ingrediente.medida
        ? `${ingrediente.quantidade ? `${Number(ingrediente.quantidade).toLocaleString("pt-BR")} ` : ""}${ingrediente.medida.toLowerCase()}`
        : "";
    const detalhes = [
        quantidadeCaseira,
        ingrediente.gramas ? valorNutriente(ingrediente.gramas, "g", 1) : "",
    ].filter(Boolean).join(" · ");
    return detalhes ? `${ingrediente.nome} — ${detalhes}` : ingrediente.nome;
}

function avisoNutricao(receita) {
    if (!receita.ingredientes_calculados) return "Nenhum ingrediente vinculado à TACO: valores nutricionais indisponíveis.";
    if (receita.ingredientes_calculados < receita.ingredientes.length) {
        return `Calculado com ${receita.ingredientes_calculados} de ${receita.ingredientes.length} ingredientes (os demais não estão vinculados à TACO).`;
    }
    return "Valores calculados com base na Tabela TACO.";
}

function montarTabelaNutricao(receita, classe) {
    const tabela = createElement("table", classe);
    const cabecalho = createElement("thead");
    const linhaTitulo = createElement("tr");
    ["Nutriente", "Por porção", "Receita inteira"].forEach((texto) => linhaTitulo.append(createElement("th", "", texto)));
    cabecalho.append(linhaTitulo);
    const corpo = createElement("tbody");
    NUTRIENTES_RECEITA.forEach(([chave, rotulo, unidade, casas]) => {
        const linha = createElement("tr");
        linha.append(
            createElement("th", "", rotulo),
            createElement("td", "", valorNutriente(receita.nutricao_porcao?.[chave], unidade, casas)),
            createElement("td", "", valorNutriente(receita.nutricao_total?.[chave], unidade, casas)),
        );
        corpo.append(linha);
    });
    tabela.append(cabecalho, corpo);
    return tabela;
}

function montarConteudoReceita(receita) {
    const conteudo = createElement("div", "recipe-body");
    const ingredientes = createElement("ul", "recipe-body__ingredients");
    receita.ingredientes.forEach((item) => {
        const quantidadeCaseira = item.medida
            ? `${item.quantidade ? `${Number(item.quantidade).toLocaleString("pt-BR")} ` : ""}${item.medida.toLowerCase()}`
            : "";
        const detalhe = [quantidadeCaseira, item.gramas ? valorNutriente(item.gramas, "g", 1) : ""].filter(Boolean).join(" · ");
        const linha = createElement("li", "recipe-body__ingredient");
        linha.append(createElement("span", "", item.nome));
        if (detalhe) linha.append(createElement("span", "recipe-body__amount", detalhe));
        ingredientes.append(linha);
    });
    conteudo.append(
        createElement("h5", "", "Ingredientes"),
        ingredientes,
        createElement("h5", "", "Modo de preparo"),
        createElement("p", "recipe-body__steps", receita.modo_preparo),
        createElement("h5", "", "Informação nutricional"),
        montarTabelaNutricao(receita, "recipe-nutrition-table"),
        createElement("p", "item-meta", avisoNutricao(receita)),
    );
    return conteudo;
}

function montarReceitaRecolhivel(receita) {
    const detalhes = createElement("details", "recipe-item");
    const resumo = createElement("summary", "recipe-item__summary");
    resumo.append(
        createElement("strong", "", receita.titulo),
        createElement("span", "item-meta", resumoReceita(receita)),
    );
    detalhes.append(resumo, montarConteudoReceita(receita));
    return detalhes;
}

function montarReceitasPdf(receitas) {
    const secao = createElement("section", "pdf-receitas");
    const titulo = createElement("h2", "", "Receitas da dieta");
    receitas.forEach((receita, indice) => {
        const bloco = createElement("article", "pdf-receita");
        const topo = createElement("div", "pdf-receita__head");
        topo.append(createElement("h3", "", receita.titulo), createElement("span", "pdf-receita__meta", resumoReceita(receita)));
        const colunas = createElement("div", "pdf-receita__cols");
        const ingredientes = createElement("div", "pdf-receita__col");
        const lista = createElement("ul", "");
        receita.ingredientes.forEach((item) => lista.append(createElement("li", "", textoIngrediente(item))));
        ingredientes.append(createElement("h4", "", "Ingredientes"), lista);
        const preparo = createElement("div", "pdf-receita__col");
        preparo.append(createElement("h4", "", "Modo de preparo"), createElement("p", "pdf-receita__passos", receita.modo_preparo));
        colunas.append(ingredientes, preparo);
        const nutricao = createElement("div", "pdf-receita__nutricao");
        NUTRIENTES_RECEITA.forEach(([chave, rotulo, unidade, casas]) => {
            const item = createElement("div", "pdf-receita__nutriente");
            item.append(createElement("span", "", rotulo), createElement("strong", "", valorNutriente(receita.nutricao_porcao?.[chave], unidade, casas)));
            nutricao.append(item);
        });
        bloco.append(topo, colunas, nutricao, createElement("p", "pdf-receita__aviso", `Valores por porção. ${avisoNutricao(receita)}`));
        if (indice === 0) {
            const inicio = createElement("div", "pdf-receitas__inicio");
            inicio.append(titulo, bloco);
            secao.append(inicio);
        } else {
            secao.append(bloco);
        }
    });
    return secao;
}

const cacheMedidasProprias = new Map();

function medidasPropriasDoAlimento(alimentoId) {
    if (!cacheMedidasProprias.has(alimentoId)) {
        cacheMedidasProprias.set(alimentoId, api.listarMedidasAlimento(alimentoId).catch(() => []));
    }
    return cacheMedidasProprias.get(alimentoId);
}

function criarSeletorMedida(quantidade, aoMudar) {
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Medida");
    const cadastro = createElement("div", "medida-cadastro");
    cadastro.hidden = true;
    const nomeMedida = document.createElement("input");
    nomeMedida.maxLength = 60;
    nomeMedida.placeholder = "Ex.: Colher de sopa cheia";
    const pesoMedida = document.createElement("input");
    pesoMedida.type = "number";
    pesoMedida.min = "0.1";
    pesoMedida.max = "5000";
    pesoMedida.step = "any";
    pesoMedida.placeholder = "Gramas";
    const salvar = createElement("button", "btn btn--primary", "Salvar medida");
    salvar.type = "button";
    const cancelar = createElement("button", "btn btn--ghost", "Cancelar");
    cancelar.type = "button";
    const dica = createElement("p", "medida-cadastro__dica item-meta");
    cadastro.append(
        inputGroup("Nome da medida (uma unidade)", nomeMedida),
        inputGroup("Quanto pesa 1 medida (g)", pesoMedida),
        salvar,
        cancelar,
        dica,
    );
    let alimento = null;
    let proprias = [];
    let anterior = "1";

    const medidasIbge = () => (alimento?.portions || []).filter((porcao) => !porcao.label.startsWith("100 g"));
    const separarQuantidade = (texto) => {
        const encontrado = texto.trim().match(/^(\d+(?:[.,]\d+)?)\s*(?:x\s*)?(.+)$/i);
        return encontrado
            ? { quantidade: Number(encontrado[1].replace(",", ".")), rotulo: encontrado[2].trim() }
            : { quantidade: null, rotulo: texto.trim() };
    };
    const sugerirPeso = () => {
        const normalizado = separarQuantidade(nomeMedida.value).rotulo.toLowerCase();
        const parecida = medidasIbge()
            .map((porcao) => ({ nome: porcao.label.split(" · ")[0], gramas: porcao.gram_weight }))
            .filter((porcao) => normalizado.includes(porcao.nome.toLowerCase()))
            .sort((a, b) => b.nome.length - a.nome.length)[0];
        pesoMedida.placeholder = parecida ? `Ex.: ${parecida.gramas.toLocaleString("pt-BR")}` : "Gramas";
        dica.textContent = parecida
            ? `Referência do IBGE para este alimento: ${parecida.nome.toLowerCase()} = ${parecida.gramas.toLocaleString("pt-BR")} g. Ajuste se a sua medida for diferente (cheia, rasa...).`
            : medidasIbge().length
                ? "Informe o peso de uma unidade da medida. A quantidade (ex.: 2) vai no campo Quantidade."
                : "O IBGE não tem medidas caseiras para este alimento. Use a porção do rótulo da embalagem (ex.: 20 g = 2 colheres de sopa → 10 g cada) ou pese uma vez numa balança. A quantidade (ex.: 2) vai no campo Quantidade.";
    };
    const rotulo = () => select.selectedOptions[0]?.dataset.rotulo || null;
    const montar = (selecionar) => {
        select.replaceChildren();
        const gramas = new Option("gramas (g)", "1");
        gramas.dataset.rotulo = "";
        select.add(gramas);
        const adicionarGrupo = (titulo, itens) => {
            if (!itens.length) return;
            const grupo = document.createElement("optgroup");
            grupo.label = titulo;
            itens.forEach(([texto, peso, nomeCurto]) => {
                const opcao = new Option(texto, String(peso));
                opcao.dataset.rotulo = nomeCurto;
                grupo.append(opcao);
            });
            select.add(grupo);
        };
        adicionarGrupo("Medidas caseiras (IBGE)", medidasIbge().map((porcao) => [porcao.label, porcao.gram_weight, porcao.label.split(" · ")[0]]));
        adicionarGrupo("Suas medidas", proprias.map((medida) => [`${medida.rotulo} · ${medida.gramas.toLocaleString("pt-BR")} g`, medida.gramas, medida.rotulo]));
        const novaOpcao = new Option("+ Cadastrar medida…", "nova");
        novaOpcao.dataset.rotulo = "";
        select.add(novaOpcao);
        const alvo = [...select.options].find((opcao) => selecionar && opcao.dataset.rotulo === selecionar);
        if (alvo) alvo.selected = true;
        else select.value = "1";
        anterior = select.value;
    };
    const vincular = (novo, selecionar = null, aoResolver = null) => {
        alimento = novo;
        proprias = [];
        cadastro.hidden = true;
        if (!novo) return;
        montar(selecionar);
        const achouNaHora = Boolean(selecionar) && rotulo() === selecionar;
        if (aoResolver && (achouNaHora || !selecionar)) aoResolver(achouNaHora);
        medidasPropriasDoAlimento(novo.id).then((lista) => {
            if (alimento !== novo) return;
            const atual = rotulo();
            proprias = lista;
            const pendente = Boolean(selecionar) && !achouNaHora && !atual;
            montar(pendente ? selecionar : atual);
            if (aoResolver && pendente) aoResolver(rotulo() === selecionar);
            aoMudar();
        });
    };

    select.addEventListener("change", () => {
        if (select.value === "nova") {
            select.value = anterior;
            cadastro.hidden = false;
            sugerirPeso();
            nomeMedida.focus();
            return;
        }
        if (anterior === "1" && select.value !== "1" && Number(quantidade.value) >= 10) quantidade.value = "1";
        anterior = select.value;
        aoMudar();
    });
    nomeMedida.addEventListener("input", sugerirPeso);
    cancelar.addEventListener("click", () => {
        cadastro.hidden = true;
        nomeMedida.value = "";
        pesoMedida.value = "";
    });
    salvar.addEventListener("click", async () => {
        const { quantidade: quantidadeDigitada, rotulo: novoRotulo } = separarQuantidade(nomeMedida.value);
        const gramas = Number(pesoMedida.value);
        if (novoRotulo.length < 2) {
            showDashboardError("Informe o nome da medida, por exemplo: Colher de sopa cheia.");
            nomeMedida.focus();
            return;
        }
        if (!(gramas > 0)) {
            showDashboardError(`Informe quanto pesa 1 ${novoRotulo.toLowerCase()}, em gramas.`);
            pesoMedida.focus();
            return;
        }
        salvar.disabled = true;
        try {
            const salva = await api.criarMedidaAlimento(alimento.id, { rotulo: novoRotulo, gramas });
            proprias = [...proprias.filter((medida) => medida.rotulo !== salva.rotulo), salva].sort((a, b) => a.gramas - b.gramas);
            cacheMedidasProprias.set(alimento.id, Promise.resolve(proprias));
            montar(salva.rotulo);
            if (quantidadeDigitada) quantidade.value = String(quantidadeDigitada);
            else if (!quantidade.value || Number(quantidade.value) >= 10) quantidade.value = "1";
            cadastro.hidden = true;
            nomeMedida.value = "";
            pesoMedida.value = "";
            showDashboardSuccess(`Medida "${salva.rotulo}" salva para ${alimento.name}.`);
            aoMudar();
        } catch (error) {
            showDashboardError(error.message);
        } finally {
            salvar.disabled = false;
        }
    });

    return {
        select,
        cadastro,
        vincular,
        rotulo,
        peso: () => Number(select.value) || 0,
        gramas: () => {
            const total = Number(quantidade.value) * (Number(select.value) || 0);
            return total > 0 ? Math.round(total * 10) / 10 : null;
        },
    };
}

function criarLinhaIngrediente(aoMudar, inicial = {}) {
    const linha = createElement("div", "recipe-ingredient");
    linha.alimento = null;
    const nome = document.createElement("input");
    nome.type = "search";
    nome.autocomplete = "off";
    nome.maxLength = 200;
    nome.required = true;
    nome.placeholder = "Buscar na TACO ou digitar";
    nome.value = inicial.nome || "";
    const quantidade = document.createElement("input");
    quantidade.type = "number";
    quantidade.min = "0.01";
    quantidade.max = "10000";
    quantidade.step = "any";
    quantidade.placeholder = "Qtd.";
    const medidaLivre = document.createElement("input");
    medidaLivre.maxLength = 80;
    medidaLivre.placeholder = "Ex.: a gosto";
    medidaLivre.setAttribute("aria-label", "Medida");
    const remover = createElement("button", "btn btn--ghost recipe-ingredient__remove", "Remover");
    remover.type = "button";
    const resultados = createElement("div", "recipe-ingredient__results");
    resultados.hidden = true;
    const info = createElement("p", "recipe-ingredient__info item-meta");
    const seletor = criarSeletorMedida(quantidade, () => atualizarInfo());
    const medidaTaco = seletor.select;
    const gramasCalculados = () => (linha.alimento ? seletor.gramas() : null);

    const atualizarModo = () => {
        const taco = Boolean(linha.alimento);
        medidaTaco.parentElement.hidden = !taco;
        medidaLivre.parentElement.hidden = taco;
        quantidade.required = taco;
    };

    const atualizarInfo = () => {
        atualizarModo();
        if (!linha.alimento) {
            info.textContent = nome.value.trim() ? "Texto livre: não entra no cálculo nutricional." : "";
        } else {
            const energia = linha.alimento.nutrients_per_100g.energia_kcal;
            const gramas = gramasCalculados();
            info.textContent = gramas && energia != null
                ? `TACO · ${gramas.toLocaleString("pt-BR")} g · ${Math.round(energia * gramas / 100).toLocaleString("pt-BR")} kcal`
                : "TACO · informe a quantidade.";
        }
        aoMudar();
    };

    const vincular = (alimento, selecionar = null) => {
        linha.alimento = alimento;
        seletor.vincular(alimento, selecionar);
        if (alimento) {
            nome.value = alimento.name;
            if (!quantidade.value) quantidade.value = medidaTaco.value === "1" ? "100" : "1";
        }
        atualizarInfo();
    };

    let espera;
    let versao = 0;
    nome.addEventListener("input", () => {
        if (linha.alimento && nome.value !== linha.alimento.name) vincular(null);
        else atualizarInfo();
        clearTimeout(espera);
        const termo = nome.value.trim();
        if (termo.length < 2 || linha.alimento) {
            resultados.hidden = true;
            return;
        }
        espera = setTimeout(async () => {
            const minhaVersao = ++versao;
            try {
                const resposta = await api.buscarAlimentos(termo, "", 0);
                if (minhaVersao !== versao || !linha.isConnected) return;
                resultados.replaceChildren();
                resposta.items.slice(0, 8).forEach((alimento) => {
                    const opcao = createElement("button", "recipe-ingredient__option");
                    opcao.type = "button";
                    opcao.append(createElement("strong", "", alimento.name), createElement("small", "", alimento.category));
                    opcao.addEventListener("mousedown", (event) => event.preventDefault());
                    opcao.addEventListener("click", () => {
                        quantidade.value = "";
                        vincular(alimento);
                        resultados.hidden = true;
                        quantidade.focus();
                    });
                    resultados.append(opcao);
                });
                if (!resposta.items.length) resultados.append(createElement("p", "item-meta", "Nenhum alimento da TACO encontrado. Você pode manter como texto livre."));
                resultados.hidden = false;
            } catch {
                resultados.hidden = true;
            }
        }, 300);
    });
    nome.addEventListener("keydown", (event) => {
        if (event.key === "Escape") resultados.hidden = true;
    });
    nome.addEventListener("blur", () => { resultados.hidden = true; });
    quantidade.addEventListener("input", atualizarInfo);
    remover.addEventListener("click", () => {
        linha.remove();
        aoMudar();
    });

    const campoNome = inputGroup("Ingrediente", nome);
    campoNome.classList.add("recipe-ingredient__name");
    campoNome.append(resultados);
    linha.append(
        campoNome,
        inputGroup("Quantidade", quantidade),
        inputGroup("Medida", medidaTaco),
        inputGroup("Medida", medidaLivre),
        remover,
        info,
        seletor.cadastro,
    );
    linha.ler = () => (linha.alimento
        ? {
            nome: nome.value.trim(),
            alimento_id: linha.alimento.id,
            quantidade: seletor.rotulo() ? Number(quantidade.value) || null : null,
            medida: seletor.rotulo(),
            gramas: gramasCalculados(),
        }
        : {
            nome: nome.value.trim(),
            alimento_id: null,
            quantidade: Number(quantidade.value) || null,
            medida: medidaLivre.value.trim() || null,
            gramas: null,
        });
    linha.nutrientes = () => {
        const gramas = gramasCalculados();
        return linha.alimento && gramas ? { por100: linha.alimento.nutrients_per_100g, gramas } : null;
    };

    if (inicial.alimento_id) {
        info.textContent = "Carregando dados da TACO...";
        api.obterAlimento(inicial.alimento_id)
            .then((alimento) => {
                const usaMedida = Boolean(inicial.medida && inicial.quantidade);
                linha.alimento = alimento;
                nome.value = inicial.nome;
                seletor.vincular(alimento, usaMedida ? inicial.medida : null, (achou) => {
                    quantidade.value = String(achou ? inicial.quantidade : inicial.gramas ?? "");
                    atualizarInfo();
                });
            })
            .catch(() => atualizarInfo());
    } else {
        quantidade.value = inicial.quantidade ?? "";
        medidaLivre.value = inicial.medida || "";
        atualizarInfo();
    }
    return linha;
}

function lerFormularioReceita(form) {
    const dados = new FormData(form);
    return {
        titulo: dados.get("titulo").trim(),
        categoria: dados.get("categoria"),
        tempo_preparo_min: Number(dados.get("tempo_preparo_min")),
        porcoes: Number(dados.get("porcoes")),
        ingredientes: [...form.querySelectorAll(".recipe-ingredient")].map((linha) => linha.ler()).filter((item) => item.nome),
        modo_preparo: dados.get("modo_preparo").trim(),
        planos_ids: dados.getAll("planos_ids"),
    };
}

function atualizarPreviaNutricao(form) {
    const previa = document.getElementById("recipe-nutrition-preview");
    const linhas = [...form.querySelectorAll(".recipe-ingredient")];
    const calculaveis = linhas.map((linha) => linha.nutrientes()).filter(Boolean);
    previa.replaceChildren();
    if (!calculaveis.length) {
        previa.append(createElement("p", "item-meta", "Vincule ingredientes à TACO para ver o cálculo nutricional."));
        return;
    }
    const porcoes = Math.max(1, Number(form.elements.porcoes.value) || 1);
    const total = {};
    NUTRIENTES_RECEITA.forEach(([chave]) => {
        const valores = calculaveis.map(({ por100, gramas }) => (por100[chave] == null ? null : por100[chave] * gramas / 100)).filter((valor) => valor !== null);
        total[chave] = valores.length ? valores.reduce((soma, valor) => soma + valor, 0) : null;
    });
    const titulo = createElement("strong", "", `Prévia por porção (${textoPorcoes(porcoes)})`);
    const grade = createElement("div", "recipe-nutrition-preview__grid");
    NUTRIENTES_RECEITA.forEach(([chave, rotulo, unidade, casas]) => {
        const item = createElement("div", "");
        item.append(createElement("span", "", rotulo), createElement("strong", "", valorNutriente(total[chave] == null ? null : total[chave] / porcoes, unidade, casas)));
        grade.append(item);
    });
    previa.append(titulo, grade, createElement("p", "item-meta", `${calculaveis.length} de ${linhas.length} ingredientes com dados da TACO.`));
}

async function loadRecipesPage(user) {
    const nutricionista = user.perfil === "nutricionista";
    if (!nutricionista && user.perfil !== "paciente") {
        window.location.replace("../dashboard.html");
        return;
    }
    const lista = document.getElementById("recipes-list");
    const busca = document.getElementById("recipe-search");
    const painelFormulario = document.getElementById("recipe-form-panel");
    const form = document.getElementById("recipe-form");
    const novaReceita = document.getElementById("new-recipe");
    const listaIngredientes = document.getElementById("recipe-ingredients");
    let editandoId = null;
    let planos = [];

    document.getElementById("recipes-subtitle").textContent = nutricionista
        ? "Cadastre receitas com ingredientes da TACO e vincule às dietas dos seus pacientes."
        : "Receitas que o seu nutricionista vinculou ao seu plano alimentar.";

    const atualizarPrevia = () => atualizarPreviaNutricao(form);
    const adicionarIngrediente = (dados) => listaIngredientes.append(criarLinhaIngrediente(atualizarPrevia, dados));

    const montarPlanosFormulario = (selecionados = []) => {
        const container = document.getElementById("recipe-plans");
        container.replaceChildren();
        if (!planos.length) {
            container.append(createElement("p", "item-meta", "Você ainda não tem planos alimentares para vincular."));
            return;
        }
        planos.forEach((plano) => {
            const rotulo = createElement("label", "recipe-plans__option");
            const caixa = document.createElement("input");
            caixa.type = "checkbox";
            caixa.name = "planos_ids";
            caixa.value = plano.id;
            caixa.checked = selecionados.includes(plano.id);
            const texto = createElement("span", "");
            texto.append(createElement("strong", "", plano.paciente_nome), createElement("small", "", plano.titulo));
            rotulo.append(caixa, texto);
            container.append(rotulo);
        });
    };

    const abrirFormulario = (receita = null) => {
        editandoId = receita?.id || null;
        form.reset();
        document.getElementById("recipe-form-title").textContent = receita ? "Editar receita" : "Nova receita";
        listaIngredientes.replaceChildren();
        if (receita) {
            form.elements.titulo.value = receita.titulo;
            form.elements.categoria.value = receita.categoria;
            form.elements.tempo_preparo_min.value = receita.tempo_preparo_min;
            form.elements.porcoes.value = receita.porcoes;
            form.elements.modo_preparo.value = receita.modo_preparo;
            receita.ingredientes.forEach((ingrediente) => adicionarIngrediente(ingrediente));
        } else {
            adicionarIngrediente();
        }
        montarPlanosFormulario(receita ? receita.planos.map((plano) => plano.id) : []);
        atualizarPrevia();
        painelFormulario.hidden = false;
        novaReceita.hidden = true;
        painelFormulario.scrollIntoView({ behavior: "smooth", block: "start" });
        form.elements.titulo.focus({ preventScroll: true });
    };

    const fecharFormulario = () => {
        painelFormulario.hidden = true;
        novaReceita.hidden = false;
        editandoId = null;
    };

    const renderizar = () => {
        const termo = busca.value.trim().toLowerCase();
        const visiveis = receitasCarregadas.filter((receita) => receita.titulo.toLowerCase().includes(termo)
            || receita.categoria.toLowerCase().includes(termo));
        lista.replaceChildren();
        if (!receitasCarregadas.length) {
            lista.append(createElement("p", "item-meta", nutricionista
                ? "Nenhuma receita cadastrada ainda. Clique em \"Nova receita\" para começar."
                : "Ainda não há receitas vinculadas ao seu plano alimentar."));
            return;
        }
        if (!visiveis.length) {
            lista.append(createElement("p", "item-meta", "Nenhuma receita encontrada para essa busca."));
            return;
        }
        visiveis.forEach((receita) => {
            const card = createElement("article", "recipe-card");
            if (receita.categoria) card.append(createElement("span", "recipe-card__category", receita.categoria));
            card.append(createElement("h4", "", receita.titulo));
            const meta = createElement("p", "recipe-card__meta");
            meta.append(
                createElement("span", "", `${receita.tempo_preparo_min} min`),
                createElement("span", "", textoPorcoes(receita.porcoes)),
            );
            card.append(meta);
            const kcal = receita.nutricao_porcao?.energia_kcal;
            if (kcal != null) {
                const destaques = createElement("div", "recipe-card__macros");
                [
                    ["kcal", Math.round(kcal).toLocaleString("pt-BR")],
                    ["prot.", valorNutriente(receita.nutricao_porcao.proteina_g, "g", 1)],
                    ["carb.", valorNutriente(receita.nutricao_porcao.carboidrato_g, "g", 1)],
                    ["gord.", valorNutriente(receita.nutricao_porcao.gordura_g, "g", 1)],
                ].forEach(([rotulo, valor]) => {
                    const item = createElement("span", "");
                    item.append(createElement("strong", "", valor), createElement("small", "", rotulo));
                    destaques.append(item);
                });
                card.append(destaques, createElement("p", "recipe-card__note", "Por porção · TACO"));
            }
            card.append(createElement("p", "recipe-card__plans", nutricionista
                ? (receita.planos.length
                    ? `Vinculada a: ${receita.planos.map((plano) => plano.paciente_nome).join(", ")}`
                    : "Ainda não vinculada a nenhum plano.")
                : `Indicada por ${receita.nutricionista_nome}`));
            const detalhes = createElement("details", "recipe-card__details");
            detalhes.append(createElement("summary", "", "Ver ingredientes, preparo e nutrição"), montarConteudoReceita(receita));
            card.append(detalhes);
            if (nutricionista) {
                const acoes = createElement("div", "recipe-card__actions");
                const editar = createElement("button", "btn btn--ghost", "Editar");
                editar.type = "button";
                editar.addEventListener("click", () => abrirFormulario(receita));
                const excluir = createElement("button", "btn btn--ghost recipe-card__delete", "Excluir");
                excluir.type = "button";
                excluir.addEventListener("click", async () => {
                    if (!window.confirm(`Excluir a receita "${receita.titulo}"?`)) return;
                    try {
                        await api.excluirReceita(receita.id);
                        receitasCarregadas = receitasCarregadas.filter((item) => item.id !== receita.id);
                        if (editandoId === receita.id) fecharFormulario();
                        renderizar();
                        showDashboardSuccess("Receita excluída.");
                    } catch (error) {
                        showDashboardError(error.message);
                    }
                });
                acoes.append(editar, excluir);
                card.append(acoes);
            }
            lista.append(card);
        });
    };

    busca.addEventListener("input", renderizar);

    if (nutricionista) {
        novaReceita.hidden = false;
        novaReceita.addEventListener("click", () => abrirFormulario());
        document.getElementById("recipe-cancel").addEventListener("click", fecharFormulario);
        document.getElementById("recipe-add-ingredient").addEventListener("click", () => {
            adicionarIngrediente();
            listaIngredientes.lastElementChild.querySelector("input").focus();
        });
        form.elements.porcoes.addEventListener("input", atualizarPrevia);
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const botao = form.querySelector('button[type="submit"]');
            const receita = lerFormularioReceita(form);
            if (!receita.ingredientes.length) {
                showDashboardError("Informe pelo menos um ingrediente.");
                return;
            }
            const editando = Boolean(editandoId);
            botao.disabled = true;
            try {
                const salva = editando
                    ? await api.atualizarReceita(editandoId, receita)
                    : await api.criarReceita(receita);
                receitasCarregadas = [salva, ...receitasCarregadas.filter((item) => item.id !== salva.id)]
                    .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
                showDashboardSuccess(editando ? "Receita atualizada." : "Receita cadastrada.");
                fecharFormulario();
                renderizar();
            } catch (error) {
                showDashboardError(error.message);
            } finally {
                botao.disabled = false;
            }
        });
        [planos, receitasCarregadas] = await Promise.all([api.listarPlanos(), api.listarReceitas()]);
    } else {
        receitasCarregadas = await api.listarReceitas();
    }
    renderizar();
}

const AVISO_FECHADO_KEY = "nutrilife_aviso_mensagem_fechado";

function caminhoMensagens(contatoId) {
    const base = window.location.pathname.includes("/pages/") ? "./mensagens.html" : "./pages/mensagens.html";
    return contatoId ? `${base}?contato=${encodeURIComponent(contatoId)}` : base;
}

function horarioMensagem(valor) {
    const data = new Date(valor);
    const hoje = new Date();
    const mesmoDia = data.toDateString() === hoje.toDateString();
    return new Intl.DateTimeFormat("pt-BR", mesmoDia
        ? { hour: "2-digit", minute: "2-digit" }
        : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(data);
}

function atualizarContadorMenu(total) {
    const link = document.getElementById("messages-nav");
    if (!link) return;
    let contador = link.querySelector(".nav-badge");
    if (!total) {
        contador?.remove();
        return;
    }
    if (!contador) {
        contador = createElement("span", "nav-badge");
        link.append(contador);
    }
    contador.textContent = total > 99 ? "99+" : String(total);
    contador.setAttribute("aria-label", `${total} ${total === 1 ? "mensagem nova" : "mensagens novas"}`);
}

function iniciarAvisoMensagens(perfil) {
    if (!["nutricionista", "paciente"].includes(perfil)) return;
    const naPaginaDeMensagens = document.body.dataset.page === "messages";
    const aviso = createElement("aside", "chat-alert");
    aviso.hidden = true;
    aviso.setAttribute("aria-live", "polite");
    const abrir = createElement("a", "chat-alert__open");
    const icone = createElement("span", "chat-alert__icon");
    icone.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2Zm3 6v2h2v-2H7Zm4 0v2h2v-2h-2Zm4 0v2h2v-2h-2Z"/></svg>';
    const contador = createElement("span", "chat-alert__count");
    icone.append(contador);
    const texto = createElement("span", "chat-alert__text");
    const titulo = createElement("strong", "");
    const previa = createElement("span", "");
    texto.append(titulo, previa);
    abrir.append(icone, texto);
    const fechar = createElement("button", "chat-alert__close", "×");
    fechar.type = "button";
    fechar.setAttribute("aria-label", "Fechar aviso de mensagem");
    aviso.append(abrir, fechar);
    document.body.append(aviso);
    let ultimaVista = null;

    fechar.addEventListener("click", () => {
        aviso.hidden = true;
        try {
            sessionStorage.setItem(AVISO_FECHADO_KEY, ultimaVista || "");
        } catch {}
    });

    const verificar = async () => {
        if (document.hidden) return;
        try {
            const resumo = await api.resumoMensagensNaoLidas();
            atualizarContadorMenu(resumo.total);
            ultimaVista = resumo.ultima_id || null;
            let fechada = null;
            try {
                fechada = sessionStorage.getItem(AVISO_FECHADO_KEY);
            } catch {}
            if (!resumo.total || naPaginaDeMensagens || fechada === resumo.ultima_id) {
                aviso.hidden = true;
                return;
            }
            titulo.textContent = resumo.total === 1
                ? `Nova mensagem de ${resumo.ultima_remetente_nome}`
                : `${resumo.total} mensagens novas`;
            previa.textContent = resumo.total === 1
                ? resumo.ultima_texto
                : `Última de ${resumo.ultima_remetente_nome}: ${resumo.ultima_texto}`;
            contador.textContent = resumo.total > 9 ? "9+" : String(resumo.total);
            abrir.href = caminhoMensagens(resumo.ultima_remetente_id);
            aviso.hidden = false;
        } catch {}
    };
    verificar();
    window.setInterval(verificar, 20000);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) verificar();
    });
    window.addEventListener("nutrilife:mensagens-lidas", verificar);
}

async function loadMessagesPage(user) {
    if (!["nutricionista", "paciente"].includes(user.perfil)) {
        window.location.replace("../dashboard.html");
        return;
    }
    const chat = document.getElementById("chat");
    const listaConversas = document.getElementById("chat-conversations");
    const mensagens = document.getElementById("chat-messages");
    const form = document.getElementById("chat-form");
    const campo = document.getElementById("chat-text");
    const nomeContato = document.getElementById("chat-contact-name");
    const perfilContato = document.getElementById("chat-contact-role");
    let conversas = [];
    let contatoAtual = new URLSearchParams(window.location.search).get("contato");
    let assinaturaAtual = "";

    document.getElementById("messages-subtitle").textContent = user.perfil === "nutricionista"
        ? "Converse com seus pacientes com consulta confirmada ou plano alimentar."
        : "Converse com as nutricionistas que acompanham você.";

    const renderizarConversas = () => {
        listaConversas.replaceChildren();
        if (!conversas.length) {
            listaConversas.append(createElement("p", "item-meta", user.perfil === "nutricionista"
                ? "Você ainda não tem pacientes vinculados. O bate-papo libera após uma consulta confirmada ou um plano alimentar."
                : "Você ainda não tem nutricionista vinculada. O bate-papo libera após uma consulta confirmada ou um plano alimentar."));
            return;
        }
        conversas.forEach((conversa) => {
            const botao = createElement("button", `chat__conversation${conversa.contato_id === contatoAtual ? " is-active" : ""}`);
            botao.type = "button";
            const topo = createElement("span", "chat__conversation-top");
            topo.append(createElement("strong", "", conversa.contato_nome));
            if (conversa.ultima_em) topo.append(createElement("small", "", horarioMensagem(conversa.ultima_em)));
            const rodape = createElement("span", "chat__conversation-bottom");
            rodape.append(createElement("span", "chat__conversation-preview", conversa.ultima_mensagem
                ? `${conversa.ultima_minha ? "Você: " : ""}${conversa.ultima_mensagem}`
                : "Nenhuma mensagem ainda"));
            if (conversa.nao_lidas) rodape.append(createElement("span", "nav-badge", String(conversa.nao_lidas)));
            botao.append(topo, rodape);
            botao.addEventListener("click", () => abrirConversa(conversa.contato_id));
            listaConversas.append(botao);
        });
    };

    const carregarConversas = async () => {
        conversas = await api.listarConversas();
        renderizarConversas();
    };

    const renderizarMensagens = (lista) => {
        const assinatura = lista.map((mensagem) => mensagem.id).join(",");
        if (assinatura === assinaturaAtual) return;
        const noFim = mensagens.scrollHeight - mensagens.scrollTop - mensagens.clientHeight < 80;
        assinaturaAtual = assinatura;
        mensagens.replaceChildren();
        if (!lista.length) {
            mensagens.append(createElement("p", "item-meta chat__empty", "Nenhuma mensagem ainda. Envie a primeira!"));
            return;
        }
        let diaAnterior = "";
        lista.forEach((mensagem) => {
            const dia = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(mensagem.criada_em));
            if (dia !== diaAnterior) {
                mensagens.append(createElement("p", "chat__day", dia));
                diaAnterior = dia;
            }
            const balao = createElement("div", `chat__bubble${mensagem.minha ? " chat__bubble--mine" : ""}`);
            balao.append(
                createElement("p", "chat__bubble-text", mensagem.texto),
                createElement("span", "chat__bubble-time", `${horarioMensagem(mensagem.criada_em)}${mensagem.minha ? (mensagem.lida_em ? " · lida" : " · enviada") : ""}`),
            );
            mensagens.append(balao);
        });
        if (noFim || !mensagens.dataset.carregada) mensagens.scrollTop = mensagens.scrollHeight;
        mensagens.dataset.carregada = "1";
    };

    const atualizarConversaAtual = async () => {
        if (!contatoAtual) return;
        const lista = await api.listarMensagens(contatoAtual);
        renderizarMensagens(lista);
        const conversa = conversas.find((item) => item.contato_id === contatoAtual);
        if (conversa?.nao_lidas) {
            conversa.nao_lidas = 0;
            renderizarConversas();
            window.dispatchEvent(new Event("nutrilife:mensagens-lidas"));
        }
    };

    async function abrirConversa(contatoId) {
        const conversa = conversas.find((item) => item.contato_id === contatoId);
        if (!conversa) return;
        contatoAtual = contatoId;
        assinaturaAtual = "";
        delete mensagens.dataset.carregada;
        history.replaceState(null, "", `?contato=${encodeURIComponent(contatoId)}`);
        nomeContato.textContent = conversa.contato_nome;
        perfilContato.textContent = conversa.contato_perfil === "nutricionista" ? "Nutricionista" : "Paciente";
        form.hidden = false;
        chat.classList.add("is-thread-open");
        renderizarConversas();
        mensagens.replaceChildren(createElement("p", "item-meta chat__empty", "Carregando mensagens..."));
        try {
            await atualizarConversaAtual();
        } catch (error) {
            showDashboardError(error.message);
        }
        campo.focus();
    }

    document.getElementById("chat-back").addEventListener("click", () => chat.classList.remove("is-thread-open"));
    campo.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            form.requestSubmit();
        }
    });
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const texto = campo.value.trim();
        if (!texto || !contatoAtual) return;
        const botao = form.querySelector("button");
        botao.disabled = true;
        try {
            await api.enviarMensagem(contatoAtual, texto);
            campo.value = "";
            delete mensagens.dataset.carregada;
            await atualizarConversaAtual();
            await carregarConversas();
        } catch (error) {
            showDashboardError(error.message);
        } finally {
            botao.disabled = false;
            campo.focus();
        }
    });

    await carregarConversas();
    if (contatoAtual && conversas.some((item) => item.contato_id === contatoAtual)) {
        await abrirConversa(contatoAtual);
    } else if (conversas.length && window.matchMedia("(min-width: 761px)").matches) {
        await abrirConversa(conversas[0].contato_id);
    }
    window.setInterval(() => {
        if (document.hidden) return;
        atualizarConversaAtual().catch(() => {});
    }, 5000);
    window.setInterval(() => {
        if (document.hidden) return;
        carregarConversas().catch(() => {});
    }, 15000);
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
                return `${option.nome} — ${textoQuantidadeAlimento(option)} · ${option.calorias} kcal${nutrition}`;
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

        const resumo = createElement("details", "nutrition-diet");
        const { tabela: tabelaNutricao, nutricao } = montarTabelaNutricaoDieta(plan, "nutrition-diet__table");
        const sumario = createElement("summary", "nutrition-diet__summary");
        sumario.append(
            createElement("strong", "", "Tabela nutricional da dieta"),
            createElement("span", "item-meta", `${Math.round(nutricao.total.energia_kcal).toLocaleString("pt-BR")} kcal por dia`),
        );
        const rolagem = createElement("div", "table-scroll");
        rolagem.append(tabelaNutricao);
        const comparacao = comparacaoGastoDieta(plan, nutricao.total.energia_kcal);
        resumo.append(
            sumario,
            ...(comparacao ? [createElement("p", `energy-compare energy-compare--${comparacao.tipo}`, comparacao.texto)] : []),
            montarDistribuicaoMacros(nutricao, "diet-macros"),
            rolagem,
            createElement("p", "item-meta nutrition-diet__note", avisoNutricaoDieta(nutricao)),
        );
        article.append(resumo);

        const receitasPlano = receitasDoPlano(plan.id);
        if (receitasPlano.length) {
            const secaoReceitas = createElement("section", "plan-recipes");
            secaoReceitas.append(createElement("h5", "", `Receitas da dieta (${receitasPlano.length})`));
            receitasPlano.forEach((receita) => secaoReceitas.append(montarReceitaRecolhivel(receita)));
            article.append(secaoReceitas);
        }

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

const NOMES_PERFIL = {
    paciente: "Paciente",
    nutricionista: "Nutricionista",
    administrador: "Administrador",
};

const FILTROS_ADMIN = [
    ["todos", "Todos", () => true],
    ["paciente", "Pacientes", (user) => user.perfil === "paciente"],
    ["nutricionista", "Nutricionistas", (user) => user.perfil === "nutricionista"],
    ["administrador", "Administradores", (user) => user.perfil === "administrador"],
    ["desativados", "Desativados", (user) => !user.ativo],
];

let filtroAdmin = "todos";

function iniciaisDoNome(nome) {
    const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
    return ((partes[0]?.[0] || "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase() || "?";
}

function renderAdminFilters(users) {
    const container = document.getElementById("admin-user-filters");
    container.replaceChildren(...FILTROS_ADMIN.map(([chave, rotulo, filtro]) => {
        const botao = createElement("button", `admin-filter${filtroAdmin === chave ? " is-active" : ""}`);
        botao.type = "button";
        botao.setAttribute("aria-pressed", String(filtroAdmin === chave));
        botao.append(createElement("span", "", rotulo), createElement("strong", "", String(users.filter(filtro).length)));
        botao.addEventListener("click", () => {
            filtroAdmin = chave;
            renderAdminFilters(users);
            renderAdminUsers(users);
        });
        return botao;
    }));
}

function renderAdminUsers(users) {
    const container = document.getElementById("admin-users-list");
    const search = document.getElementById("admin-user-search").value
        .trim()
        .toLocaleLowerCase("pt-BR");
    const filtro = FILTROS_ADMIN.find(([chave]) => chave === filtroAdmin)[2];
    const filteredUsers = users.filter((user) =>
        filtro(user) && `${user.nome} ${user.email}`.toLocaleLowerCase("pt-BR").includes(search),
    );
    document.getElementById("admin-users-count").textContent = `${filteredUsers.length} de ${users.length} ${users.length === 1 ? "usuário" : "usuários"}`;
    container.replaceChildren();
    if (!filteredUsers.length) {
        container.append(createElement("p", "item-meta", "Nenhum usuário encontrado."));
        return;
    }

    filteredUsers.forEach((user) => {
        const card = createElement("details", "admin-user-card");
        const header = createElement("summary", "admin-user-card__header");
        const identidade = createElement("div", "admin-user-card__identity");
        const detalhe = user.perfil === "nutricionista"
            ? `${user.email} · ${formatarCrn(user.crn)}${user.estado ? ` · ${user.estado}` : ""}`
            : `${user.email}${user.estado ? ` · ${user.estado}` : ""}`;
        identidade.append(createElement("strong", "", user.nome), createElement("span", "item-meta", detalhe));
        const tags = createElement("div", "admin-user-card__tags");
        tags.append(
            createElement("span", `item-tag admin-role admin-role--${user.perfil}`, NOMES_PERFIL[user.perfil] || user.perfil),
            createElement("span", `item-tag ${user.ativo ? "item-tag--confirmada" : "admin-user-status--inactive"}`, user.ativo ? "Ativo" : "Desativado"),
        );
        header.append(createElement("span", `admin-avatar admin-avatar--${user.perfil}`, iniciaisDoNome(user.nome)), identidade, tags);
        card.append(header);
        if (user.perfil === "administrador") {
            header.append(createElement("span", "admin-user-card__toggle", "Detalhes"));
            card.append(createElement(
                "p",
                "item-meta admin-user-card__note",
                "Conta administrativa protegida; não pode ser editada ou excluída por este painel.",
            ));
            container.append(card);
            return;
        }
        header.append(createElement("span", "admin-user-card__toggle", "Editar"));

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
    renderAdminFilters(adminUsersCache);
    renderAdminUsers(adminUsersCache);
}

function rotuloMes(mes) {
    return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(`${mes}-15T12:00:00`)).replace(".", "");
}

function montarBarrasHorizontais(container, itens, vazio) {
    if (!itens.length || itens.every((item) => !item.valor)) {
        container.replaceChildren(createElement("p", "item-meta", vazio));
        return;
    }
    const maximo = Math.max(...itens.map((item) => item.valor), 1);
    container.replaceChildren(...itens.map((item) => {
        const linha = createElement("div", "admin-bar");
        const topo = createElement("div", "admin-bar__top");
        topo.append(createElement("span", "", item.rotulo), createElement("strong", "", item.valor.toLocaleString("pt-BR")));
        const trilho = createElement("div", "admin-bar__track");
        const preenchimento = createElement("span", `admin-bar__fill${item.classe ? ` ${item.classe}` : ""}`);
        preenchimento.style.width = `${(item.valor / maximo) * 100}%`;
        trilho.append(preenchimento);
        linha.append(topo, trilho);
        return linha;
    }));
}

function montarGraficoColunas(container, meses, series, altura = 220) {
    const largura = Math.max(300, Math.round(container.clientWidth) || 640);
    const margem = { topo: 24, base: 30, esquerda: 12, direita: 12 };
    const maximo = Math.max(1, ...meses.flatMap((mes) => series.map(([chave]) => mes[chave])));
    const passo = (largura - margem.esquerda - margem.direita) / meses.length;
    const larguraBarra = Math.min(28, (passo * 0.7) / series.length);
    const escala = (valor) => (altura - margem.topo - margem.base) * (valor / maximo);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${largura} ${altura}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Gráfico por mês: ${series.map(([, rotulo]) => rotulo).join(" e ")}`);
    const adicionar = (tag, atributos, texto) => {
        const elemento = document.createElementNS(ns, tag);
        Object.entries(atributos).forEach(([chave, valor]) => elemento.setAttribute(chave, valor));
        if (texto !== undefined) elemento.textContent = texto;
        svg.append(elemento);
    };
    const base = altura - margem.base;
    adicionar("line", { x1: margem.esquerda, x2: largura - margem.direita, y1: base, y2: base, class: "admin-chart__axis" });
    meses.forEach((mes, indice) => {
        const centro = margem.esquerda + passo * indice + passo / 2;
        series.forEach(([chave, , classe], serie) => {
            const valor = mes[chave];
            const x = centro - (larguraBarra * series.length) / 2 + larguraBarra * serie;
            const h = Math.max(escala(valor), valor ? 3 : 0);
            adicionar("rect", { x: x + 2, y: base - h, width: larguraBarra - 4, height: h, rx: 4, class: classe });
            if (valor) adicionar("text", { x: x + larguraBarra / 2, y: base - h - 6, class: "admin-chart__value", "text-anchor": "middle" }, String(valor));
        });
        adicionar("text", { x: centro, y: altura - 10, class: "admin-chart__label", "text-anchor": "middle" }, rotuloMes(mes.mes));
    });
    container.replaceChildren(svg);
}

async function loadAdminDashboardPage() {
    const resumo = await api.resumoAdministrador();
    const { usuarios, consultas, conteudo } = resumo;
    const numero = (valor) => Number(valor || 0).toLocaleString("pt-BR");
    const cartoes = [
        ["Usuários", numero(usuarios.total), `+${numero(usuarios.novos_30_dias)} nos últimos 30 dias`],
        ["Pacientes", numero(usuarios.pacientes), `${numero(usuarios.desativados)} ${usuarios.desativados === 1 ? "conta desativada" : "contas desativadas"} no total`],
        ["Nutricionistas", numero(usuarios.nutricionistas), `${numero(resumo.nutricionistas_por_estado.length)} ${resumo.nutricionistas_por_estado.length === 1 ? "estado" : "estados"} com atendimento`],
        ["Consultas confirmadas", numero(consultas.confirmadas), `${numero(consultas.proximos_7_dias)} nos próximos 7 dias`],
        ["Planos alimentares", numero(conteudo.planos), `${numero(conteudo.receitas)} receitas cadastradas`],
        ["Avaliação média", conteudo.nota_media === null ? "–" : `★ ${conteudo.nota_media.toLocaleString("pt-BR")}`, `${numero(conteudo.comentarios)} ${conteudo.comentarios === 1 ? "comentário" : "comentários"}`],
    ];
    document.getElementById("admin-kpis").replaceChildren(...cartoes.map(([rotulo, valor, detalhe]) => {
        const cartao = createElement("article", "kpi-card admin-kpi");
        cartao.append(
            createElement("span", "kpi-card__label", rotulo),
            createElement("div", "kpi-card__value", valor),
            createElement("span", "admin-kpi__detail", detalhe),
        );
        return cartao;
    }));

    montarGraficoColunas(document.getElementById("admin-signups-chart"), resumo.cadastros_por_mes, [
        ["pacientes", "Pacientes", "admin-chart__bar--pacientes"],
        ["nutricionistas", "Nutricionistas", "admin-chart__bar--nutricionistas"],
    ], 240);

    montarBarrasHorizontais(document.getElementById("admin-appointments"), [
        { rotulo: "Confirmadas", valor: consultas.confirmadas, classe: "admin-bar__fill--confirmada" },
        { rotulo: "Pendentes", valor: consultas.pendentes, classe: "admin-bar__fill--pendente" },
        { rotulo: "Canceladas", valor: consultas.canceladas, classe: "admin-bar__fill--cancelada" },
    ], "Nenhuma consulta agendada ainda.");
    montarGraficoColunas(document.getElementById("admin-appointments-chart"), resumo.consultas_por_mes, [
        ["total", "Consultas", "admin-chart__bar--pacientes"],
    ], 160);

    const estatisticas = [
        ["Avaliações físicas", conteudo.avaliacoes_fisicas],
        ["Anamneses preenchidas", conteudo.anamneses],
        ["Mensagens (30 dias)", conteudo.mensagens_30_dias],
        ["Receitas", conteudo.receitas],
    ];
    document.getElementById("admin-content").replaceChildren(...estatisticas.map(([rotulo, valor]) => {
        const item = createElement("div", "admin-stat");
        item.append(createElement("strong", "", numero(valor)), createElement("span", "", rotulo));
        return item;
    }));

    montarBarrasHorizontais(
        document.getElementById("admin-states"),
        resumo.nutricionistas_por_estado.map((item) => ({ rotulo: item.estado, valor: item.total })),
        "Nenhum nutricionista com estado informado.",
    );

    const destaque = document.getElementById("admin-top");
    destaque.replaceChildren(...(resumo.nutricionistas_destaque.length
        ? resumo.nutricionistas_destaque.map((item, indice) => {
            const linha = createElement("li", "admin-list__item");
            linha.append(
                createElement("span", "admin-list__rank", String(indice + 1)),
                createElement("span", "admin-list__name", item.nome),
                createElement("strong", "", `${numero(item.consultas)} ${item.consultas === 1 ? "consulta" : "consultas"}`),
            );
            return linha;
        })
        : [createElement("li", "item-meta", "Ainda não há consultas confirmadas.")]));

    const recentes = document.getElementById("admin-recent");
    recentes.replaceChildren(...resumo.ultimos_cadastros.map((item) => {
        const linha = createElement("li", "admin-list__item");
        const info = createElement("span", "admin-list__name");
        info.append(createElement("strong", "", item.nome), createElement("small", "item-meta", NOMES_PERFIL[item.perfil] || item.perfil));
        linha.append(
            createElement("span", `admin-avatar admin-avatar--${item.perfil}`, iniciaisDoNome(item.nome)),
            info,
            createElement("span", "item-meta", new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(item.criado_em))),
        );
        return linha;
    }));
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

let ajustesDisponibilidade = new Map();

function chaveData(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function horariosDoDia(date, weeklySchedule) {
    const chave = chaveData(date);
    if (ajustesDisponibilidade.has(chave)) {
        return { horarios: ajustesDisponibilidade.get(chave), ajustado: true };
    }
    const dayOfWeek = calendarWeekdayToAvailabilityIndex(date.getDay());
    return { horarios: weeklySchedule.filter((window) => window.dia_semana === dayOfWeek), ajustado: false };
}

async function salvarDisponibilidadeCompleta() {
    const hoje = chaveData(new Date());
    return api.salvarDisponibilidade({
        fuso_horario: document.getElementById("timezone").value,
        horarios: getAvailabilityDraft(),
        datas_especificas: [...ajustesDisponibilidade.entries()]
            .filter(([data]) => data >= hoje)
            .map(([data, horarios]) => ({ data, horarios })),
    });
}

function renderAvailabilityDay(selectedDate, weeklySchedule) {
    const title = document.getElementById("availability-selected-date");
    const details = document.getElementById("availability-day-schedule");
    const chave = chaveData(selectedDate);
    const { horarios, ajustado } = horariosDoDia(selectedDate, weeklySchedule);
    const dataExtenso = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(selectedDate);
    title.textContent = new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
    }).format(selectedDate);
    details.replaceChildren();
    details.append(createElement(
        "span",
        `availability-day-badge${ajustado ? " availability-day-badge--custom" : ""}`,
        ajustado ? "Ajustado só para este dia" : "Segue o horário da semana",
    ));
    if (!horarios.length) {
        details.append(createElement("p", "item-meta", "Sem horários de atendimento neste dia."));
    }
    horarios.forEach((window) => {
        details.append(createElement(
            "p",
            "availability-day-slot",
            `${window.inicio} – ${window.fim} · consultas de ${window.duracao_minutos} min`,
        ));
    });

    if (chave < chaveData(new Date())) {
        details.append(createElement("p", "item-meta", "Datas passadas não podem ser ajustadas."));
        return;
    }

    const atualizarTela = () => document.dispatchEvent(new Event("availabilitychange"));
    const salvarDia = async (mensagem, desfazer) => {
        try {
            await salvarDisponibilidadeCompleta();
            showDashboardSuccess(mensagem);
        } catch (error) {
            desfazer();
            showDashboardError(error.message);
        }
        atualizarTela();
    };

    const acoes = createElement("div", "availability-day-actions");
    const ajustar = createElement("button", "btn btn--ghost", ajustado ? "Editar horários deste dia" : "Ajustar só este dia");
    ajustar.type = "button";
    const fechar = createElement("button", "btn btn--ghost", "Sem atendimento neste dia");
    fechar.type = "button";
    fechar.hidden = ajustado && !horarios.length;
    acoes.append(ajustar, fechar);
    if (ajustado) {
        const voltar = createElement("button", "btn btn--ghost", "Voltar ao horário da semana");
        voltar.type = "button";
        voltar.addEventListener("click", () => {
            const anterior = ajustesDisponibilidade.get(chave);
            ajustesDisponibilidade.delete(chave);
            salvarDia(`${dataExtenso} voltou a seguir o horário da semana.`, () => ajustesDisponibilidade.set(chave, anterior));
        });
        acoes.append(voltar);
    }
    details.append(acoes);

    fechar.addEventListener("click", () => {
        const anterior = ajustesDisponibilidade.get(chave);
        ajustesDisponibilidade.set(chave, []);
        salvarDia(`${dataExtenso} ficou sem atendimento.`, () => {
            if (anterior) ajustesDisponibilidade.set(chave, anterior);
            else ajustesDisponibilidade.delete(chave);
        });
    });

    ajustar.addEventListener("click", () => {
        acoes.hidden = true;
        const dia = calendarWeekdayToAvailabilityIndex(selectedDate.getDay());
        const editor = createElement("form", "availability-day-editor");
        editor.append(createElement("h3", "", `Horários de ${dataExtenso}`));
        const janelas = createElement("div", "availability-day-editor__windows");
        (horarios.length ? horarios : [{ inicio: "09:00", fim: "12:00", duracao_minutos: 60 }])
            .forEach((window) => janelas.append(createAvailabilityWindow(dia, window)));
        const adicionar = createElement("button", "btn btn--ghost", "Adicionar horário");
        adicionar.type = "button";
        adicionar.addEventListener("click", () => janelas.append(createAvailabilityWindow(dia)));
        const botoes = createElement("div", "availability-day-actions");
        const salvar = createElement("button", "btn btn--primary", "Salvar este dia");
        salvar.type = "submit";
        const cancelar = createElement("button", "btn btn--ghost", "Cancelar");
        cancelar.type = "button";
        cancelar.addEventListener("click", atualizarTela);
        botoes.append(salvar, cancelar);
        editor.append(janelas, adicionar, botoes);
        editor.addEventListener("submit", (event) => {
            event.preventDefault();
            const novos = [...janelas.querySelectorAll(".weekday-window")].map((row) => ({
                inicio: row.querySelector('[name="inicio"]').value,
                fim: row.querySelector('[name="fim"]').value,
                duracao_minutos: Number(row.querySelector('[name="duracao_minutos"]').value),
            }));
            if (novos.some((janela) => janela.inicio >= janela.fim)) {
                showDashboardError("O horário final deve ser depois do inicial.");
                return;
            }
            const anterior = ajustesDisponibilidade.get(chave);
            ajustesDisponibilidade.set(chave, novos);
            salvarDia(`Horários de ${dataExtenso} salvos.`, () => {
                if (anterior) ajustesDisponibilidade.set(chave, anterior);
                else ajustesDisponibilidade.delete(chave);
            });
        });
        details.append(editor);
    });
}

function renderProfessionalAvailabilityCalendar(month, selectedDate) {
    const calendar = document.getElementById("professional-availability-calendar");
    const monthLabel = document.getElementById("availability-calendar-month");
    const weeklySchedule = getAvailabilityDraft();
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
        const { horarios: windows, ajustado } = horariosDoDia(date, weeklySchedule);
        const isSelected = date.toDateString() === selectedDate.toDateString();
        const classes = ["calendar-day"];
        if (windows.length) classes.push("calendar-day--available");
        if (ajustado) classes.push(windows.length ? "calendar-day--custom" : "calendar-day--closed");
        if (isSelected) classes.push("calendar-day--selected");
        const button = createElement("button", classes.join(" "));
        button.type = "button";
        button.append(createElement("span", "calendar-day__number", String(day)));
        if (windows.length) {
            button.append(createElement("span", "calendar-day__status", ajustado ? "Só este dia" : "Atendimento"));
            windows.forEach((window) => {
                button.append(createElement(
                    "span",
                    "calendar-day__time",
                    `${window.inicio}–${window.fim}`,
                ));
            });
        } else if (ajustado) {
            button.append(createElement("span", "calendar-day__status", "Sem atendimento"));
        }
        button.setAttribute(
            "aria-label",
            `${new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(date)}${
                windows.length
                    ? `, atendimento ${windows.map((window) => `${window.inicio} a ${window.fim}`).join(", ")}${ajustado ? ", ajustado só para este dia" : ""}`
                    : ajustado ? ", sem atendimento neste dia" : ", sem atendimento configurado"
            }`,
        );
        button.addEventListener("click", () => {
            selectedDate.setTime(date.getTime());
            renderProfessionalAvailabilityCalendar(month, selectedDate);
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
    ajustesDisponibilidade = new Map((current.datas_especificas || []).map((item) => [item.data, item.horarios]));
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
            await salvarDisponibilidadeCompleta();
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
    "overview-nav": ["nutricionista"],
    "admin-dashboard-nav": ["administrador"],
    "patient-home-nav": ["paciente"],
    "search-nav": ["paciente"],
    "patients-nav": ["nutricionista"],
    "plans-nav": ["paciente", "nutricionista"],
    "recipes-nav": ["paciente", "nutricionista"],
    "messages-nav": ["paciente", "nutricionista"],
    "measures-nav": ["paciente"],
    "anamnesis-nav": ["paciente"],
    "appointments-nav": ["paciente", "nutricionista"],
    "availability-nav": ["nutricionista"],
    "profile-nav": ["nutricionista"],
    "admin-users-nav": ["administrador"],
};

const GRUPOS_DO_MENU = {
    nutricionista: [
        ["Alimentação", ["plans-nav", "recipes-nav"]],
        ["Agenda", ["appointments-nav", "availability-nav"]],
    ],
    paciente: [
        ["Meu acompanhamento", ["plans-nav", "recipes-nav", "measures-nav", "anamnesis-nav"]],
    ],
};

function fecharGruposDoMenu(exceto = null) {
    document.querySelectorAll(".nav-group.is-open").forEach((grupo) => {
        if (grupo === exceto) return;
        grupo.classList.remove("is-open");
        grupo.querySelector(".nav-group__toggle").setAttribute("aria-expanded", "false");
    });
}

function agruparMenu(perfil) {
    const menu = document.querySelector(".sidebar-nav");
    if (!menu || menu.dataset.agrupado === perfil) return;
    menu.dataset.agrupado = perfil;
    (GRUPOS_DO_MENU[perfil] || []).forEach(([titulo, ids], indice) => {
        const links = ids.map((id) => document.getElementById(id)).filter((link) => link && !link.hidden);
        if (links.length < 2) return;
        const grupo = createElement("div", "nav-group");
        const botao = createElement("button", "sidebar-link nav-group__toggle");
        botao.type = "button";
        botao.setAttribute("aria-haspopup", "true");
        botao.setAttribute("aria-expanded", "false");
        botao.setAttribute("aria-controls", `nav-group-${indice}`);
        botao.append(createElement("span", "", titulo), createElement("span", "nav-group__chevron"));
        const lista = createElement("div", "nav-group__menu");
        lista.id = `nav-group-${indice}`;
        menu.insertBefore(grupo, links[0]);
        links.forEach((link) => lista.append(link));
        if (links.some((link) => link.classList.contains("is-active"))) botao.classList.add("is-active");
        grupo.append(botao, lista);
        botao.addEventListener("click", (event) => {
            event.stopPropagation();
            const abrir = !grupo.classList.contains("is-open");
            fecharGruposDoMenu(grupo);
            grupo.classList.toggle("is-open", abrir);
            botao.setAttribute("aria-expanded", String(abrir));
        });
    });
}

document.addEventListener("click", (event) => {
    if (!event.target.closest(".nav-group")) fecharGruposDoMenu();
});
document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const aberto = document.querySelector(".nav-group.is-open .nav-group__toggle");
    fecharGruposDoMenu();
    aberto?.focus();
});

function aplicarMenuPorPerfil(perfil) {
    Object.entries(MENU_POR_PERFIL).forEach(([id, perfis]) => {
        const link = document.getElementById(id);
        if (link) link.hidden = !perfis.includes(perfil);
    });
    document.querySelectorAll("[data-perfis]").forEach((elemento) => {
        elemento.hidden = !elemento.dataset.perfis.split(" ").includes(perfil);
    });
    agruparMenu(perfil);
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
    if (user.perfil === "administrador") {
        window.location.replace("./pages/admin-painel.html");
        return;
    }
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

const gastosPorPaciente = new Map();

function gastoDoPaciente(pacienteId) {
    if (!gastosPorPaciente.has(pacienteId)) {
        gastosPorPaciente.set(pacienteId, api.medidasDoPaciente(pacienteId).then(gastoDaUltimaAvaliacao).catch(() => null));
    }
    return gastosPorPaciente.get(pacienteId);
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
        const energia = document.getElementById("plan-patient-energy");
        select.addEventListener("change", async () => {
            energia.hidden = !select.value;
            if (!select.value) return;
            const pacienteId = select.value;
            energia.replaceChildren(createElement("span", "item-meta", "Calculando gasto energético..."));
            const gasto = await gastoDoPaciente(pacienteId);
            if (select.value === pacienteId) montarMetasEnergia(energia, gasto);
        });
    }

    const [plans, receitas] = await Promise.all([
        api.listarPlanos(),
        user.perfil === "administrador" ? [] : api.listarReceitas().catch(() => []),
    ]);
    receitasCarregadas = receitas;
    if (user.perfil === "paciente") {
        const gasto = gastoDaUltimaAvaliacao(await api.minhasMedidas().catch(() => []));
        plans.forEach((plan) => { plan.energiaPaciente = gasto; });
    } else if (user.perfil === "nutricionista") {
        const gastos = await Promise.all(plans.map((plan) => gastoDoPaciente(plan.paciente_id)));
        plans.forEach((plan, indice) => { plan.energiaPaciente = gastos[indice]; });
    }
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
        const measuresLink = createElement("a", "btn btn--ghost", "Ver medidas");
        measuresLink.href = `./medidas.html?paciente=${encodeURIComponent(patient.id)}`;
        const anamnesisLink = createElement("a", "btn btn--ghost", "Anamnese");
        anamnesisLink.href = `./anamnese.html?paciente=${encodeURIComponent(patient.id)}`;
        const actions = createElement("div", "patient-action-links");
        actions.append(plansLink, consultationsLink, measuresLink, anamnesisLink);
        item.append(info, actions);
        list.append(item);
    });
}

const DOBRAS_CUTANEAS = [
    ["tricipital", "Tricipital"],
    ["bicipital", "Bicipital"],
    ["abdominal", "Abdominal"],
    ["subescapular", "Subescapular"],
    ["axilar_media", "Axilar média"],
    ["coxa", "Coxa"],
    ["toracica", "Torácica (peitoral)"],
    ["suprailiaca", "Suprailíaca"],
    ["panturrilha", "Panturrilha"],
    ["supraespinhal", "Supraespinhal"],
];

const CIRCUNFERENCIAS = [
    ["pescoco", "Pescoço"],
    ["torax", "Tórax"],
    ["ombro", "Ombro"],
    ["cintura", "Cintura"],
    ["quadril", "Quadril"],
    ["abdomen", "Abdômen"],
    ["braco_relaxado", "Braço relaxado"],
    ["braco_contraido", "Braço contraído"],
    ["antebraco", "Antebraço"],
    ["coxa_proximal", "Coxa proximal"],
    ["coxa_medial", "Coxa medial"],
    ["coxa_distal", "Coxa distal"],
    ["panturrilha", "Panturrilha"],
];

const PROTOCOLOS_GORDURA = {
    pollock7: {
        nome: "Pollock 7 dobras",
        dobras: () => ["toracica", "axilar_media", "tricipital", "subescapular", "abdominal", "suprailiaca", "coxa"],
    },
    pollock3: {
        nome: "Pollock 3 dobras",
        dobras: (sexo) => (sexo === "masculino" ? ["toracica", "abdominal", "coxa"] : ["tricipital", "suprailiaca", "coxa"]),
    },
};

const NIVEIS_ATIVIDADE = {
    sedentario: { nome: "Sedentário", descricao: "pouco ou nenhum exercício" },
    leve: { nome: "Levemente ativo", descricao: "exercício 1 a 3 vezes por semana" },
    moderado: { nome: "Moderadamente ativo", descricao: "exercício 3 a 5 vezes por semana" },
    intenso: { nome: "Muito ativo", descricao: "exercício 6 a 7 vezes por semana" },
    muito_intenso: { nome: "Extremamente ativo", descricao: "treino pesado diário ou trabalho físico" },
};

function detalheGasto(r, avaliacao) {
    if (r.tmb_kcal === null) return "Disponível a partir dos 18 anos";
    if (r.get_kcal === null) return "Informe o nível de atividade física";
    return `TMB × ${formatarNumero(r.fator_atividade, 3)} · ${NIVEIS_ATIVIDADE[avaliacao.nivel_atividade]?.nome.toLowerCase() || ""}`;
}

function metasCaloricas(get) {
    return [
        ["Emagrecer", get - 500, get - 300],
        ["Manter", get, get],
        ["Ganhar massa", get + 300, get + 500],
    ];
}

function gastoDaUltimaAvaliacao(avaliacoes) {
    const ultima = [...avaliacoes].reverse().find((avaliacao) => avaliacao.resultados.get_kcal !== null);
    return ultima ? { get: ultima.resultados.get_kcal, tmb: ultima.resultados.tmb_kcal, data: ultima.data_avaliacao, nivel: ultima.nivel_atividade } : null;
}

function montarMetasEnergia(container, gasto) {
    if (!gasto) {
        container.replaceChildren(createElement("span", "item-meta", "Este paciente ainda não tem avaliação com nível de atividade física. Registre em Medidas para ver o gasto energético."));
        return;
    }
    const kcal = (valor) => Math.round(valor).toLocaleString("pt-BR");
    const titulo = createElement("p", "energy-target__title");
    titulo.append(
        createElement("strong", "", `GET ${kcal(gasto.get)} kcal/dia`),
        createElement("span", "", ` · TMB ${kcal(gasto.tmb)} kcal · ${NIVEIS_ATIVIDADE[gasto.nivel]?.nome || ""} · avaliação de ${formatarDataCurta(gasto.data)}`),
    );
    const metas = createElement("div", "energy-target__goals");
    metasCaloricas(gasto.get).forEach(([rotulo, minimo, maximo]) => {
        const meta = createElement("span", "energy-target__goal");
        meta.append(createElement("small", "", rotulo), createElement("strong", "", minimo === maximo ? `${kcal(minimo)} kcal` : `${kcal(minimo)}–${kcal(maximo)} kcal`));
        metas.append(meta);
    });
    container.replaceChildren(titulo, metas);
}

function comparacaoGastoDieta(plan, energiaDieta) {
    const gasto = plan.energiaPaciente;
    if (!gasto) return null;
    const diferenca = Math.round(energiaDieta - gasto.get);
    const kcal = (valor) => Math.abs(Math.round(valor)).toLocaleString("pt-BR");
    const percentual = Math.round((Math.abs(diferenca) / gasto.get) * 100);
    const situacao = Math.abs(diferenca) < 100
        ? "dieta próxima do gasto, ideal para manutenção"
        : diferenca < 0
            ? `déficit de ${kcal(diferenca)} kcal (${percentual}% abaixo do gasto)`
            : `superávit de ${kcal(diferenca)} kcal (${percentual}% acima do gasto)`;
    return {
        texto: `Gasto energético total (GET) do paciente: ${kcal(gasto.get)} kcal/dia, pela avaliação de ${formatarDataCurta(gasto.data)}. Esta dieta tem ${kcal(energiaDieta)} kcal: ${situacao}.`,
        tipo: Math.abs(diferenca) < 100 ? "manter" : diferenca < 0 ? "deficit" : "superavit",
    };
}

function detalheGordura(r) {
    const protocolo = PROTOCOLOS_GORDURA[r.protocolo_gordura]?.nome;
    if (r.percentual_gordura !== null) return [r.classificacao_gordura, protocolo].filter(Boolean).join(" · ");
    if (r.dobras_faltando?.length) return `${protocolo}: faltam ${r.dobras_faltando.join(", ")}`;
    return "Informe as dobras cutâneas";
}

const PARAMETROS_CALCULADOS = [
    ["Peso atual (kg)", (m) => m.peso_kg, 1],
    ["Altura (cm)", (m) => m.altura_cm, 0],
    ["Índice de Massa Corporal (kg/m²)", (m) => m.resultados.imc, 1],
    ["Classificação do IMC", (m) => m.resultados.classificacao_imc],
    ["Relação cintura/quadril (RCQ)", (m) => m.resultados.rcq, 2],
    ["Risco metabólico por RCQ", (m) => m.resultados.risco_rcq],
    ["Relação cintura/estatura (RCE)", (m) => m.resultados.rce, 2],
    ["Risco por RCE", (m) => m.resultados.risco_rce],
    ["Circ. muscular do braço (CMB) (cm)", (m) => m.resultados.cmb_cm, 1],
    ["Adequação da CMB (%)", (m) => m.resultados.adequacao_cmb, 1],
    ["Classificação da CMB", (m) => m.resultados.classificacao_cmb],
    ["Protocolo do % de gordura", (m) => PROTOCOLOS_GORDURA[m.resultados.protocolo_gordura]?.nome || null],
    ["Percentual de gordura (%)", (m) => m.resultados.percentual_gordura, 1],
    ["% de gordura — Pollock 7 dobras", (m) => m.resultados.percentual_gordura_pollock7 ?? null, 1],
    ["% de gordura — Pollock 3 dobras", (m) => m.resultados.percentual_gordura_pollock3 ?? null, 1],
    ["Classificação do % de gordura", (m) => m.resultados.classificacao_gordura],
    ["Massa de gordura (kg)", (m) => m.resultados.massa_gordura_kg, 1],
    ["Massa livre de gordura (kg)", (m) => m.resultados.massa_livre_gordura_kg, 1],
    ["Massa residual (kg)", (m) => m.resultados.massa_residual_kg, 1],
    ["Somatório de dobras do protocolo (mm)", (m) => m.resultados.soma_dobras_metodo_mm, 1],
    ["Densidade corporal (g/mL)", (m) => m.resultados.densidade_corporal, 3],
    ["Taxa metabólica basal (kcal)", (m) => m.resultados.tmb_kcal, 0],
    ["Nível de atividade física", (m) => NIVEIS_ATIVIDADE[m.nivel_atividade]?.nome || null],
    ["Gasto energético total (kcal)", (m) => m.resultados.get_kcal ?? null, 0],
];

function formatarNumero(valor, casas = 1) {
    if (valor === null || valor === undefined || valor === "") return "–";
    return Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

function formatarDataCurta(iso) {
    return new Intl.DateTimeFormat("pt-BR").format(new Date(`${iso}T12:00:00`));
}

function celulaComVariacao(atual, anterior, casas) {
    const celula = createElement("td", "", formatarNumero(atual, casas));
    if (typeof atual === "number" && typeof anterior === "number" && atual !== anterior) {
        const diferenca = atual - anterior;
        const seta = diferenca > 0 ? "↑" : "↓";
        celula.append(createElement(
            "small",
            "measure-delta",
            ` ${seta} (${diferenca > 0 ? "+" : ""}${formatarNumero(diferenca, casas)})`,
        ));
    }
    return celula;
}

function montarTabelaHistorico(tabela, avaliacoes, linhas) {
    const recentes = avaliacoes.slice(-6);
    const cabecalho = createElement("thead");
    const linhaCabecalho = createElement("tr");
    linhaCabecalho.append(createElement("th", "", "Parâmetro"));
    recentes.forEach((avaliacao) => linhaCabecalho.append(createElement("th", "", formatarDataCurta(avaliacao.data_avaliacao))));
    cabecalho.append(linhaCabecalho);
    const corpo = createElement("tbody");
    linhas.forEach(([rotulo, valor, casas]) => {
        const valores = recentes.map(valor);
        if (valores.every((v) => v === null || v === undefined)) return;
        const linha = createElement("tr");
        linha.append(createElement("th", "", rotulo));
        valores.forEach((atual, indice) => {
            linha.append(casas === undefined
                ? createElement("td", "", atual || "–")
                : celulaComVariacao(atual, indice > 0 ? valores[indice - 1] : null, casas));
        });
        corpo.append(linha);
    });
    tabela.replaceChildren(cabecalho, corpo);
}

const METRICAS_GRAFICO = [
    ["composicao", "Composição corporal", null, "kg", 1],
    ["peso", "Peso", (m) => m.peso_kg, "kg", 1],
    ["gordura", "% de gordura", (m) => m.resultados.percentual_gordura, "%", 1],
    ["imc", "IMC", (m) => m.resultados.imc, "", 1],
    ["massa_magra", "Massa livre de gordura", (m) => m.resultados.massa_livre_gordura_kg, "kg", 1],
    ["cintura", "Cintura", (m) => m.circunferencias.cintura ?? null, "cm", 1],
    ["quadril", "Quadril", (m) => m.circunferencias.quadril ?? null, "cm", 1],
    ["abdomen", "Abdômen", (m) => m.circunferencias.abdomen ?? null, "cm", 1],
    ["get", "Gasto energético total", (m) => m.resultados.get_kcal ?? null, "kcal", 0],
];

function montarGraficoLinha(container, avaliacoes, [, rotulo, valor, unidade, casas]) {
    const dados = avaliacoes.slice(-8).map((avaliacao) => ({ data: avaliacao.data_avaliacao, valor: valor(avaliacao) })).filter((ponto) => typeof ponto.valor === "number");
    if (!dados.length) {
        container.replaceChildren(createElement("p", "item-meta measures-chart__empty", `Ainda não há ${rotulo.toLowerCase()} registrado nas avaliações.`));
        return;
    }
    const largura = 720;
    const altura = 260;
    const margem = { topo: 28, direita: 24, base: 34, esquerda: 48 };
    const valores = dados.map((ponto) => ponto.valor);
    const folga = Math.max((Math.max(...valores) - Math.min(...valores)) * 0.25, Math.max(...valores) * 0.04, 1);
    const minimo = Math.max(0, Math.min(...valores) - folga);
    const maximo = Math.max(...valores) + folga;
    const escalaY = (v) => margem.topo + (altura - margem.topo - margem.base) * (1 - (v - minimo) / (maximo - minimo));
    const passo = (largura - margem.esquerda - margem.direita) / dados.length;
    const sufixo = unidade === "%" ? "%" : unidade ? ` ${unidade}` : "";
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${largura} ${altura}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Gráfico de evolução: ${rotulo}`);
    const adicionar = (tag, atributos, texto) => {
        const elemento = document.createElementNS(ns, tag);
        Object.entries(atributos).forEach(([chave, v]) => elemento.setAttribute(chave, v));
        if (texto !== undefined) elemento.textContent = texto;
        svg.append(elemento);
        return elemento;
    };
    for (let i = 0; i <= 4; i += 1) {
        const v = minimo + ((maximo - minimo) / 4) * i;
        const y = escalaY(v);
        adicionar("line", { x1: margem.esquerda, x2: largura - margem.direita, y1: y, y2: y, stroke: "#E0E0E0", "stroke-width": 1 });
        adicionar("text", { x: margem.esquerda - 8, y: y + 4, fill: "#828282", "font-size": 11, "font-family": "Work Sans, Arial, sans-serif", "text-anchor": "end" }, formatarNumero(v, casas === 0 ? 0 : 1));
    }
    const pontos = dados.map((ponto, indice) => [margem.esquerda + passo * indice + passo / 2, escalaY(ponto.valor), ponto]);
    if (pontos.length > 1) {
        const base = escalaY(minimo);
        adicionar("polygon", {
            points: [`${pontos[0][0]},${base}`, ...pontos.map(([x, y]) => `${x},${y}`), `${pontos[pontos.length - 1][0]},${base}`].join(" "),
            fill: "#0D5017",
            "fill-opacity": 0.08,
        });
        adicionar("polyline", { points: pontos.map(([x, y]) => `${x},${y}`).join(" "), fill: "none", stroke: "#0D5017", "stroke-width": 2.5 });
    }
    pontos.forEach(([x, y, ponto]) => {
        adicionar("circle", { cx: x, cy: y, r: 5, fill: "#FFFFFF", stroke: "#0D5017", "stroke-width": 2.5 });
        adicionar("text", { x, y: y - 12, fill: "#0D5017", "font-size": 11, "font-weight": 600, "font-family": "Work Sans, Arial, sans-serif", "text-anchor": "middle" }, `${formatarNumero(ponto.valor, casas)}${sufixo}`);
        adicionar("text", { x, y: altura - 12, fill: "#828282", "font-size": 11, "font-family": "Work Sans, Arial, sans-serif", "text-anchor": "middle" }, formatarDataCurta(ponto.data));
    });
    container.replaceChildren(svg);
}

function textoVariacaoMetrica(avaliacoes, [, rotulo, valor, unidade, casas]) {
    const valores = avaliacoes.map((avaliacao) => ({ data: avaliacao.data_avaliacao, valor: valor(avaliacao) })).filter((ponto) => typeof ponto.valor === "number");
    if (valores.length < 2) return valores.length ? "Registre mais avaliações para acompanhar a evolução." : "";
    const primeiro = valores[0];
    const ultimo = valores[valores.length - 1];
    const diferenca = ultimo.valor - primeiro.valor;
    const sufixo = unidade === "%" ? " p.p." : unidade ? ` ${unidade}` : "";
    if (Math.abs(diferenca) < 10 ** -casas) return `${rotulo} estável desde ${formatarDataCurta(primeiro.data)}.`;
    return `${rotulo}: ${diferenca > 0 ? "+" : "−"}${formatarNumero(Math.abs(diferenca), casas)}${sufixo} desde ${formatarDataCurta(primeiro.data)} (${valores.length} avaliações).`;
}

function montarGraficoEvolucao(container, avaliacoes) {
    const dados = avaliacoes.slice(-8);
    const largura = 720;
    const altura = 260;
    const margem = { topo: 16, direita: 16, base: 34, esquerda: 40 };
    const maxPeso = Math.ceil((Math.max(...dados.map((d) => d.peso_kg)) * 1.12) / 20) * 20;
    const escalaY = (valor) => margem.topo + (altura - margem.topo - margem.base) * (1 - valor / maxPeso);
    const passo = (largura - margem.esquerda - margem.direita) / dados.length;
    const larguraBarra = Math.min(56, passo * 0.5);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${largura} ${altura}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Gráfico de evolução do peso, da massa de gordura e da massa livre de gordura");
    const adicionar = (tag, atributos, texto) => {
        const elemento = document.createElementNS(ns, tag);
        Object.entries(atributos).forEach(([chave, valor]) => elemento.setAttribute(chave, valor));
        if (texto !== undefined) elemento.textContent = texto;
        svg.append(elemento);
        return elemento;
    };
    for (let i = 0; i <= 4; i += 1) {
        const valor = (maxPeso / 4) * i;
        const y = escalaY(valor);
        adicionar("line", { x1: margem.esquerda, x2: largura - margem.direita, y1: y, y2: y, stroke: "#E0E0E0", "stroke-width": 1 });
        adicionar("text", { x: margem.esquerda - 8, y: y + 4, fill: "#828282", "font-size": 11, "font-family": "Work Sans, Arial, sans-serif", "text-anchor": "end" }, formatarNumero(valor, 0));
    }
    const pontos = [];
    dados.forEach((avaliacao, indice) => {
        const centro = margem.esquerda + passo * indice + passo / 2;
        const x = centro - larguraBarra / 2;
        const gordura = avaliacao.resultados.massa_gordura_kg;
        const magra = avaliacao.resultados.massa_livre_gordura_kg;
        if (gordura !== null && magra !== null) {
            adicionar("rect", { x, width: larguraBarra, y: escalaY(gordura), height: escalaY(0) - escalaY(gordura), fill: "#e9d8a6", rx: 4 });
            adicionar("rect", { x, width: larguraBarra, y: escalaY(gordura + magra), height: escalaY(gordura) - escalaY(gordura + magra), fill: "#336633", rx: 4 });
        } else {
            adicionar("rect", { x, width: larguraBarra, y: escalaY(avaliacao.peso_kg), height: escalaY(0) - escalaY(avaliacao.peso_kg), fill: "#d1dcd3", rx: 4 });
        }
        adicionar("text", { x: centro, y: altura - 12, fill: "#828282", "font-size": 11, "font-family": "Work Sans, Arial, sans-serif", "text-anchor": "middle" }, formatarDataCurta(avaliacao.data_avaliacao));
        pontos.push([centro, escalaY(avaliacao.peso_kg), avaliacao.peso_kg]);
    });
    if (pontos.length > 1) {
        adicionar("polyline", { points: pontos.map(([x, y]) => `${x},${y}`).join(" "), fill: "none", stroke: "#0D5017", "stroke-width": 2.5 });
    }
    pontos.forEach(([x, y, peso]) => {
        adicionar("circle", { cx: x, cy: y, r: 5, fill: "#FFFFFF", stroke: "#0D5017", "stroke-width": 2.5 });
        adicionar("text", { x, y: y - 10, fill: "#0D5017", "font-size": 11, "font-weight": 600, "font-family": "Work Sans, Arial, sans-serif", "text-anchor": "middle" }, `${formatarNumero(peso, 1)} kg`);
    });
    container.replaceChildren(svg);
}

function montarResumoMedidas(container, avaliacao) {
    const r = avaliacao.resultados;
    const cartoes = [
        ["Peso", `${formatarNumero(avaliacao.peso_kg)} kg`, `Altura ${formatarNumero(avaliacao.altura_cm, 0)} cm`],
        ["IMC", formatarNumero(r.imc), r.classificacao_imc],
        ["Gordura corporal", r.percentual_gordura !== null ? `${formatarNumero(r.percentual_gordura)}%` : "–", detalheGordura(r)],
        ["Massa de gordura", r.massa_gordura_kg !== null ? `${formatarNumero(r.massa_gordura_kg)} kg` : "–", "Peso × % de gordura"],
        ["Massa livre de gordura", r.massa_livre_gordura_kg !== null ? `${formatarNumero(r.massa_livre_gordura_kg)} kg` : "–", "Músculos, ossos, órgãos e água"],
        ["Relação cintura/quadril", r.rcq !== null ? formatarNumero(r.rcq, 2) : "–", r.risco_rcq ? `Risco ${r.risco_rcq.toLowerCase()}` : "Informe cintura e quadril"],
        ["CMB", r.cmb_cm !== null ? `${formatarNumero(r.cmb_cm)} cm` : "–", r.classificacao_cmb || "Informe braço e dobra tricipital"],
        ["Taxa metabólica basal", r.tmb_kcal !== null ? `${formatarNumero(r.tmb_kcal, 0)} kcal` : "–", "Mifflin-St Jeor"],
        ["Gasto energético total", r.get_kcal != null ? `${formatarNumero(r.get_kcal, 0)} kcal` : "–", detalheGasto(r, avaliacao)],
    ];
    container.replaceChildren(...cartoes.map(([rotulo, valor, detalhe]) => {
        const cartao = createElement("article", "measure-card");
        cartao.append(
            createElement("span", "measure-card__label", rotulo),
            createElement("strong", "measure-card__value", valor),
            createElement("span", "measure-card__detail", detalhe),
        );
        return cartao;
    }));
}

function montarMedidasPdf({ avaliacao, historico, nomePaciente, imagemBoneco }) {
    const pagina = createElement("div", "pdf-plano pdf-medidas");
    const logo = document.querySelector(".brand-logo")?.src
        || new URL("../assets/images/NutriLife-logo-semfundo.png", window.location.href).href;
    const r = avaliacao.resultados;

    const cabecalho = createElement("header", "pdf-header");
    const imagem = document.createElement("img");
    imagem.src = logo;
    imagem.alt = "NutriLife";
    imagem.className = "pdf-logo";
    const titulo = createElement("div", "pdf-header__title");
    titulo.append(createElement("span", "pdf-eyebrow", "Avaliação antropométrica"), createElement("h1", "", nomePaciente));
    cabecalho.append(
        imagem,
        titulo,
        createElement("span", "pdf-header__date", `Emitido em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date())}`),
    );

    const cards = createElement("section", "pdf-cards");
    [
        ["Avaliação de", formatarDataCurta(avaliacao.data_avaliacao), `${avaliacao.idade_anos} anos · ${avaliacao.sexo_biologico}`],
        ["Nutricionista", avaliacao.nutricionista_nome || "Não informado", ""],
        ["Peso e altura", `${formatarNumero(avaliacao.peso_kg)} kg`, `${formatarNumero(avaliacao.altura_cm, 0)} cm`],
        ["IMC", formatarNumero(r.imc), r.classificacao_imc],
    ].forEach(([rotulo, valor, detalhe]) => {
        const card = createElement("div", "pdf-card");
        card.append(createElement("span", "pdf-card__label", rotulo), createElement("strong", "", valor));
        if (detalhe) card.append(createElement("span", "pdf-card__detail", detalhe));
        cards.append(card);
    });

    const corpo = createElement("section", "pdf-medidas__corpo");
    if (imagemBoneco) {
        const figura = createElement("div", "pdf-medidas__figura");
        const img = document.createElement("img");
        img.src = imagemBoneco;
        img.alt = "Corpo em 3D";
        figura.append(img);
        corpo.append(figura);
    }
    const principais = createElement("div", "pdf-medidas__resultados");
    [
        ["Percentual de gordura", r.percentual_gordura !== null ? `${formatarNumero(r.percentual_gordura)}%` : "–", detalheGordura(r)],
        ["Massa de gordura", r.massa_gordura_kg !== null ? `${formatarNumero(r.massa_gordura_kg)} kg` : "–", ""],
        ["Massa livre de gordura", r.massa_livre_gordura_kg !== null ? `${formatarNumero(r.massa_livre_gordura_kg)} kg` : "–", ""],
        ["Massa residual", `${formatarNumero(r.massa_residual_kg)} kg`, ""],
        ["Relação cintura/quadril", r.rcq !== null ? formatarNumero(r.rcq, 2) : "–", r.risco_rcq ? `Risco ${r.risco_rcq.toLowerCase()}` : ""],
        ["Relação cintura/estatura", r.rce !== null ? formatarNumero(r.rce, 2) : "–", r.risco_rce ? `Risco ${r.risco_rce.toLowerCase()}` : ""],
        ["CMB", r.cmb_cm !== null ? `${formatarNumero(r.cmb_cm)} cm` : "–", r.classificacao_cmb],
        ["Taxa metabólica basal", r.tmb_kcal !== null ? `${formatarNumero(r.tmb_kcal, 0)} kcal` : "–", ""],
        ["Gasto energético total", r.get_kcal != null ? `${formatarNumero(r.get_kcal, 0)} kcal` : "–", r.get_kcal != null ? detalheGasto(r, avaliacao) : ""],
    ].forEach(([rotulo, valor, detalhe]) => {
        const linha = createElement("div", "pdf-medidas__linha");
        linha.append(createElement("span", "", rotulo), createElement("strong", "", valor));
        if (detalhe) linha.append(createElement("small", "", detalhe));
        principais.append(linha);
    });
    corpo.append(principais);

    const grafico = createElement("section", "pdf-medidas__bloco");
    grafico.append(createElement("h2", "", "Evolução da composição corporal"));
    const areaGrafico = createElement("div", "pdf-medidas__grafico");
    montarGraficoEvolucao(areaGrafico, historico);
    const legenda = createElement("p", "pdf-medidas__legenda", "Verde: massa livre de gordura · Bege: massa de gordura · Linha: peso total");
    grafico.append(areaGrafico, legenda);

    const tabelaParametros = createElement("table", "pdf-tabela pdf-tabela--historico");
    montarTabelaHistorico(tabelaParametros, historico.slice(-4), PARAMETROS_CALCULADOS);
    const blocoParametros = createElement("section", "pdf-medidas__bloco");
    blocoParametros.append(createElement("h2", "", "Parâmetros calculados"), tabelaParametros);

    const tabelaMedidas = createElement("table", "pdf-tabela pdf-tabela--historico");
    montarTabelaHistorico(tabelaMedidas, historico.slice(-4), [
        ...DOBRAS_CUTANEAS.map(([chave, rotulo]) => [`Dobra ${rotulo.toLowerCase()} (mm)`, (m) => m.dobras[chave] ?? null, 1]),
        ...CIRCUNFERENCIAS.map(([chave, rotulo]) => [`Circunferência ${rotulo.toLowerCase()} (cm)`, (m) => m.circunferencias[chave] ?? null, 1]),
    ]);
    const blocoMedidas = createElement("section", "pdf-medidas__bloco");
    blocoMedidas.append(createElement("h2", "", "Medidas antropométricas"), tabelaMedidas);

    const metodo = createElement(
        "p",
        "pdf-medidas__metodo",
        `${r.metodo_gordura ? `% de gordura: ${r.metodo_gordura}. ` : ""}IMC: OMS/Lipschitz · RCQ: Heyward & Stolarczyk · CMB: Jelliffe e Blackburn · Massa residual: Würch · % de gordura: Lohman.`,
    );
    pagina.append(cabecalho, cards, corpo, grafico, blocoParametros, blocoMedidas, metodo);
    if (avaliacao.observacoes) {
        const observacoes = createElement("section", "pdf-orientacoes");
        observacoes.append(createElement("h2", "", "Observações"), createElement("p", "", avaliacao.observacoes));
        pagina.insertBefore(observacoes, grafico);
    }
    return pagina;
}

async function recortarFigura(imagem) {
    const fonte = new Image();
    fonte.src = imagem;
    await fonte.decode();
    const canvas = document.createElement("canvas");
    canvas.width = fonte.naturalWidth;
    canvas.height = fonte.naturalHeight;
    const contexto = canvas.getContext("2d");
    contexto.drawImage(fonte, 0, 0);
    const { data, width, height } = contexto.getImageData(0, 0, canvas.width, canvas.height);
    const fundo = [data[0], data[1], data[2], data[3]];
    let topo = height;
    let base = -1;
    let esquerda = width;
    let direita = -1;
    for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
            const i = (y * width + x) * 4;
            const diferenca = Math.abs(data[i] - fundo[0]) + Math.abs(data[i + 1] - fundo[1])
                + Math.abs(data[i + 2] - fundo[2]) + Math.abs(data[i + 3] - fundo[3]);
            if (diferenca > 24) {
                if (y < topo) topo = y;
                if (y > base) base = y;
                if (x < esquerda) esquerda = x;
                if (x > direita) direita = x;
            }
        }
    }
    if (base < 0) return imagem;
    const margem = Math.round((base - topo) * 0.04);
    topo = Math.max(0, topo - margem);
    base = Math.min(height - 1, base + margem);
    esquerda = Math.max(0, esquerda - margem);
    direita = Math.min(width - 1, direita + margem);
    const recorte = document.createElement("canvas");
    recorte.width = direita - esquerda + 1;
    recorte.height = base - topo + 1;
    recorte.getContext("2d").drawImage(canvas, esquerda, topo, recorte.width, recorte.height, 0, 0, recorte.width, recorte.height);
    return recorte.toDataURL("image/png");
}

async function baixarMedidasPdf(dados) {
    const html2pdf = await carregarGeradorPdf();
    if (dados.imagemBoneco) {
        dados = { ...dados, imagemBoneco: await recortarFigura(dados.imagemBoneco).catch(() => dados.imagemBoneco) };
    }
    const pagina = montarMedidasPdf(dados);
    const textoFinal = `Avaliação registrada por ${dados.avaliacao.nutricionista_nome || "nutricionista"} · NutriLife — cuidado nutricional de forma simples, organizada e próxima.`;
    const area = createElement("div", "pdf-area");
    area.append(pagina);
    document.body.append(area);
    try {
        await Promise.all([...pagina.querySelectorAll("img")].map((img) => img.decode().catch(() => {})));
        const nome = (dados.nomePaciente || "paciente")
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        await html2pdf()
            .set({
                margin: [10, 0, 14, 0],
                filename: `avaliacao-antropometrica-${nome}-${dados.avaliacao.data_avaliacao}.pdf`,
                image: { type: "jpeg", quality: 0.96 },
                html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
                jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
                pagebreak: { mode: ["css", "legacy"], avoid: [".pdf-header", ".pdf-cards", ".pdf-medidas__corpo", ".pdf-medidas__bloco", ".pdf-orientacoes", "tr"] },
            })
            .from(pagina)
            .toPdf()
            .get("pdf")
            .then((pdf) => {
                const total = pdf.internal.getNumberOfPages();
                pdf.setPage(1);
                pdf.setFillColor(236, 241, 236);
                pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), 10.2, "F");
                for (let numero = 1; numero <= total; numero += 1) {
                    pdf.setPage(numero);
                    pdf.setTextColor(51, 102, 51);
                    if (numero === total) {
                        pdf.setFontSize(7.5);
                        pdf.text(textoFinal, pdf.internal.pageSize.getWidth() / 2, pdf.internal.pageSize.getHeight() - 10, { align: "center" });
                    }
                    pdf.setFontSize(8);
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

function aguardarBoneco() {
    if (window.NutriBoneco) return Promise.resolve(window.NutriBoneco);
    return new Promise((resolve, reject) => {
        const limite = window.setTimeout(() => reject(new Error("Não foi possível carregar o modelo 3D.")), 15000);
        window.addEventListener("nutri-boneco-pronto", () => {
            window.clearTimeout(limite);
            resolve(window.NutriBoneco);
        }, { once: true });
    });
}

function montarFormularioMedidas(form, aoSalvar, aoExcluir) {
    form.replaceChildren();
    const campoNumero = (nome, rotulo, opcoes = {}) => {
        const input = document.createElement("input");
        input.type = "number";
        input.name = nome;
        input.step = opcoes.passo || "0.1";
        input.min = opcoes.min ?? "0";
        if (opcoes.max) input.max = opcoes.max;
        if (opcoes.obrigatorio) input.required = true;
        input.inputMode = "decimal";
        return inputGroup(rotulo, input);
    };

    const basicos = createElement("fieldset", "measure-form__group");
    basicos.append(createElement("legend", "", "Dados da avaliação"));
    const data = document.createElement("input");
    data.type = "date";
    data.name = "data_avaliacao";
    data.required = true;
    data.max = new Date().toISOString().slice(0, 10);
    const sexo = document.createElement("select");
    sexo.name = "sexo_biologico";
    sexo.required = true;
    sexo.add(new Option("Selecione", ""));
    sexo.add(new Option("Feminino", "feminino"));
    sexo.add(new Option("Masculino", "masculino"));
    const atividade = document.createElement("select");
    atividade.name = "nivel_atividade";
    atividade.add(new Option("Não informado", ""));
    Object.entries(NIVEIS_ATIVIDADE).forEach(([valor, nivel]) => atividade.add(new Option(`${nivel.nome} (${nivel.descricao})`, valor)));
    const grade = createElement("div", "measure-form__grid");
    grade.append(
        inputGroup("Data da avaliação", data),
        inputGroup("Sexo biológico", sexo),
        campoNumero("idade_anos", "Idade (anos)", { passo: "1", min: "2", max: "120", obrigatorio: true }),
        campoNumero("peso_kg", "Peso (kg)", { min: "1", max: "500", obrigatorio: true }),
        campoNumero("altura_cm", "Altura (cm)", { min: "50", max: "260", obrigatorio: true }),
        inputGroup("Nível de atividade física (para o GET)", atividade),
    );
    basicos.append(grade);

    const dobras = createElement("fieldset", "measure-form__group");
    const protocolos = createElement("div", "measure-protocols");
    protocolos.setAttribute("role", "radiogroup");
    protocolos.setAttribute("aria-label", "Protocolo do % de gordura");
    [
        ["pollock7", "Jackson & Pollock 7 dobras", "Torácica, axilar média, tricipital, subescapular, abdominal, suprailíaca e coxa."],
        ["pollock3", "Jackson & Pollock 3 dobras", "Mulheres: tricipital, suprailíaca e coxa. Homens: torácica, abdominal e coxa."],
    ].forEach(([valor, titulo, descricao]) => {
        const opcao = createElement("label", "measure-protocol");
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "protocolo_gordura";
        radio.value = valor;
        radio.checked = valor === "pollock7";
        const texto = createElement("span", "");
        texto.append(createElement("strong", "", titulo), createElement("small", "", descricao));
        opcao.append(radio, texto);
        protocolos.append(opcao);
    });
    const dicaProtocolo = createElement("p", "item-meta measure-protocol__hint");
    dobras.append(
        createElement("legend", "", "Dobras cutâneas (mm)"),
        protocolos,
        dicaProtocolo,
    );
    const gradeDobras = createElement("div", "measure-form__grid");
    DOBRAS_CUTANEAS.forEach(([chave, rotulo]) => gradeDobras.append(campoNumero(`dobra.${chave}`, rotulo, { max: "100" })));
    dobras.append(gradeDobras);
    const destacarDobras = () => {
        const protocolo = form.querySelector('[name="protocolo_gordura"]:checked')?.value || "pollock7";
        const usadas = PROTOCOLOS_GORDURA[protocolo].dobras(sexo.value);
        DOBRAS_CUTANEAS.forEach(([chave]) => {
            form.elements[`dobra.${chave}`].closest(".input-group").classList.toggle("measure-field--protocol", usadas.includes(chave));
        });
        const nomes = usadas.map((chave) => DOBRAS_CUTANEAS.find(([item]) => item === chave)[1].toLowerCase());
        dicaProtocolo.textContent = protocolo === "pollock3" && !sexo.value
            ? "Selecione o sexo biológico para ver quais 3 dobras são usadas."
            : `Dobras usadas no cálculo (destacadas): ${nomes.join(", ")}. As demais ficam registradas, mas não entram no % de gordura.`;
    };
    protocolos.addEventListener("change", destacarDobras);
    sexo.addEventListener("change", destacarDobras);

    const circunferencias = createElement("fieldset", "measure-form__group");
    circunferencias.append(
        createElement("legend", "", "Circunferências (cm)"),
        createElement("p", "item-meta", "Quanto mais medidas você informar, mais fiel fica o seu corpo em 3D."),
    );
    const gradeCirc = createElement("div", "measure-form__grid");
    CIRCUNFERENCIAS.forEach(([chave, rotulo]) => gradeCirc.append(campoNumero(`circ.${chave}`, rotulo, { max: "250" })));
    circunferencias.append(gradeCirc);

    const observacoes = document.createElement("textarea");
    observacoes.name = "observacoes";
    observacoes.maxLength = 1000;
    observacoes.rows = 2;
    observacoes.placeholder = "Ex.: medidas coletadas pela nutricionista Amanda";

    const acoes = createElement("div", "measure-form__actions");
    const salvar = createElement("button", "btn btn--primary", "Salvar avaliação");
    salvar.type = "submit";
    const excluir = createElement("button", "btn meal-editor__remove", "Excluir avaliação");
    excluir.type = "button";
    excluir.hidden = true;
    excluir.addEventListener("click", aoExcluir);
    acoes.append(salvar, excluir);

    form.append(basicos, dobras, circunferencias, inputGroup("Observações", observacoes), acoes);

    form.onsubmit = async (event) => {
        event.preventDefault();
        const valores = new FormData(form);
        const numero = (nome) => {
            const valor = valores.get(nome);
            return valor === null || valor === "" ? null : Number(valor);
        };
        const dados = {
            data_avaliacao: valores.get("data_avaliacao"),
            sexo_biologico: valores.get("sexo_biologico"),
            idade_anos: numero("idade_anos"),
            peso_kg: numero("peso_kg"),
            altura_cm: numero("altura_cm"),
            dobras: Object.fromEntries(DOBRAS_CUTANEAS.map(([chave]) => [chave, numero(`dobra.${chave}`)])),
            circunferencias: Object.fromEntries(CIRCUNFERENCIAS.map(([chave]) => [chave, numero(`circ.${chave}`)])),
            protocolo_gordura: valores.get("protocolo_gordura") || "pollock7",
            nivel_atividade: valores.get("nivel_atividade") || null,
            observacoes: valores.get("observacoes") || "",
        };
        salvar.disabled = true;
        try {
            await aoSalvar(dados);
        } catch (error) {
            showDashboardError(error.status === 422
                ? "Confira os valores informados: algum campo está fora do intervalo permitido."
                : error.message);
        } finally {
            salvar.disabled = false;
        }
    };

    return {
        preencher(avaliacao, editando) {
            form.reset();
            excluir.hidden = !editando;
            const protocolo = avaliacao?.protocolo_gordura || avaliacao?.resultados?.protocolo_gordura || "pollock7";
            form.querySelector(`[name="protocolo_gordura"][value="${protocolo}"]`).checked = true;
            if (!avaliacao) {
                data.value = new Date().toISOString().slice(0, 10);
                destacarDobras();
                return;
            }
            data.value = editando ? avaliacao.data_avaliacao : new Date().toISOString().slice(0, 10);
            sexo.value = avaliacao.sexo_biologico;
            destacarDobras();
            form.elements.idade_anos.value = avaliacao.idade_anos;
            form.elements.altura_cm.value = avaliacao.altura_cm;
            atividade.value = avaliacao.nivel_atividade || "";
            if (!editando) return;
            form.elements.peso_kg.value = avaliacao.peso_kg;
            DOBRAS_CUTANEAS.forEach(([chave]) => {
                form.elements[`dobra.${chave}`].value = avaliacao.dobras[chave] ?? "";
            });
            CIRCUNFERENCIAS.forEach(([chave]) => {
                form.elements[`circ.${chave}`].value = avaliacao.circunferencias[chave] ?? "";
            });
            form.elements.observacoes.value = avaliacao.observacoes || "";
        },
    };
}

const RESTRICOES_ANAMNESE = {
    vegetariano: "Vegetariano",
    vegano: "Vegano",
    sem_lactose: "Sem lactose",
    sem_gluten: "Sem glúten",
    low_carb: "Low carb",
};

const SECOES_ANAMNESE = [
    ["Objetivo", [
        ["objetivo", "Qual é o seu principal objetivo?", "area"],
        ["motivo_consulta", "O que motivou a procura por um nutricionista?", "area"],
    ]],
    ["Saúde", [
        ["doencas", "Doenças ou condições de saúde (diabetes, hipertensão, tireoide...)", "area"],
        ["medicamentos", "Medicamentos em uso", "area"],
        ["suplementos", "Suplementos em uso", "area"],
        ["alergias_intolerancias", "Alergias ou intolerâncias alimentares", "area"],
        ["cirurgias", "Cirurgias já realizadas", "area"],
        ["historico_familiar", "Histórico familiar (diabetes, doenças do coração, obesidade...)", "area"],
        ["exames_recentes", "Exames recentes e resultados importantes", "area"],
        ["saude_feminina", "Saúde da mulher: ciclo menstrual, gestação, menopausa (se aplicável)", "area"],
    ]],
    ["Rotina e estilo de vida", [
        ["profissao", "Profissão", "texto"],
        ["horario_acorda", "Horário que acorda", "hora"],
        ["horario_dorme", "Horário que dorme", "hora"],
        ["qualidade_sono", "Qualidade do sono", { boa: "Boa", regular: "Regular", ruim: "Ruim" }],
        ["nivel_estresse", "Nível de estresse", { baixo: "Baixo", moderado: "Moderado", alto: "Alto" }],
        ["tabagismo", "Fuma?", { nao: "Não", ex_fumante: "Ex-fumante", sim: "Sim" }],
        ["consumo_alcool", "Bebida alcoólica", { nao: "Não bebe", ocasional: "Ocasionalmente", frequente: "Com frequência" }],
        ["atividade_fisica", "Atividade física (qual, quantas vezes por semana e por quanto tempo)", "area"],
    ]],
    ["Hábitos alimentares", [
        ["refeicoes_por_dia", "Refeições por dia", "inteiro"],
        ["consumo_agua_litros", "Água por dia (litros)", "decimal"],
        ["funcionamento_intestinal", "Funcionamento do intestino", { regular: "Regular", preso: "Preso", solto: "Solto", alternado: "Alterna" }],
        ["apetite", "Apetite", { pouco: "Pouco", normal: "Normal", aumentado: "Aumentado" }],
        ["quem_prepara", "Quem prepara as suas refeições?", "texto"],
        ["come_fora", "Com que frequência come fora ou pede delivery?", "texto"],
        ["restricoes", "Restrições e estilos alimentares", "opcoes"],
        ["preferencias", "Alimentos de que mais gosta", "area"],
        ["aversoes", "Alimentos de que não gosta ou não come", "area"],
        ["recordatorio_24h", "Recordatório de 24 horas: descreva o que comeu ontem, do café da manhã à ceia, com horários e quantidades aproximadas", "longo"],
    ]],
];

function campoAnamnese(nome, rotulo, tipo) {
    if (tipo === "opcoes") {
        const grupo = createElement("fieldset", "anamnesis-options anamnesis-field--wide");
        grupo.append(createElement("legend", "", rotulo));
        Object.entries(RESTRICOES_ANAMNESE).forEach(([valor, texto]) => {
            const opcao = createElement("label", "anamnesis-option");
            const caixa = document.createElement("input");
            caixa.type = "checkbox";
            caixa.name = nome;
            caixa.value = valor;
            opcao.append(caixa, createElement("span", "", texto));
            grupo.append(opcao);
        });
        return grupo;
    }
    let campo;
    if (typeof tipo === "object") {
        campo = document.createElement("select");
        campo.add(new Option("Não informado", ""));
        Object.entries(tipo).forEach(([valor, texto]) => campo.add(new Option(texto, valor)));
    } else if (["area", "longo"].includes(tipo)) {
        campo = document.createElement("textarea");
        campo.rows = tipo === "longo" ? 6 : 2;
        campo.maxLength = tipo === "longo" ? 3000 : 1000;
    } else {
        campo = document.createElement("input");
        campo.type = { hora: "time", inteiro: "number", decimal: "number" }[tipo] || "text";
        if (tipo === "texto") campo.maxLength = nome === "profissao" ? 120 : 1000;
        if (tipo === "inteiro") Object.assign(campo, { min: "1", max: "12", step: "1", inputMode: "numeric" });
        if (tipo === "decimal") Object.assign(campo, { min: "0", max: "10", step: "0.1", inputMode: "decimal" });
    }
    campo.name = nome;
    const grupo = inputGroup(rotulo, campo);
    if (["area", "longo"].includes(tipo)) grupo.classList.add("anamnesis-field--wide");
    return grupo;
}

async function loadAnamnesisPage(user) {
    const pacienteId = new URLSearchParams(window.location.search).get("paciente");
    const ehNutricionista = user.perfil === "nutricionista";
    if (ehNutricionista && !pacienteId) {
        window.location.replace("./pacientes.html");
        return;
    }
    if (!ehNutricionista && user.perfil !== "paciente") {
        window.location.replace("../dashboard.html");
        return;
    }

    if (ehNutricionista) {
        const pacientes = await api.listarPacientes().catch(() => []);
        const nomePaciente = pacientes.find((paciente) => paciente.id === pacienteId)?.nome || "Paciente";
        document.getElementById("anamnesis-title").textContent = `Anamnese de ${nomePaciente}`;
        document.title = `Anamnese de ${nomePaciente} | NutriLife`;
        document.getElementById("anamnesis-subtitle").textContent = "Revise e complete as respostas do paciente. As observações clínicas ficam visíveis apenas para nutricionistas.";
        document.getElementById("patients-nav")?.classList.add("is-active");
    }

    const form = document.getElementById("anamnesis-form");
    const secoes = ehNutricionista
        ? [...SECOES_ANAMNESE, ["Observações clínicas (só nutricionistas veem)", [["observacoes_nutricionista", "Impressões, hipóteses e condutas", "longo"]]]]
        : SECOES_ANAMNESE;
    const campos = secoes.flatMap(([, itens]) => itens);
    form.replaceChildren(...secoes.map(([titulo, itens]) => {
        const grupo = createElement("fieldset", "measure-form__group");
        const grade = createElement("div", "measure-form__grid anamnesis-grid");
        itens.forEach(([nome, rotulo, tipo]) => grade.append(campoAnamnese(nome, rotulo, tipo)));
        grupo.append(createElement("legend", "", titulo), grade);
        return grupo;
    }));
    const acoes = createElement("div", "measure-form__actions anamnesis-actions");
    const salvar = createElement("button", "btn btn--primary", "Salvar anamnese");
    salvar.type = "submit";
    acoes.append(salvar);
    form.append(acoes);

    const respondido = (valor) => (Array.isArray(valor) ? valor.length > 0 : valor !== null && valor !== undefined && valor !== "");
    const mostrarSituacao = (anamnese) => {
        const respostas = campos.filter(([nome]) => respondido(anamnese[nome])).length;
        document.getElementById("anamnesis-progress").textContent = `${respostas} de ${campos.length} perguntas respondidas`;
        document.getElementById("anamnesis-progress-bar").style.width = `${Math.round((respostas / campos.length) * 100)}%`;
        const quem = anamnese.atualizada_por_perfil === "nutricionista" ? `por ${anamnese.atualizada_por_nome || "nutricionista"} (nutricionista)` : ehNutricionista ? "pelo paciente" : "por você";
        document.getElementById("anamnesis-updated").textContent = anamnese.atualizada_em
            ? `Última atualização ${quem} em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(anamnese.atualizada_em))}.`
            : ehNutricionista ? "O paciente ainda não preencheu a anamnese." : "Você ainda não preencheu a sua anamnese.";
    };
    const preencher = (anamnese) => {
        campos.forEach(([nome, , tipo]) => {
            if (tipo === "opcoes") {
                form.querySelectorAll(`[name="${nome}"]`).forEach((caixa) => { caixa.checked = (anamnese[nome] || []).includes(caixa.value); });
            } else {
                form.elements[nome].value = anamnese[nome] ?? "";
            }
        });
        mostrarSituacao(anamnese);
    };
    const ler = () => Object.fromEntries(campos.map(([nome, , tipo]) => {
        if (tipo === "opcoes") return [nome, [...form.querySelectorAll(`[name="${nome}"]:checked`)].map((caixa) => caixa.value)];
        const valor = form.elements[nome].value.trim();
        if (["inteiro", "decimal"].includes(tipo)) return [nome, valor === "" ? null : Number(valor)];
        if (tipo === "hora" || typeof tipo === "object") return [nome, valor || null];
        return [nome, valor];
    }));

    preencher(ehNutricionista ? await api.anamneseDoPaciente(pacienteId) : await api.minhaAnamnese());

    form.onsubmit = async (event) => {
        event.preventDefault();
        salvar.disabled = true;
        salvar.textContent = "Salvando...";
        try {
            const anamnese = ehNutricionista
                ? await api.salvarAnamneseDoPaciente(pacienteId, ler())
                : await api.salvarMinhaAnamnese(ler());
            preencher(anamnese);
            showDashboardSuccess("Anamnese salva.");
        } catch (error) {
            showDashboardError(error.status === 422 ? "Confira os valores informados: algum campo está fora do intervalo permitido." : error.message);
        } finally {
            salvar.disabled = false;
            salvar.textContent = "Salvar anamnese";
        }
    };
}

async function loadMeasuresPage(user) {
    const pacienteId = new URLSearchParams(window.location.search).get("paciente");
    const ehNutricionista = user.perfil === "nutricionista";
    if (ehNutricionista && !pacienteId) {
        window.location.replace("./pacientes.html");
        return;
    }
    if (!ehNutricionista && user.perfil !== "paciente") {
        window.location.replace("../dashboard.html");
        return;
    }
    let nomePaciente = user.nome;

    const conteudo = document.getElementById("measures-content");
    const vazio = document.getElementById("measures-empty");
    const painelFormulario = document.getElementById("measure-form-panel");
    const botaoNova = document.getElementById("new-measure");
    const botaoEditar = document.getElementById("edit-measure");
    const seletor = document.getElementById("measure-date");
    let avaliacoes = [];
    let selecionada = null;
    let editandoId = null;
    let visualizador = null;

    const botaoPdf = document.getElementById("download-measure");
    if (ehNutricionista) {
        const pacientes = await api.listarPacientes().catch(() => []);
        nomePaciente = pacientes.find((paciente) => paciente.id === pacienteId)?.nome || "Paciente";
        document.getElementById("measures-title").textContent = `Medidas de ${nomePaciente}`;
        document.title = `Medidas de ${nomePaciente} | NutriLife`;
        document.getElementById("measures-subtitle").textContent = "Registre as avaliações antropométricas deste paciente. Ele verá o corpo em 3D e poderá baixar a avaliação em PDF.";
        document.getElementById("measures-empty-text").textContent = "Este paciente ainda não tem avaliações. Clique em Nova avaliação para registrar a primeira.";
        const pacientesNav = document.getElementById("patients-nav");
        if (pacientesNav) pacientesNav.classList.add("is-active");
        botaoNova.hidden = false;
    }

    const formulario = montarFormularioMedidas(
        document.getElementById("measure-form"),
        async (dados) => {
            if (editandoId) {
                await api.atualizarMedida(editandoId, dados);
                showDashboardSuccess("Avaliação atualizada.");
            } else {
                await api.criarMedida(pacienteId, dados);
                showDashboardSuccess("Avaliação registrada. O paciente já pode ver no perfil dele.");
            }
            fecharFormulario();
            await carregar(dados.data_avaliacao);
        },
        async () => {
            if (!editandoId || !window.confirm("Excluir esta avaliação? Essa ação não pode ser desfeita.")) return;
            try {
                await api.excluirMedida(editandoId);
                showDashboardSuccess("Avaliação excluída.");
                fecharFormulario();
                await carregar();
            } catch (error) {
                showDashboardError(error.message);
            }
        },
    );

    function abrirFormulario(avaliacao, editando) {
        editandoId = editando ? avaliacao.id : null;
        document.getElementById("measure-form-title").textContent = editando
            ? `Editar avaliação de ${formatarDataCurta(avaliacao.data_avaliacao)}`
            : "Nova avaliação";
        formulario.preencher(avaliacao, editando);
        painelFormulario.hidden = false;
        painelFormulario.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function fecharFormulario() {
        painelFormulario.hidden = true;
        editandoId = null;
    }

    async function mostrar(avaliacao) {
        selecionada = avaliacao;
        document.getElementById("figure-title").textContent = `Avaliação de ${formatarDataCurta(avaliacao.data_avaliacao)}`;
        document.getElementById("figure-author").textContent = avaliacao.nutricionista_nome
            ? `Registrada por ${avaliacao.nutricionista_nome}`
            : "";
        botaoEditar.hidden = !(ehNutricionista && avaliacao.nutricionista_id === user.id);
        montarResumoMedidas(document.getElementById("measures-summary"), avaliacao);
        try {
            const boneco = await aguardarBoneco();
            if (!visualizador) visualizador = boneco.criarVisualizador(document.getElementById("body-viewer"));
            visualizador.atualizar(avaliacao);
        } catch (error) {
            document.getElementById("body-viewer").textContent = error.message;
        }
    }

    async function carregar(dataPreferida) {
        avaliacoes = ehNutricionista ? await api.medidasDoPaciente(pacienteId) : await api.minhasMedidas();
        vazio.hidden = avaliacoes.length > 0;
        conteudo.hidden = avaliacoes.length === 0;
        botaoPdf.hidden = avaliacoes.length === 0;
        if (!avaliacoes.length) return;

        seletor.replaceChildren(...[...avaliacoes].reverse().map((avaliacao) =>
            new Option(formatarDataCurta(avaliacao.data_avaliacao), avaliacao.id)));
        const escolhida = avaliacoes.findLast((a) => a.data_avaliacao === dataPreferida) || avaliacoes[avaliacoes.length - 1];
        seletor.value = escolhida.id;

        desenharGrafico();
        montarTabelaHistorico(document.getElementById("results-table"), avaliacoes, PARAMETROS_CALCULADOS);
        montarTabelaHistorico(
            document.getElementById("raw-table"),
            avaliacoes,
            [
                ...DOBRAS_CUTANEAS.map(([chave, rotulo]) => [`Dobra ${rotulo.toLowerCase()} (mm)`, (m) => m.dobras[chave] ?? null, 1]),
                ...CIRCUNFERENCIAS.map(([chave, rotulo]) => [`Circunferência ${rotulo.toLowerCase()} (cm)`, (m) => m.circunferencias[chave] ?? null, 1]),
            ],
        );
        const metodos = [...new Set(avaliacoes.map((a) => a.resultados.metodo_gordura).filter(Boolean))];
        document.getElementById("method-note").textContent = [
            metodos.length ? `% de gordura: ${metodos.join("; ")}.` : "Informe as dobras cutâneas para calcular o % de gordura.",
            "IMC: OMS (adultos) e Lipschitz (60 anos ou mais). RCQ: Heyward & Stolarczyk. CMB: adequação pelo padrão de Jelliffe e classificação de Blackburn. Massa residual: Würch. % de gordura: Lohman.",
        ].join(" ");
        await mostrar(escolhida);
    }

    const seletorMetrica = document.getElementById("measures-chart-metric");
    seletorMetrica.replaceChildren(...METRICAS_GRAFICO.map(([chave, rotulo]) => new Option(rotulo, chave)));
    function desenharGrafico() {
        const metrica = METRICAS_GRAFICO.find(([chave]) => chave === seletorMetrica.value) || METRICAS_GRAFICO[0];
        const grafico = document.getElementById("measures-chart");
        const ehComposicao = metrica[0] === "composicao";
        document.getElementById("measures-chart-legend").hidden = !ehComposicao;
        if (ehComposicao) montarGraficoEvolucao(grafico, avaliacoes);
        else montarGraficoLinha(grafico, avaliacoes, metrica);
        document.getElementById("measures-chart-note").textContent = textoVariacaoMetrica(avaliacoes, ehComposicao ? METRICAS_GRAFICO[1] : metrica);
    }
    seletorMetrica.addEventListener("change", desenharGrafico);

    seletor.addEventListener("change", () => {
        const avaliacao = avaliacoes.find((a) => a.id === seletor.value);
        if (avaliacao) mostrar(avaliacao);
    });
    botaoNova.addEventListener("click", () => abrirFormulario(avaliacoes[avaliacoes.length - 1], false));
    botaoPdf.addEventListener("click", async () => {
        if (!selecionada) return;
        botaoPdf.disabled = true;
        botaoPdf.textContent = "Gerando PDF...";
        try {
            await baixarMedidasPdf({
                avaliacao: selecionada,
                historico: avaliacoes.filter((a) => a.data_avaliacao <= selecionada.data_avaliacao),
                nomePaciente,
                imagemBoneco: visualizador?.capturar?.() || null,
            });
            showDashboardSuccess("PDF da avaliação baixado.");
        } catch {
            showDashboardError("Não foi possível gerar o PDF. Verifique sua conexão e tente novamente.");
        } finally {
            botaoPdf.disabled = false;
            botaoPdf.textContent = "Baixar avaliação em PDF";
        }
    });
    botaoEditar.addEventListener("click", () => selecionada && abrirFormulario(selecionada, true));
    document.getElementById("measure-cancel").addEventListener("click", fecharFormulario);

    await carregar();
    if (ehNutricionista && !avaliacoes.length) abrirFormulario(null, false);
}

async function loadCurrentPage() {
    const user = await setCurrentUser();
    const page = document.body.dataset.page;
    if (page === "admin-users" || page === "admin-dashboard") {
        if (user.perfil !== "administrador") {
            window.location.replace("../dashboard.html");
            return;
        }
        return page === "admin-users" ? loadAdminUsersPage() : loadAdminDashboardPage();
    }
    if (page === "dashboard") return loadDashboard(user);
    if (page === "plans") return loadPlansPage(user);
    if (page === "patients") return loadPatientsPage(user);
    if (page === "search") return loadSearchPage(user);
    if (page === "patient-home") return loadPatientHomePage(user);
    if (page === "professional-profile") return loadProfessionalProfile(user);
    if (page === "measures") return loadMeasuresPage(user);
    if (page === "anamnesis") return loadAnamnesisPage(user);
    if (page === "recipes") return loadRecipesPage(user);
    if (page === "messages") return loadMessagesPage(user);
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

function configurarMenuMobile() {
    const cabecalho = document.querySelector(".dashboard-sidebar");
    const menu = cabecalho?.querySelector(".sidebar-nav");
    if (!menu) return;
    menu.id = menu.id || "sidebar-menu";
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "sidebar-toggle";
    botao.setAttribute("aria-controls", menu.id);
    botao.innerHTML = "<span></span>";
    cabecalho.append(botao);
    const alternar = (aberto) => {
        cabecalho.classList.toggle("is-menu-open", aberto);
        botao.setAttribute("aria-expanded", String(aberto));
        botao.setAttribute("aria-label", aberto ? "Fechar menu" : "Abrir menu");
    };
    alternar(false);
    botao.addEventListener("click", () => alternar(!cabecalho.classList.contains("is-menu-open")));
    menu.addEventListener("click", (event) => {
        if (event.target.closest("a")) alternar(false);
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && cabecalho.classList.contains("is-menu-open")) {
            alternar(false);
            botao.focus();
        }
    });
    window.matchMedia("(min-width: 1141px)").addEventListener("change", (event) => {
        if (event.matches) alternar(false);
    });
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

    configurarMenuMobile();
    const usuarioSalvo = JSON.parse(sessionStorage.getItem(USER_KEY) || "null");
    if (usuarioSalvo) aplicarMenuPorPerfil(usuarioSalvo.perfil);
    if (usuarioSalvo && api.possuiToken()) iniciarAvisoMensagens(usuarioSalvo.perfil);

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

document.addEventListener("DOMContentLoaded", async () => {
    await window.componentesCarregados;
    configurarCardsRecolhiveis();
    if (["auth", "password-reset"].includes(document.body.dataset.page)) adicionarOlhoSenha();
    if (document.body.dataset.page === "auth") initAuthPage();
    if (document.body.dataset.page === "password-reset") initPasswordResetPage();
    if (["dashboard", "plans", "patients", "search", "patient-home", "professional-profile", "booking", "appointments", "professional-calendar", "professional-profile-edit", "admin-users", "admin-dashboard", "measures", "anamnesis", "recipes", "messages"].includes(document.body.dataset.page)) {
        initProtectedPage();
    }
});
