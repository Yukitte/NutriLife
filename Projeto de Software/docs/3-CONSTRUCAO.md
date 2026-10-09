# Texto de apoio — seção 3. Construção

Este texto descreve a versão presente na pasta principal do NutriLife. Confira
as informações e produza as evidências indicadas antes de usá-lo no documento
acadêmico; não declare testes de interface ou de persistência que não tenham
sido demonstrados.

## 3.1 Código-fonte

| Item | Informação |
| --- | --- |
| Repositório | https://github.com/Yukitte/NutriLife |
| Linguagens | Python no backend; HTML, CSS e JavaScript vanilla no frontend |
| Frameworks e bibliotecas | FastAPI, Pydantic, PyMongo, Pytest, HTTPX, PyJWT e pwdlib |
| Persistência | MongoDB para dados da aplicação |
| Catálogo alimentar | TACO como fonte principal, com catálogo USDA como alternativa local |

### 3.1.1 Organização do código

O frontend está em `frontend/`. `index.html` é a página inicial; as páginas de
autenticação ficam em `pages/auth/`, e o painel, planos, pacientes, consultas,
busca de nutricionistas, perfil e agenda têm páginas próprias. `js/api.js`
centraliza as chamadas HTTP e `js/app.js` controla os fluxos das páginas.

O backend está em `backend/`. `main.py` configura a aplicação FastAPI, CORS,
inicialização do banco e registro dos roteadores. `routers/` implementa os
endpoints; `schemas/` define validação e serialização; `crud/` organiza as
operações de persistência; e `database/` concentra a conexão e preparação das
collections e índices do MongoDB.

O catálogo de alimentos é carregado localmente por `catalogo_alimentos.py`,
servido pelo roteador `alimento_router.py` e pode ser recriado com
`scripts/build_taco_catalog.py` a partir da planilha TACO oficial. O catálogo
convertido fica em `backend/data/taco_catalogo.json`; a planilha original não é
versionada.

### 3.1.2 Qualidade e validação

Os schemas Pydantic validam dados de entrada; senhas são armazenadas com hash,
as rotas privadas exigem autenticação e as respostas públicas não devem expor
segredos. Ao gravar opções de refeição, o backend valida o alimento pelo ID do
catálogo ativo e recalcula os nutrientes, em vez de confiar nos valores
nutricionais enviados pelo navegador. Valores TACO ausentes ou marcados como
traço não são tratados como zero.

## 3.2 Testes

Os testes automatizados usam Pytest e FastAPI TestClient. Execute a partir de
`backend/`:

```powershell
python -m pytest -p no:cacheprovider -q
```

Na validação da pasta principal, o resultado foi **29 testes aprovados**. O
runner apresentou um aviso de depreciação não bloqueante na integração de
Starlette TestClient e HTTPX. A cobertura de código não foi medida. O teste do
health check usa banco simulado; ele não comprova uma gravação real no MongoDB.
Se os testes forem executados novamente, atualize o resultado no documento
acadêmico para corresponder à saída real.

## 3.3 Interfaces com usuário

O frontend contém páginas para início, autenticação e recuperação de senha,
dashboard, planos, pacientes, busca e perfil de nutricionistas, agendamentos,
consultas e disponibilidade profissional. O editor de planos permite pesquisar
alimentos, informar quantidades e montar refeições com valores nutricionais.

Antes de declarar os fluxos demonstrados, execute o frontend com a API
disponível e valide no navegador o login, as permissões de cada perfil, a busca
no catálogo, a montagem de uma refeição e a consulta do plano salvo. Inclua
capturas legíveis das telas efetivamente verificadas.

## 3.4 Banco de dados e catálogo

A aplicação usa MongoDB por meio de PyMongo. `MONGODB_URI` e
`MONGODB_DATABASE` são configurados no ambiente do backend. Não inclua URI,
senha, `.env`, tokens ou dados pessoais no repositório, em capturas ou no
documento acadêmico. Para demonstrar persistência real, use uma instância de
desenvolvimento, confirme `/health` com o banco conectado, grave um registro,
reinicie a API e consulte o mesmo registro novamente.

A base alimentar principal é a **Tabela Brasileira de Composição de Alimentos
(TACO), 4ª edição revisada e ampliada**, com nomes em português e composição
por 100 g de parte comestível. A publicação permite reprodução total ou parcial
desde que a fonte seja citada. A seleção no plano aceita peso em gramas e o
backend recalcula os nutrientes antes de salvar. O catálogo USDA incluído no
repositório permanece como alternativa caso o catálogo TACO não esteja
disponível; nenhum dos catálogos é uma collection do MongoDB.

Fonte: NEPA/UNICAMP. *Tabela Brasileira de Composição de Alimentos (TACO)*,
4ª edição revisada e ampliada. Campinas: NEPA/UNICAMP. [Publicação oficial](https://nepa.unicamp.br/publicacoes/tabela-taco-pdf/).

Para recriar o JSON, baixe a planilha oficial, salve-a como
`backend/data/taco_4a_edicao.xlsx` e execute de `backend/`:

```powershell
python scripts/build_taco_catalog.py data/taco_4a_edicao.xlsx
```

## Orientações para preencher o documento acadêmico

1. Use a estrutura e as tecnologias acima, removendo referências a frameworks
   que não estejam no repositório.
2. Atualize a quantidade de testes e as evidências com a execução mais recente;
   não informe cobertura sem medição.
3. Inclua capturas das telas e dos fluxos realmente testados.
4. Só afirme persistência no MongoDB após realizar a verificação com uma
   instância acessível, inclusive após reiniciar a API.
5. Mantenha a atribuição da TACO e não inclua credenciais ou dados pessoais.
