# NutriLife 🍎

O **NutriLife** é um MVP web para nutricionistas e pacientes, com cadastro, perfis profissionais, agendamento, confirmação manual de pagamento e gestão de planos alimentares.

---

## 🚀 Sobre o Projeto

O NutriLife centraliza o acompanhamento nutricional: pacientes encontram profissionais por estado, consultam horários disponíveis e acessam seus planos alimentares; nutricionistas gerenciam perfil, disponibilidade, consultas, pacientes e dietas.

### Principais Funcionalidades
* **📅 Agendamento:** Horários livres calculados pela disponibilidade semanal e fuso horário da nutricionista.
* **💳 Pagamento manual:** A nutricionista informa seu link PagSeguro; após conferir o pagamento, confirma a consulta e registra o link do Teams.
* **🥗 Plano Alimentar Digital:** Acesso prático às dietas personalizadas via navegador.
* **👥 Gestão de pacientes:** Acesso limitado a pacientes com consulta confirmada ou plano alimentar vinculado.
* **🔐 Segurança básica:** Senhas com Argon2, JWT temporário e redefinição de senha por e-mail.

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
| :--- | :--- |
| **Frontend** | JavaScript vanilla, HTML5, CSS3 |
| **Backend** | Python, FastAPI, Pydantic |
| **Banco de Dados** | MongoDB com PyMongo |
| **Testes** | Pytest, FastAPI TestClient |
| **Hospedagem** | Netlify |
| **Pagamentos** | Link PagSeguro com conferência manual |

---

## 👥 Equipe de Desenvolvimento

* **Gabriel dos Santos Novaes**
* **Gabriella Vitor Siqueira**
* **Guilherme Moreira Flauzino Pimentel**

---

## 📋 Requisitos do Sistema (MVP)

### Críticos (Alta Prioridade)
1.  **Cadastro e Login:** Controle de acesso seguro para profissionais e pacientes.
2.  **Agendamento Online:** Funcionalidade principal para evitar conflitos de agenda.
3.  **Checkout Seguro:** Integração de pagamento para validação das consultas.

### Importantes
1.  **Dietas Personalizadas:** Visualização individualizada de planos alimentares.
2.  **Gestão de Planos:** Oferta de planos trimestrais e semestrais.
3.  **Painel da Nutricionista:** Interface para confirmar, remarcar ou cancelar atendimentos.

---

## 🔧 Estrutura de Pastas 

```
├── frontend/                   # Publicado no Netlify
│   ├── index.html              # Landing page
│   ├── css/styles.css          # Entrada dos estilos
│   ├── js/api.js               # Cliente Fetch da API
│   ├── components/             # Header e footer reutilizáveis
│   ├── pages/auth/             # Páginas de autenticação
│   └── assets/                 # Imagens e ícones
├── backend/                    # API FastAPI
│   ├── main.py                 # Aplicação e configuração de CORS
│   ├── requirements.txt
│   ├── database/               # Conexão com MongoDB
│   ├── schemas/                # Modelos Pydantic
│   ├── crud/                   # Operações de persistência
│   └── routers/                # Rotas HTTP
└── README.md

```

## 📦 Como contribuir (Instalação local)
Nota: O projeto está na versão 1.0 (Março/2026).

1. Clone o repositório:

git clone [https://github.com/Yukitte/NutriLife.git](https://github.com/Yukitte/NutriLife.git)

2. Configure o ambiente Python (PowerShell):

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
cd backend
Copy-Item .env.example .env
python -m pip install -r requirements-dev.txt
```

Edite `backend/.env` e substitua `JWT_SECRET_KEY` por uma chave aleatória. Para gerar uma:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Configure `MONGODB_URI` para o MongoDB local ou Atlas. Não compartilhe o `.env`
nem coloque a URI do banco ou a chave JWT no frontend.

A recuperação de senha requer servidor SMTP com `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USERNAME`, `SMTP_PASSWORD` e `SMTP_FROM_EMAIL`; use a porta 587 (STARTTLS)
ou 465 (TLS). Sem SMTP, os demais fluxos funcionam, mas a recuperação retorna
indisponibilidade.

3. Inicie a API dentro da pasta `backend`:

```powershell
python -m uvicorn main:app --reload --env-file .env
```

A documentação interativa fica em `http://127.0.0.1:8000/docs`; `/health`
verifica também a conexão com o banco. As collections e índices são preparados
automaticamente na inicialização da API.

4. Sirva a pasta `frontend/` com um servidor estático, como Live Server
(porta padrão `5500`). O endereço local da API está em `frontend/config.js`.

5. Abra a página de autenticação. Nutricionistas podem se cadastrar informando
o CRN; o CRN não é verificado automaticamente. Para receber agendamentos, a
profissional deve completar o perfil, informar o link PagSeguro e configurar
os horários em "Minha agenda".

```powershell
Start-Process "http://localhost:5500/pages/auth/login.html"
```

Contas antigas do protótipo não tinham senha no banco. Para habilitar uma
conta existente, redefina sua senha localmente com `python reset_password.py`
(dentro de `backend/`).

### MVP funcional

* Cadastro público de pacientes e nutricionistas (CRN informado, sem validação externa), com páginas de login e cadastro dedicadas e redefinição de senha.
* Área inicial do paciente com resumo de planos e consultas, busca de nutricionistas por estado e perfis profissionais.
* Disponibilidade semanal, perfil profissional público e reserva de horário com confirmação manual de pagamento e link do Teams.
* Consultas, pacientes e planos alimentares em páginas separadas.
* Planos com objetivo, duração e refeições compostas por alimentos, quantidades, medidas, calorias e nutrientes.
* Busca por alimento e categoria no catálogo TACO em português, com porções e cálculo nutricional por gramas; o USDA FoodData Central é mantido como alternativa.
* E-mails únicos no MongoDB, CORS configurável por ambiente e acesso aos pacientes limitado a relações existentes.

**Ainda fora do MVP:** integração automática/webhook PagSeguro, chat, avaliações/comentários, assinaturas e busca por distância. O fluxo de recuperação de senha exige SMTP configurado.

### Catálogo de alimentos

O projeto inclui a Tabela Brasileira de Composição de Alimentos (TACO), com
nomes de alimentos e categorias em português. A publicação oficial permite
reprodução total ou parcial desde que citada a fonte. Para recriar o catálogo
derivado, baixe a planilha Excel oficial pelo NEPA/UNICAMP e execute de `backend/`:

```powershell
Invoke-WebRequest `
  -Uri "https://www.nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/Taco-4a-Edicao.xlsx" `
  -OutFile "data/taco_4a_edicao.xlsx"
python scripts/build_taco_catalog.py data/taco_4a_edicao.xlsx
```

O JSON convertido `data/taco_catalogo.json` pode ser versionado com a atribuição
da fonte. A planilha original `data/taco_4a_edicao.xlsx` permanece ignorada pelo
Git; o conversor reproduz o JSON a partir dela. Se o catálogo TACO não estiver
presente, a busca usa o catálogo alternativo USDA incluído no repositório.

A busca é servida por `GET /alimentos`, `GET /alimentos/categorias` e
`GET /alimentos/fonte`. A TACO apresenta a composição por 100 g de parte
comestível; a seleção local permite informar gramas. Ao salvar um plano, o
backend valida o ID do catálogo ativo e recalcula calorias e nutrientes antes
de gravar a refeição no MongoDB. Valores TACO `Tr`, `NA` e `*` ficam como não
informados, não são interpretados como zero.

Fonte: NEPA/UNICAMP. *Tabela Brasileira de Composição de Alimentos (TACO)*,
4ª edição revisada e ampliada. Campinas: NEPA/UNICAMP. A publicação oficial
declara: “É permitida a reprodução total ou parcial do material, desde que seja
citada a fonte.” Consulte a [publicação oficial](https://nepa.unicamp.br/publicacoes/tabela-taco-pdf/).

### Publicação

* No Netlify, publique `frontend/` como diretório do site e altere
  `frontend/config.js` para apontar à URL HTTPS pública da API.
* No provedor do backend configure `APP_ENV=production`, `MONGODB_URI`,
  `MONGODB_DATABASE`, `JWT_SECRET_KEY` (única e aleatória) e `CORS_ORIGINS`
  com a origem exata do Netlify. Separe várias origens por vírgula.
* Para habilitar recuperação de senha, configure também `FRONTEND_BASE_URL`,
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` e `SMTP_FROM_EMAIL`.
* `frontend/config.js` é público: nunca coloque segredos nele.

### Testes

Com a `.venv` ativa e dentro de `backend/`:

```powershell
python -m pytest
```

### Testes

Com o ambiente virtual ativo e dentro de `backend/`:

```powershell
python -m pytest
```
