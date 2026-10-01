# NutriLife 🍎

O **NutriLife** é uma plataforma web moderna projetada para nutricionistas e pacientes, focada em automatizar o agendamento de consultas, a gestão de planos alimentares e o processamento de pagamentos.

---

## 🚀 Sobre o Projeto

O NutriLife resolve o problema de tecnologias obsoletas e dificuldades de suporte em tempo real. A plataforma centraliza o acompanhamento nutricional, permitindo que o paciente tenha sua dieta na palma da mão e a nutricionista gerencie sua agenda com eficiência.

### Principais Funcionalidades
* **📅 Agendamento Inteligente:** Consulta de horários em tempo real e marcação online.
* **💳 Pagamentos Integrados:** Sistema de checkout para planos nutricionais (estilo streaming/assinatura).
* **🥗 Plano Alimentar Digital:** Acesso prático às dietas personalizadas via navegador.
* **💬 Suporte em Tempo Real:** Integração para dúvidas e ajustes rápidos entre nutricionista e cliente.
* **👥 Gestão de Usuários:** Cadastro completo de pacientes com histórico de consultas.

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
| :--- | :--- |
| **Frontend** | JavaScript, HTML5, CSS3 |
| **Backend** | Python |
| **Banco de Dados** | MongoDB (NoSQL) |
| **Hospedagem** | Netlify |
| **Pagamentos** | Integração via APIs (ex: PagSeguro) |

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

````
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

3. Inicie a API dentro da pasta `backend`:

```powershell
python -m uvicorn main:app --reload --env-file .env
```

A documentação interativa fica em `http://127.0.0.1:8000/docs`; `/health`
verifica também a conexão com o banco. As collections e índices são preparados
automaticamente na inicialização da API.

4. Crie a primeira conta profissional pela linha de comando (a API pública
cadastra apenas pacientes):

```powershell
python create_nutritionist.py
```

5. Sirva a pasta `frontend/` com um servidor estático, como Live Server
(porta padrão `5500`). O endereço local da API está em `frontend/config.js`.

Contas antigas do protótipo não tinham senha no banco. Para habilitar uma
conta existente, redefina sua senha localmente com `python reset_password.py`
(dentro de `backend/`).

### MVP funcional

* Cadastro de pacientes e login com senha armazenada usando Argon2.
* Tokens JWT temporários; o frontend os mantém apenas na sessão atual do navegador.
* Perfil, listagem de pacientes para nutricionistas e alteração/remoção da própria conta.
* CRUD de planos alimentares com acesso limitado ao paciente e à nutricionista responsável.
* E-mails únicos no MongoDB e CORS configurável por ambiente.

### Publicação

* No Netlify, publique `frontend/` como diretório do site e altere
  `frontend/config.js` para apontar à URL HTTPS pública da API.
* No provedor do backend configure `APP_ENV=production`, `MONGODB_URI`,
  `MONGODB_DATABASE`, `JWT_SECRET_KEY` (única e aleatória) e `CORS_ORIGINS`
  com a origem exata do Netlify. Separe várias origens por vírgula.
* `frontend/config.js` é público: nunca coloque segredos nele.

### Testes

Com o ambiente virtual ativo e dentro de `backend/`:

```powershell
python -m pytest
```
