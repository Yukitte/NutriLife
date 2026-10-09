from datetime import datetime, timezone

import jwt
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from pydantic import ValidationError

import main
from crud import anamnese_crud
from crud import consulta_crud
from crud import plano_crud
from crud import receita_crud
from crud import mensagem_crud
from crud import usuario_crud
from crud.usuario_crud import _serializar_profissional
from routers import admin_router, alimento_router, anamnese_router, auth_router, comentario_router, consulta_router, medida_router, mensagem_router, receita_router, usuario_router
from schemas.consulta_schema import (
    ConsultaAvaliacaoUpdate,
    ConsultaConfirmar,
    ConsultaCreate,
    DisponibilidadeUpdate,
)
from schemas.plano_schema import OpcaoAlimento, PlanoUpdate
from schemas.receita_schema import ReceitaSalvar
from schemas.usuario_schema import AdministradorUsuarioUpdate, UsuarioCreate, UsuarioUpdate
from scripts.build_taco_catalog import _nutrient_value
from security import (
    create_access_token,
    create_password_reset_token,
    get_reset_token_claims,
    hash_password,
    verify_password,
)
from settings import Settings, get_settings


@pytest.fixture(autouse=True)
def limpar_limites_de_tentativas():
    from limite_tentativas import limite_cadastro, limite_login, limite_recuperacao

    for limite in (limite_login, limite_recuperacao, limite_cadastro):
        limite._registros.clear()
    yield


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(main, "initialize_database", lambda: None)
    with TestClient(main.app) as test_client:
        yield test_client


def test_register_creates_patient_and_never_returns_password(client, monkeypatch):
    created_users = []

    def create_user(usuario, senha_hash):
        created_users.append((usuario, senha_hash))
        return {
            "id": "507f1f77bcf86cd799439011",
            "nome": usuario.nome,
            "email": str(usuario.email),
            "perfil": usuario.tipo,
            "telefone": usuario.telefone,
            "endereco": usuario.endereco,
            "cep": usuario.cep,
            "estado": usuario.estado,
            "data_inicio": "2026-10-01",
        }

    monkeypatch.setattr(usuario_router, "criar_usuario", create_user)
    monkeypatch.setattr(usuario_router, "hash_password", lambda _: "hashed")
    monkeypatch.setattr(usuario_router, "create_access_token", lambda _: "access-token")

    response = client.post(
        "/usuarios",
        json={
            "nome": "Maria Souza",
            "email": "maria@example.com",
            "cpf": "529.982.247-25",
            "telefone": "61988887777",
            "endereco": "Rua das Flores, 10",
            "cep": "70000000",
            "estado": "DF",
            "senha": "senha-segura-123",
            "tipo": "paciente",
            "crn": "",
        },
    )

    assert response.status_code == 201
    assert response.json()["usuario"]["perfil"] == "paciente"
    assert "senha" not in response.json()["usuario"]
    assert created_users[0][1] == "hashed"
    assert created_users[0][0].cpf == "52998224725"


@pytest.mark.parametrize("cpf", ["123.456.789-00", "111.111.111-11", "1234"])
def test_registration_rejects_invalid_cpf(client, cpf):
    response = client.post(
        "/usuarios",
        json={
            "nome": "Maria Souza",
            "email": "maria@example.com",
            "cpf": cpf,
            "telefone": "61988887777",
            "endereco": "Rua das Flores, 10",
            "cep": "70000000",
            "estado": "DF",
            "senha": "senha-segura-123",
            "tipo": "paciente",
        },
    )

    assert response.status_code == 422


def test_password_recovery_by_cpf_updates_password(client, monkeypatch):
    calls = []

    def reset(email, cpf, senha_hash):
        calls.append((email, cpf, senha_hash))
        return True

    monkeypatch.setattr(auth_router, "redefinir_senha_por_cpf", reset)
    monkeypatch.setattr(auth_router, "hash_password", lambda _: "novo-hash")

    response = client.post(
        "/auth/recuperar-senha-cpf",
        json={"cpf": "529.982.247-25", "email": "Maria@Example.com", "senha": "nova-senha-123"},
    )

    assert response.status_code == 204
    assert calls == [("maria@example.com", "52998224725", "novo-hash")]


def test_password_recovery_by_cpf_rejects_wrong_data(client, monkeypatch):
    monkeypatch.setattr(auth_router, "redefinir_senha_por_cpf", lambda *_: False)

    response = client.post(
        "/auth/recuperar-senha-cpf",
        json={"cpf": "529.982.247-25", "email": "maria@example.com", "senha": "nova-senha-123"},
    )

    assert response.status_code == 400


def test_distance_between_brasilia_and_goiania_is_realistic():
    from geolocalizacao import distancia_km

    brasilia = (-15.7939, -47.8828)
    goiania = (-16.6869, -49.2648)

    assert 170 < distancia_km(brasilia, goiania) < 180
    assert distancia_km(brasilia, brasilia) == 0


def test_nearby_nutritionists_requires_authentication(client):
    response = client.get("/usuarios/nutricionistas/proximos")

    assert response.status_code == 401


def test_nearby_nutritionists_returns_distance_without_address(client, monkeypatch):
    patient = {"id": "507f1f77bcf86cd799439011", "perfil": "paciente", "ativo": True}
    main.app.dependency_overrides[usuario_router.get_current_user] = lambda: patient
    calls = []

    def nearby(patient_id, radius, state):
        calls.append((patient_id, radius, state))
        return [{
            "id": "507f1f77bcf86cd799439012",
            "nome": "Amanda Ribeiro",
            "estado": "DF",
            "data_inicio": "2026-01-01",
            "distancia_km": 3.2,
        }]

    monkeypatch.setattr(usuario_router, "listar_nutricionistas_proximos", nearby)
    try:
        response = client.get("/usuarios/nutricionistas/proximos?raio_km=10&estado=df")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()[0]["distancia_km"] == 3.2
    assert "cep" not in response.json()[0]
    assert "endereco" not in response.json()[0]
    assert calls == [("507f1f77bcf86cd799439011", 10.0, "df")]


def test_nearby_nutritionists_reports_unknown_patient_location(client, monkeypatch):
    patient = {"id": "507f1f77bcf86cd799439011", "perfil": "paciente", "ativo": True}
    main.app.dependency_overrides[usuario_router.get_current_user] = lambda: patient
    monkeypatch.setattr(usuario_router, "listar_nutricionistas_proximos", lambda *_: None)
    try:
        response = client.get("/usuarios/nutricionistas/proximos")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 422


def test_cpf_is_stored_only_as_keyed_hash():
    digest = usuario_crud.hash_cpf("52998224725")

    assert digest != "52998224725"
    assert len(digest) == 64
    assert digest == usuario_crud.hash_cpf("52998224725")


def test_public_registration_cannot_choose_role(client):
    response = client.post(
        "/usuarios",
        json={
            "nome": "Maria Souza",
            "email": "maria@example.com",
            "telefone": "61988887777",
            "endereco": "Rua das Flores, 10",
            "cep": "70000000",
            "estado": "DF",
            "senha": "senha-segura-123",
            "tipo": "nutricionista",
        },
    )

    assert response.status_code == 422


def test_public_registration_cannot_create_an_administrator():
    with pytest.raises(ValidationError):
        UsuarioCreate(
            nome="Admin NutriLife",
            email="admin@example.com",
            telefone="61988887777",
            endereco="Rua das Flores, 10",
            cep="70000000",
            estado="DF",
            senha="senha-segura-123",
            tipo="administrador",
        )


def test_public_nutritionist_directory_does_not_expose_email(client, monkeypatch):
    monkeypatch.setattr(
        usuario_router,
        "listar_nutricionistas",
        lambda _: [{
            "id": "507f1f77bcf86cd799439011",
            "nome": "Ana Nutri",
            "estado": "DF",
            "crn": "12345",
            "telefone": "61988887777",
            "especialidades": ["Emagrecimento"],
            "biografia": "Atendimento nutricional",
            "valor_consulta": 150,
            "nota_media": 0,
            "total_pacientes": 0,
            "data_inicio": "2026-10-01",
        }],
    )
    response = client.get("/usuarios/nutricionistas?estado=DF")

    assert response.status_code == 200
    assert response.json()[0]["nome"] == "Ana Nutri"
    assert "email" not in response.json()[0]


def test_public_professional_serializer_omits_private_account_fields():
    professional = _serializar_profissional({
        "_id": "507f1f77bcf86cd799439011",
        "nome": "Ana Nutri",
        "email": "private@example.com",
        "endereco": "Rua privada, 10",
        "cep": "70000000",
        "pagseguro_link": "https://pag.ae/example",
    })

    assert professional["nome"] == "Ana Nutri"
    assert "email" not in professional
    assert "endereco" not in professional
    assert "pagseguro_link" not in professional


def test_public_nutritionist_directory_excludes_deactivated_accounts(monkeypatch):
    class Professionals:
        def find(self, query, projection):
            assert query == {
                "perfil": "nutricionista",
                "ativo": {"$ne": False},
            }

            class Cursor:
                def sort(self, field, direction):
                    assert field == "nome"
                    return []

            return Cursor()

    class Database:
        def __getitem__(self, name):
            assert name == "usuarios"
            return Professionals()

    monkeypatch.setattr(usuario_crud, "get_database", lambda: Database())

    assert usuario_crud.listar_nutricionistas() == []


def test_login_returns_access_token_without_password_hash(client, monkeypatch):
    monkeypatch.setattr(
        auth_router,
        "buscar_usuario_com_senha",
        lambda _: {
            "_id": "507f1f77bcf86cd799439011",
            "nome": "Maria Souza",
            "email": "maria@example.com",
            "perfil": "paciente",
            "senha_hash": "hashed",
        },
    )
    monkeypatch.setattr(auth_router, "verify_password", lambda *_: True)

    response = client.post(
        "/auth/login",
        json={"email": "maria@example.com", "senha": "senha-segura-123"},
    )

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert "senha_hash" not in response.json()["usuario"]


def test_inactive_user_cannot_log_in(client, monkeypatch):
    monkeypatch.setattr(
        auth_router,
        "buscar_usuario_com_senha",
        lambda _: {
            "_id": ObjectId("507f1f77bcf86cd799439011"),
            "nome": "Maria Souza",
            "email": "maria@example.com",
            "perfil": "paciente",
            "ativo": False,
            "senha_hash": "hashed",
        },
    )
    monkeypatch.setattr(auth_router, "verify_password", lambda *_: True)

    response = client.post(
        "/auth/login",
        json={"email": "maria@example.com", "senha": "senha-segura-123"},
    )

    assert response.status_code == 401


def test_inactive_user_token_cannot_access_private_routes(client, monkeypatch):
    user_id = "507f1f77bcf86cd799439011"
    monkeypatch.setattr(
        "security.buscar_usuario",
        lambda *_, **__: {
            "id": user_id,
            "nome": "Maria Souza",
            "perfil": "paciente",
            "ativo": False,
        },
    )
    token = create_access_token(user_id)

    response = client.get(
        "/usuarios/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


@pytest.mark.parametrize("path", ["/usuarios", "/planos"])
def test_private_resources_require_authentication(client, path):
    response = client.get(path)

    assert response.status_code == 401


def test_appointment_list_requires_authentication(client):
    assert client.get("/consultas").status_code == 401


def test_patient_cannot_access_admin_user_list(client, monkeypatch):
    patient_id = "507f1f77bcf86cd799439011"
    monkeypatch.setattr(
        "security.buscar_usuario",
        lambda *_, **__: {"id": patient_id, "nome": "Maria Souza", "perfil": "paciente"},
    )
    token = create_access_token(patient_id)

    response = client.get(
        "/admin/usuarios",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403


def test_administrator_can_list_users_without_password_hash(client, monkeypatch):
    admin_id = "507f1f77bcf86cd799439011"
    monkeypatch.setattr(
        "security.buscar_usuario",
        lambda *_, **__: {
            "id": admin_id,
            "nome": "Admin NutriLife",
            "perfil": "administrador",
        },
    )
    monkeypatch.setattr(
        admin_router,
        "listar_usuarios_administrador",
        lambda: [{
            "id": "507f1f77bcf86cd799439012",
            "nome": "Maria Souza",
            "email": "maria@example.com",
            "perfil": "paciente",
            "ativo": True,
            "data_inicio": "2026-10-01",
        }],
    )
    token = create_access_token(admin_id)

    response = client.get(
        "/admin/usuarios",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()[0]["nome"] == "Maria Souza"
    assert "senha_hash" not in response.json()[0]


def test_serialized_legacy_users_are_active_by_default():
    user = usuario_crud.serializar_usuario({
        "_id": ObjectId("507f1f77bcf86cd799439011"),
        "nome": "Maria Souza",
        "email": "maria@example.com",
        "perfil": "paciente",
    })

    assert user["ativo"] is True


def test_admin_can_deactivate_user_without_changing_profile(monkeypatch):
    user_id = "507f1f77bcf86cd799439012"
    user_document = {
        "_id": ObjectId(user_id),
        "nome": "Maria Souza",
        "email": "maria@example.com",
        "perfil": "paciente",
        "ativo": True,
    }

    class Users:
        def find_one(self, query):
            return user_document if query["_id"] == ObjectId(user_id) else None

        def update_one(self, query, update):
            assert query == {"_id": ObjectId(user_id)}
            user_document.update(update["$set"])

    class Database:
        def __getitem__(self, name):
            if name == "usuarios":
                return Users()
            pytest.fail(f"No history lookup should be needed in {name}.")

    monkeypatch.setattr(usuario_crud, "get_database", lambda: Database())
    updated = usuario_crud.atualizar_usuario_administrador(
        user_id,
        AdministradorUsuarioUpdate(ativo=False),
    )

    assert updated["ativo"] is False
    assert user_document["perfil"] == "paciente"


def test_admin_cannot_delete_user_with_consultation_history(monkeypatch):
    user_id = "507f1f77bcf86cd799439012"
    user_document = {"_id": ObjectId(user_id), "perfil": "paciente"}

    class Users:
        def find_one(self, query, projection=None):
            return user_document

        def delete_one(self, query):
            pytest.fail("A user with clinical history must not be deleted.")

    class Consultations:
        def find_one(self, query, projection):
            return {"_id": ObjectId("507f1f77bcf86cd799439013")}

    class Database:
        def __getitem__(self, name):
            if name == "usuarios":
                return Users()
            if name == "consultas":
                return Consultations()
            pytest.fail(f"Unexpected history lookup in {name}.")

    monkeypatch.setattr(usuario_crud, "get_database", lambda: Database())

    with pytest.raises(ValueError, match="desative"):
        usuario_crud.remover_usuario_administrador(user_id)


def test_admin_cannot_change_profile_of_user_with_history(monkeypatch):
    user_id = "507f1f77bcf86cd799439012"
    user_document = {"_id": ObjectId(user_id), "perfil": "paciente"}

    class Users:
        def find_one(self, query):
            return user_document

        def update_one(self, query, update):
            pytest.fail("Role changes with history must be blocked.")

    class Consultations:
        def find_one(self, query, projection):
            return {"_id": ObjectId("507f1f77bcf86cd799439013")}

    class Database:
        def __getitem__(self, name):
            if name == "usuarios":
                return Users()
            if name == "consultas":
                return Consultations()
            pytest.fail(f"Unexpected history lookup in {name}.")

    monkeypatch.setattr(usuario_crud, "get_database", lambda: Database())

    with pytest.raises(ValueError, match="perfil"):
        usuario_crud.atualizar_usuario_administrador(
            user_id,
            AdministradorUsuarioUpdate(perfil="nutricionista", crn="CRN1234"),
        )


def test_patient_cannot_create_plan(client, monkeypatch):
    monkeypatch.setattr(
        "security.buscar_usuario",
        lambda *_, **__: {
            "id": "507f1f77bcf86cd799439011",
            "nome": "Maria Souza",
            "email": "maria@example.com",
            "perfil": "paciente",
        },
    )
    token = create_access_token("507f1f77bcf86cd799439011")
    response = client.post(
        "/planos",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "paciente_id": "507f1f77bcf86cd799439012",
            "titulo": "Plano semanal",
            "objetivo": "Melhorar hábitos",
            "duracao_meses": 3,
            "descricao": "Orientações gerais",
            "refeicoes": [{
                "horario": "07:00",
                "nome": "Café da manhã",
                "opcoes": [{
                    "nome": "Aveia",
                    "quantidade": 1,
                    "medida": "porção",
                    "calorias": 150,
                }],
            }],
        },
    )

    assert response.status_code == 403


def test_update_plan_serializes_nested_meals_without_model_dump_error(monkeypatch):
    plan_id = "507f1f77bcf86cd799439012"
    nutritionist_id = "507f1f77bcf86cd799439013"
    patient_id = "507f1f77bcf86cd799439011"
    plan_document = {
        "_id": ObjectId(plan_id),
        "paciente_id": ObjectId(patient_id),
        "nutricionista_id": ObjectId(nutritionist_id),
        "titulo": "Plano atualizado",
        "objetivo": "Manutenção",
        "duracao_meses": 3,
        "descricao": "Orientações atualizadas",
        "refeicoes": [],
    }

    class Plans:
        def update_one(self, query, update):
            assert query == {
                "_id": ObjectId(plan_id),
                "nutricionista_id": ObjectId(nutritionist_id),
            }
            plan_document.update(update["$set"])

        def find_one(self, query):
            return plan_document if query["_id"] == ObjectId(plan_id) else None

    class Users:
        def find_one(self, query):
            return {"nome": "Maria Souza" if query["_id"] == ObjectId(patient_id) else "Ana Nutri"}

    class Database:
        def __getitem__(self, name):
            if name == "planos":
                return Plans()
            assert name == "usuarios"
            return Users()

    monkeypatch.setattr(plano_crud, "get_database", lambda: Database())
    changes = PlanoUpdate(
        titulo="Plano atualizado",
        objetivo="Manutenção",
        duracao_meses=3,
        descricao="Orientações atualizadas",
        refeicoes=[{
            "horario": "07:30",
            "nome": "Café da manhã",
            "opcoes": [{
                "nome": "Aveia",
                "quantidade": 40,
                "medida": "g",
                "calorias": 150,
            }],
        }],
    )

    result = plano_crud.atualizar_plano(
        plan_id,
        changes,
        {"id": nutritionist_id},
    )

    assert result["titulo"] == "Plano atualizado"
    assert result["refeicoes"][0]["horario"] == "07:30"
    assert result["refeicoes"][0]["alimentos"][0]["nome"] == "Aveia"


def test_food_catalog_search_is_public_and_includes_portions(client, monkeypatch):
    foods = [{
        "id": "fixture-1",
        "name": "Arroz integral cozido",
        "category": "Cereais e derivados",
        "nutrients_per_100g": {"energia_kcal": 124, "proteina_g": 2.6},
        "portions": [{"label": "100 g", "gram_weight": 100}],
    }]
    monkeypatch.setattr(alimento_router, "carregar_alimentos", lambda: foods)
    monkeypatch.setattr(
        alimento_router,
        "buscar_alimento_por_id",
        lambda food_id: foods[0] if food_id == "fixture-1" else None,
    )
    response = client.get("/alimentos?busca=arroz")

    assert response.status_code == 200
    assert response.json()["total"] > 0
    food = response.json()["items"][0]
    assert food["id"]
    assert food["nutrients_per_100g"]["energia_kcal"] > 0
    assert food["portions"]


def test_food_catalog_returns_categories_and_food_details(client, monkeypatch):
    foods = [{
        "id": "fixture-1",
        "name": "Arroz integral cozido",
        "category": "Cereais e derivados",
        "nutrients_per_100g": {"energia_kcal": 124},
        "portions": [{"label": "100 g", "gram_weight": 100}],
    }]
    monkeypatch.setattr(alimento_router, "carregar_alimentos", lambda: foods)
    monkeypatch.setattr(alimento_router, "carregar_fonte", lambda: {"name": "TACO"})
    monkeypatch.setattr(
        alimento_router,
        "buscar_alimento_por_id",
        lambda food_id: foods[0] if food_id == "fixture-1" else None,
    )
    categories = client.get("/alimentos/categorias")
    food = client.get("/alimentos/fixture-1")
    source = client.get("/alimentos/fonte")

    assert categories.status_code == 200
    assert "Cereais e derivados" in categories.json()
    assert food.status_code == 200
    assert food.json()["name"] == "Arroz integral cozido"
    assert source.json()["name"] == "TACO"


def test_plan_food_nutrients_are_recomputed_from_catalog(monkeypatch):
    import schemas.plano_schema as plano_schema

    monkeypatch.setattr(
        plano_schema,
        "buscar_alimento_por_id",
        lambda _: {
            "id": "taco-fixture",
            "name": "Arroz, integral, cozido",
            "category": "Cereais e derivados",
            "nutrients_per_100g": {
                "energia_kcal": 123.5348925,
                "proteina_g": 2.58825,
                "carboidrato_g": 25.80975,
                "gordura_g": 1.000333,
                "fibra_g": 2.74933,
                "sodio_mg": 1.24467,
            },
        },
    )
    monkeypatch.setattr(
        plano_schema,
        "carregar_fonte",
        lambda: {"name": "Tabela Brasileira de Composição de Alimentos (TACO)"},
    )
    option = OpcaoAlimento(
        nome="valor adulterado",
        quantidade=150,
        medida="g",
        calorias=1,
        alimento_id="taco-fixture",
        proteina_g=999,
    )

    assert option.nome == "Arroz, integral, cozido"
    assert option.calorias == 185
    assert option.proteina_g == pytest.approx(3.882375)
    assert option.categoria == "Cereais e derivados"
    assert option.fonte_dados.endswith("(TACO)")


def test_catalog_food_option_rejects_unknown_id(monkeypatch):
    import schemas.plano_schema as plano_schema

    monkeypatch.setattr(plano_schema, "buscar_alimento_por_id", lambda _: None)
    with pytest.raises(ValidationError):
        OpcaoAlimento(
            nome="Banana",
            quantidade=100,
            medida="g",
            calorias=89,
            alimento_id="999999999",
        )


@pytest.mark.parametrize("value", ["Tr", "NA", "ND", "*", None, ""])
def test_taco_non_numeric_markers_are_kept_as_missing(value):
    assert _nutrient_value(value) is None


def test_taco_importer_parses_portuguese_decimal_values():
    assert _nutrient_value("12,5") == 12.5
    assert _nutrient_value("0.25") == 0.25


def test_passwords_are_hashed_and_access_tokens_expire():
    hashed = hash_password("senha-segura-123")
    assert hashed != "senha-segura-123"
    assert verify_password("senha-segura-123", hashed)
    assert not verify_password("senha-incorreta", hashed)

    claims = jwt.decode(
        create_access_token("507f1f77bcf86cd799439011"),
        get_settings().jwt_secret_key,
        algorithms=["HS256"],
    )
    assert claims["sub"] == "507f1f77bcf86cd799439011"
    assert "exp" in claims
    assert claims["purpose"] == "access"


def test_password_reset_token_has_separate_purpose_and_nonce():
    token = create_password_reset_token(
        "507f1f77bcf86cd799439011",
        "one-time-nonce",
    )
    assert get_reset_token_claims(token) == {
        "user_id": "507f1f77bcf86cd799439011",
        "jti": "one-time-nonce",
    }
    assert get_reset_token_claims(
        create_access_token("507f1f77bcf86cd799439011")
    ) is None


def test_availability_rejects_overlapping_windows():
    with pytest.raises(ValidationError):
        DisponibilidadeUpdate(
            fuso_horario="America/Sao_Paulo",
            horarios=[
                {"dia_semana": 0, "inicio": "09:00", "fim": "12:00", "duracao_minutos": 60},
                {"dia_semana": 0, "inicio": "11:00", "fim": "13:00", "duracao_minutos": 60},
            ],
        )


def test_availability_accepts_sao_paulo_timezone():
    availability = DisponibilidadeUpdate(
        fuso_horario="America/Sao_Paulo",
        horarios=[],
    )

    assert availability.fuso_horario == "America/Sao_Paulo"


def test_availability_rejects_repeated_specific_dates():
    with pytest.raises(ValidationError):
        DisponibilidadeUpdate(
            horarios=[],
            datas_especificas=[
                {"data": "2030-03-04", "horarios": []},
                {"data": "2030-03-04", "horarios": [{"inicio": "09:00", "fim": "10:00"}]},
            ],
        )


def test_specific_date_overrides_weekly_schedule(monkeypatch):
    nutritionist_id = "507f1f77bcf86cd799439013"
    monkeypatch.setattr(
        consulta_crud,
        "obter_disponibilidade",
        lambda _: {
            "fuso_horario": "America/Sao_Paulo",
            "horarios": [
                {"dia_semana": 0, "inicio": "09:00", "fim": "11:00", "duracao_minutos": 60},
                {"dia_semana": 1, "inicio": "09:00", "fim": "10:00", "duracao_minutos": 60},
                {"dia_semana": 2, "inicio": "09:00", "fim": "10:00", "duracao_minutos": 60},
            ],
            "datas_especificas": [
                {"data": "2030-03-04", "horarios": [{"inicio": "14:00", "fim": "15:30", "duracao_minutos": 30}]},
                {"data": "2030-03-05", "horarios": []},
            ],
        },
    )

    class Consultations:
        def find(self, *_):
            return []

    class Database:
        def __getitem__(self, name):
            assert name == "consultas"
            return Consultations()

    monkeypatch.setattr(consulta_crud, "get_database", lambda: Database())

    slots = consulta_crud.listar_horarios_livres(
        nutritionist_id,
        datetime(2030, 3, 4).date(),
        datetime(2030, 3, 6).date(),
    )

    por_dia = {}
    for slot in slots:
        por_dia.setdefault(slot["data_local"].isoformat(), []).append(slot["inicio"].strftime("%H:%M"))
    assert por_dia == {
        "2030-03-04": ["17:00", "17:30", "18:00"],
        "2030-03-06": ["12:00"],
    }


def test_consultation_without_payment_link_waits_for_nutritionist_confirmation(
    monkeypatch,
):
    patient_id = "507f1f77bcf86cd799439011"
    nutritionist_id = "507f1f77bcf86cd799439013"
    appointment_id = ObjectId("507f1f77bcf86cd799439014")
    start = datetime(2026, 10, 5, 13, tzinfo=timezone.utc)

    class Users:
        def find_one(self, query):
            if query["_id"] == ObjectId(nutritionist_id):
                return {
                    "_id": ObjectId(nutritionist_id),
                    "perfil": "nutricionista",
                    "nome": "Ana Nutri",
                }
            assert query["_id"] == ObjectId(patient_id)
            return {"nome": "Maria Souza"}

    class Consultations:
        def insert_one(self, document):
            self.document = document
            return type("InsertResult", (), {"inserted_id": appointment_id})()

    consultations = Consultations()

    class Database:
        def __getitem__(self, name):
            if name == "usuarios":
                return Users()
            assert name == "consultas"
            return consultations

    monkeypatch.setattr(consulta_crud, "get_database", lambda: Database())
    monkeypatch.setattr(
        consulta_crud,
        "listar_horarios_livres",
        lambda *_: [{"inicio": start}],
    )

    appointment = consulta_crud.criar_consulta(
        {"id": patient_id},
        ConsultaCreate(nutricionista_id=nutritionist_id, inicio=start),
    )

    assert appointment["status"] == "pendente_confirmacao"
    assert appointment["link_pagamento"] is None
    assert consultations.document["status"] == "pendente_confirmacao"


def test_nutritionist_can_confirm_consultation_without_payment(monkeypatch):
    appointment_id = "507f1f77bcf86cd799439014"
    nutritionist_id = "507f1f77bcf86cd799439013"
    patient_id = "507f1f77bcf86cd799439011"
    expected_query = {
        "_id": ObjectId(appointment_id),
        "nutricionista_id": ObjectId(nutritionist_id),
        "status": {"$in": ["pendente_pagamento", "pendente_confirmacao"]},
    }

    class Consultations:
        def find_one_and_update(self, query, update, return_document):
            assert query == expected_query
            assert update["$set"]["status"] == "confirmada"
            assert update["$set"]["link_reuniao"] is None
            return {
                "_id": ObjectId(appointment_id),
                "paciente_id": ObjectId(patient_id),
                "nutricionista_id": ObjectId(nutritionist_id),
                "inicio": datetime(2026, 10, 5, 13, tzinfo=timezone.utc),
                "status": update["$set"]["status"],
                "link_pagamento": None,
                "link_reuniao": update["$set"]["link_reuniao"],
            }

    class Users:
        def find_one(self, query):
            return {
                "_id": query["_id"],
                "nome": "Maria Souza" if query["_id"] == ObjectId(patient_id) else "Ana Nutri",
            }

    class Database:
        def __getitem__(self, name):
            if name == "consultas":
                return Consultations()
            assert name == "usuarios"
            return Users()

    monkeypatch.setattr(consulta_crud, "get_database", lambda: Database())
    result = consulta_crud.confirmar_consulta(
        appointment_id,
        ConsultaConfirmar(),
        {"id": nutritionist_id},
    )

    assert result["status"] == "confirmada"
    assert result["link_reuniao"] is None


def test_consultation_confirmation_allows_missing_meeting_link():
    assert ConsultaConfirmar().link_reuniao is None
    assert ConsultaConfirmar(link_reuniao=None).link_reuniao is None


def test_consultation_assessment_calculates_bmi_and_adult_bmr():
    assessment = ConsultaAvaliacaoUpdate(
        idade_anos=30,
        sexo_biologico="feminino",
        peso_kg=70,
        altura_cm=175,
    )

    assert assessment.imc == 22.9
    assert assessment.taxa_metabolica_basal_kcal == 1483


def test_consultation_assessment_does_not_estimate_bmr_for_minors():
    assessment = ConsultaAvaliacaoUpdate(
        idade_anos=17,
        sexo_biologico="masculino",
        peso_kg=65,
        altura_cm=170,
    )

    assert assessment.taxa_metabolica_basal_kcal is None


def test_patient_assessment_endpoint_returns_only_the_summary(client, monkeypatch):
    appointment_id = "507f1f77bcf86cd799439012"
    patient_id = "507f1f77bcf86cd799439011"
    registered_at = datetime(2026, 10, 1, tzinfo=timezone.utc)
    appointment = {
        "_id": ObjectId(appointment_id),
        "paciente_id": ObjectId(patient_id),
        "avaliacao": {
            "atualizado_em": registered_at,
            "idade_anos": 30,
            "sexo_biologico": "feminino",
            "peso_kg": 70,
            "altura_cm": 175,
            "circunferencia_abdominal_cm": 80,
            "imc": 22.9,
            "taxa_metabolica_basal_kcal": 1483,
            "anotacoes": "Anotação clínica privada",
        },
    }

    class Consultations:
        def find_one(self, query):
            assert query == {
                "_id": ObjectId(appointment_id),
                "paciente_id": ObjectId(patient_id),
            }
            return appointment

    class Database:
        def __getitem__(self, name):
            assert name == "consultas"
            return Consultations()

    monkeypatch.setattr(consulta_crud, "get_database", lambda: Database())
    monkeypatch.setattr(
        "security.buscar_usuario",
        lambda *_, **__: {"id": patient_id, "nome": "Maria Souza", "perfil": "paciente"},
    )
    token = create_access_token(patient_id)

    response = client.get(
        f"/consultas/{appointment_id}/avaliacao",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert set(response.json()) == {
        "data_registro",
        "peso_kg",
        "altura_cm",
        "imc",
        "taxa_metabolica_basal_kcal",
    }
    assert "anotacoes" not in response.json()


def test_nutritionist_saves_assessment_to_her_confirmed_appointment(monkeypatch):
    appointment_id = "507f1f77bcf86cd799439012"
    patient_id = "507f1f77bcf86cd799439011"
    nutritionist_id = "507f1f77bcf86cd799439013"
    registered_at = datetime(2026, 9, 1, tzinfo=timezone.utc)

    class Consultations:
        def find_one(self, query, projection):
            assert query == {
                "_id": ObjectId(appointment_id),
                "nutricionista_id": ObjectId(nutritionist_id),
                "status": "confirmada",
            }
            assert projection == {"avaliacao.registrado_em": 1}
            return {"avaliacao": {"registrado_em": registered_at}}

        def find_one_and_update(self, query, update, return_document):
            self.query = query
            self.assessment = update["$set"]["avaliacao"]
            return {
                "_id": ObjectId(appointment_id),
                "paciente_id": ObjectId(patient_id),
                "avaliacao": self.assessment,
            }

    consultations = Consultations()

    class Users:
        def find_one(self, query):
            assert query == {"_id": ObjectId(patient_id)}
            return {"nome": "Maria Souza"}

    class Database:
        def __getitem__(self, name):
            if name == "consultas":
                return consultations
            assert name == "usuarios"
            return Users()

    monkeypatch.setattr(consulta_crud, "get_database", lambda: Database())
    assessment = ConsultaAvaliacaoUpdate(
        idade_anos=30,
        sexo_biologico="feminino",
        peso_kg=70,
        altura_cm=175,
        anotacoes="Registro privado",
    )
    nutritionist = {"id": nutritionist_id}

    result = consulta_crud.salvar_avaliacao_consulta(
        appointment_id,
        assessment,
        nutritionist,
    )

    assert result["paciente_id"] == patient_id
    assert result["anotacoes"] == "Registro privado"
    assert consultations.query == {
        "_id": ObjectId(appointment_id),
        "nutricionista_id": ObjectId(nutritionist_id),
        "status": "confirmada",
    }
    assert consultations.assessment["registrado_em"] == registered_at
    assert consultations.assessment["registrado_por"] == ObjectId(nutritionist_id)
    assert consultations.assessment["imc"] == 22.9


def test_patient_cannot_write_consultation_assessment(client, monkeypatch):
    patient_id = "507f1f77bcf86cd799439011"
    monkeypatch.setattr(
        "security.buscar_usuario",
        lambda *_, **__: {"id": patient_id, "nome": "Maria Souza", "perfil": "paciente"},
    )
    monkeypatch.setattr(
        consulta_router,
        "salvar_avaliacao_consulta",
        lambda *_: pytest.fail("Patient must not reach the assessment write operation."),
    )
    token = create_access_token(patient_id)

    response = client.put(
        "/consultas/507f1f77bcf86cd799439012/avaliacao",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "idade_anos": 30,
            "sexo_biologico": "feminino",
            "peso_kg": 70,
            "altura_cm": 175,
        },
    )

    assert response.status_code == 403


def test_registration_requires_crn_for_nutritionist():
    with pytest.raises(ValidationError):
        UsuarioCreate(
            nome="Ana Nutri",
            email="ana@example.com",
            telefone="61988887777",
            endereco="Rua das Flores, 10",
            cep="70000000",
            estado="df",
            senha="senha-segura-123",
            tipo="nutricionista",
        )


def test_registration_normalizes_empty_crn_for_patient():
    usuario = UsuarioCreate(
        nome="Maria Souza",
        email="maria@example.com",
        cpf="529.982.247-25",
        telefone="61988887777",
        endereco="Rua das Flores, 10",
        cep="70000000",
        estado="DF",
        senha="senha-segura-123",
        tipo="paciente",
        crn="   ",
    )

    assert usuario.crn is None


def test_health_check_confirms_database_connection(client, monkeypatch):
    class Database:
        def command(self, command):
            assert command == "ping"
            return {"ok": 1}

    monkeypatch.setattr(main, "get_database", lambda: Database())
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["database"] == "connected"


def test_production_rejects_example_jwt_secret():
    settings = Settings(
        app_env="production",
        jwt_secret_key="generate-a-unique-secret-key-with-at-least-32-characters",
    )

    with pytest.raises(ValueError):
        settings.validate_production_secrets()


def test_user_update_rejects_empty_name():
    with pytest.raises(ValidationError):
        UsuarioUpdate(nome="  ")


def test_registration_rejects_unknown_state():
    with pytest.raises(ValidationError):
        UsuarioCreate(
            nome="Maria Souza",
            email="maria@example.com",
            telefone="61988887777",
            endereco="Rua das Flores, 10",
            cep="70000000",
            estado="ZZ",
            senha="senha-segura-123",
        )


def test_payment_link_requires_https():
    with pytest.raises(ValidationError):
        UsuarioUpdate(pagseguro_link="http://pag.ae/example")


PATIENT = {"id": "507f1f77bcf86cd799439011", "perfil": "paciente", "nome": "Maria Souza", "ativo": True}
NUTRITIONIST = {"id": "507f1f77bcf86cd799439012", "perfil": "nutricionista", "nome": "Amanda Ribeiro", "ativo": True}
COMMENT = {
    "id": "507f1f77bcf86cd799439013",
    "autor": "Maria",
    "anonimo": False,
    "nota": 5,
    "comentario": "Ótima profissional!",
    "criado_em": "2026-09-01T12:00:00Z",
}


def test_comments_are_public_and_never_expose_patient_ids(client, monkeypatch):
    monkeypatch.setattr(comentario_router, "listar_comentarios", lambda _: [COMMENT])

    response = client.get(f"/comentarios/nutricionista/{NUTRITIONIST['id']}")

    assert response.status_code == 200
    assert response.json()[0]["autor"] == "Maria"
    assert "paciente_id" not in response.json()[0]


def test_patient_without_finished_appointment_cannot_comment(client, monkeypatch):
    main.app.dependency_overrides[comentario_router.get_current_user] = lambda: PATIENT
    monkeypatch.setattr(comentario_router, "paciente_pode_comentar", lambda *_: False)
    try:
        response = client.put(
            f"/comentarios/nutricionista/{NUTRITIONIST['id']}",
            json={"nota": 5, "comentario": "Muito bom"},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403


def test_patient_with_finished_appointment_can_comment(client, monkeypatch):
    saved = []
    main.app.dependency_overrides[comentario_router.get_current_user] = lambda: PATIENT
    monkeypatch.setattr(comentario_router, "paciente_pode_comentar", lambda *_: True)

    def save(patient, nutritionist_id, data):
        saved.append((patient["id"], nutritionist_id, data.nota, data.comentario, data.anonimo))
        return {**COMMENT, "anonimo": True, "autor": "Anônimo"}

    monkeypatch.setattr(comentario_router, "salvar_comentario", save)
    try:
        response = client.put(
            f"/comentarios/nutricionista/{NUTRITIONIST['id']}",
            json={"nota": 4, "comentario": "  Gostei bastante  ", "anonimo": True},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["autor"] == "Anônimo"
    assert saved == [(PATIENT["id"], NUTRITIONIST["id"], 4, "Gostei bastante", True)]


@pytest.mark.parametrize("nota", [0, 6])
def test_comment_rating_must_be_between_one_and_five(client, nota):
    main.app.dependency_overrides[comentario_router.get_current_user] = lambda: PATIENT
    try:
        response = client.put(
            f"/comentarios/nutricionista/{NUTRITIONIST['id']}",
            json={"nota": nota, "comentario": "Comentário"},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 422


def test_nutritionist_cannot_comment(client):
    main.app.dependency_overrides[comentario_router.get_current_user] = lambda: NUTRITIONIST
    try:
        response = client.put(
            f"/comentarios/nutricionista/{NUTRITIONIST['id']}",
            json={"nota": 5, "comentario": "Comentário"},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403


def test_patient_cannot_reply_comments(client):
    main.app.dependency_overrides[comentario_router.get_current_user] = lambda: PATIENT
    try:
        response = client.put(f"/comentarios/{COMMENT['id']}/resposta", json={"texto": "Obrigada!"})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403


def test_nutritionist_replies_only_own_comments(client, monkeypatch):
    main.app.dependency_overrides[comentario_router.get_current_user] = lambda: NUTRITIONIST
    monkeypatch.setattr(comentario_router, "responder_comentario", lambda *_: None)
    try:
        response = client.put(f"/comentarios/{COMMENT['id']}/resposta", json={"texto": "Obrigada!"})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 404


def test_nutritionist_reply_is_returned_with_comment(client, monkeypatch):
    main.app.dependency_overrides[comentario_router.get_current_user] = lambda: NUTRITIONIST
    reply = {"texto": "Obrigada, Maria!", "respondido_em": "2026-09-02T12:00:00Z"}
    monkeypatch.setattr(comentario_router, "responder_comentario", lambda *_: {**COMMENT, "resposta": reply})
    try:
        response = client.put(f"/comentarios/{COMMENT['id']}/resposta", json={"texto": "Obrigada, Maria!"})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["resposta"]["texto"] == "Obrigada, Maria!"


def test_anonymous_comment_hides_patient_name():
    from crud.comentario_crud import _serializar

    comment = {
        "_id": ObjectId(COMMENT["id"]),
        "anonimo": True,
        "nota": 3,
        "comentario": "Ok",
        "criado_em": datetime(2026, 9, 1, tzinfo=timezone.utc),
    }

    assert _serializar(comment, "Maria Souza")["autor"] == "Anônimo"
    assert _serializar({**comment, "anonimo": False}, "Maria Souza")["autor"] == "Maria"


def test_meal_accepts_several_foods_each_with_substitutions():
    from schemas.plano_schema import RefeicaoPlano

    meal = RefeicaoPlano(
        horario="07:00",
        nome="Café da manhã",
        alimentos=[
            {
                "nome": "Cuscuz",
                "quantidade": 100,
                "medida": "g",
                "calorias": 112,
                "substituicoes": [{"nome": "Pão francês", "quantidade": 1, "medida": "unidade", "calorias": 150}],
            },
            {"nome": "Café sem açúcar", "quantidade": 1, "medida": "xícara", "calorias": 5},
            {"nome": "Banana", "quantidade": 1, "medida": "unidade", "calorias": 90},
        ],
    )

    assert [food.nome for food in meal.alimentos] == ["Cuscuz", "Café sem açúcar", "Banana"]
    assert meal.alimentos[0].substituicoes[0].nome == "Pão francês"
    assert meal.alimentos[1].substituicoes == []


def test_meal_in_old_format_becomes_main_food_with_substitutions():
    from schemas.plano_schema import RefeicaoPlano

    meal = RefeicaoPlano(
        horario="07:00",
        nome="Café da manhã",
        opcoes=[
            {"nome": "Aveia", "quantidade": 40, "medida": "g", "calorias": 150},
            {"nome": "Granola", "quantidade": 30, "medida": "g", "calorias": 130},
        ],
    )

    assert len(meal.alimentos) == 1
    assert meal.alimentos[0].nome == "Aveia"
    assert meal.alimentos[0].substituicoes[0].nome == "Granola"
    assert "opcoes" not in meal.model_dump()


def test_meal_requires_at_least_one_food():
    from schemas.plano_schema import RefeicaoPlano

    with pytest.raises(ValidationError):
        RefeicaoPlano(horario="07:00", nome="Café da manhã", alimentos=[])


REPORT_2022 = {
    "sexo_biologico": "feminino",
    "idade_anos": 18,
    "peso_kg": 46,
    "altura_cm": 155,
    "dobras": {
        "tricipital": 30, "abdominal": 10, "subescapular": 15, "axilar_media": 16,
        "coxa": 35, "toracica": 22, "suprailiaca": 13,
    },
    "circunferencias": {"braco_relaxado": 19, "quadril": 77, "abdomen": 59},
}


def test_anthropometry_matches_reference_report():
    from antropometria import calcular_resultados

    results = calcular_resultados(REPORT_2022)

    assert results["imc"] == 19.1
    assert results["classificacao_imc"] == "Adequado"
    assert results["soma_dobras_metodo_mm"] == 141
    assert round(results["densidade_corporal"], 2) == 1.04
    assert 25 <= results["percentual_gordura"] <= 27
    assert results["cmb_cm"] == 9.6
    assert results["classificacao_cmb"] == "Desnutrição grave"
    assert results["massa_residual_kg"] == 9.6
    assert results["metodo_gordura"].startswith("Jackson & Pollock (7 dobras)")
    assert round(results["massa_gordura_kg"] + results["massa_livre_gordura_kg"], 1) == 46


def test_waist_hip_ratio_uses_age_and_sex_table():
    from antropometria import calcular_resultados

    results = calcular_resultados({**REPORT_2022, "circunferencias": {"cintura": 53, "quadril": 66}})

    assert results["rcq"] == 0.8
    assert results["risco_rcq"] == "Alto"
    assert results["rce"] == 0.34
    assert results["risco_rce"] == "Adequado"


def test_body_fat_uses_three_skinfolds_when_seven_are_missing():
    from antropometria import calcular_resultados

    results = calcular_resultados({
        **REPORT_2022,
        "sexo_biologico": "masculino",
        "dobras": {"toracica": 10, "abdominal": 20, "coxa": 15},
    })

    assert results["metodo_gordura"].startswith("Jackson & Pollock (3 dobras)")
    assert results["percentual_gordura"] is not None


def test_body_fat_is_not_estimated_without_enough_skinfolds():
    from antropometria import calcular_resultados

    results = calcular_resultados({**REPORT_2022, "dobras": {"tricipital": 30}})

    assert results["percentual_gordura"] is None
    assert results["massa_gordura_kg"] is None
    assert results["soma_dobras_mm"] == 30


def test_total_energy_expenditure_uses_activity_level():
    from antropometria import calcular_resultados

    medida = {**REPORT_2022, "sexo_biologico": "feminino", "idade_anos": 30, "peso_kg": 70, "altura_cm": 165}
    sem_atividade = calcular_resultados(medida)
    moderada = calcular_resultados({**medida, "nivel_atividade": "moderado"})

    assert sem_atividade["tmb_kcal"] == 1420
    assert sem_atividade["get_kcal"] is None
    assert moderada["fator_atividade"] == 1.55
    assert moderada["get_kcal"] == 2201


def test_nutritionist_registers_measurements_for_linked_patient(client, monkeypatch):
    main.app.dependency_overrides[medida_router.require_nutritionist] = lambda: NUTRITIONIST
    monkeypatch.setattr(medida_router, "paciente_vinculado", lambda *_: True)
    saved = []

    def create(patient_id, nutritionist_id, measurement):
        saved.append((patient_id, nutritionist_id, measurement.peso_kg, measurement.dobras.tricipital))
        return {
            **REPORT_2022,
            "data_avaliacao": "2026-10-01",
            "observacoes": "",
            "id": "507f1f77bcf86cd799439020",
            "paciente_id": patient_id,
            "nutricionista_id": nutritionist_id,
            "nutricionista_nome": "Amanda Ribeiro",
            "dobras": {},
            "circunferencias": {},
            "resultados": {"imc": 19.1, "classificacao_imc": "Adequado"},
        }

    monkeypatch.setattr(medida_router, "criar_medida", create)
    try:
        response = client.post(f"/medidas/paciente/{PATIENT['id']}", json={**REPORT_2022, "data_avaliacao": "2026-10-01"})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["nutricionista_nome"] == "Amanda Ribeiro"
    assert saved == [(PATIENT["id"], NUTRITIONIST["id"], 46, 30)]


def test_nutritionist_cannot_register_measurements_for_unlinked_patient(client, monkeypatch):
    main.app.dependency_overrides[medida_router.require_nutritionist] = lambda: NUTRITIONIST
    monkeypatch.setattr(medida_router, "paciente_vinculado", lambda *_: False)
    try:
        response = client.post(f"/medidas/paciente/{PATIENT['id']}", json={**REPORT_2022, "data_avaliacao": "2026-10-01"})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403


def test_measurement_date_cannot_be_in_the_future(client, monkeypatch):
    main.app.dependency_overrides[medida_router.require_nutritionist] = lambda: NUTRITIONIST
    monkeypatch.setattr(medida_router, "paciente_vinculado", lambda *_: True)
    try:
        response = client.post(f"/medidas/paciente/{PATIENT['id']}", json={**REPORT_2022, "data_avaliacao": "2999-01-01"})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 422


def test_patient_cannot_register_measurements(client):
    main.app.dependency_overrides[medida_router.get_current_user] = lambda: PATIENT
    try:
        response = client.post(f"/medidas/paciente/{PATIENT['id']}", json={**REPORT_2022, "data_avaliacao": "2026-10-01"})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403


def test_patient_sees_own_measurements(client, monkeypatch):
    main.app.dependency_overrides[medida_router.get_current_user] = lambda: PATIENT
    monkeypatch.setattr(medida_router, "listar_medidas", lambda patient_id: [])
    try:
        response = client.get("/medidas/minhas")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200


def test_nutritionist_only_sees_linked_patient_measurements(client, monkeypatch):
    main.app.dependency_overrides[medida_router.require_nutritionist] = lambda: NUTRITIONIST
    monkeypatch.setattr(medida_router, "paciente_vinculado", lambda *_: False)
    try:
        response = client.get(f"/medidas/paciente/{PATIENT['id']}")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403



RECIPE = {
    "titulo": "Panqueca de banana",
    "categoria": "Café da manhã",
    "tempo_preparo_min": 15,
    "porcoes": 2,
    "ingredientes": [
        {"nome": "Banana, prata, crua", "alimento_id": "taco-182", "medida": "1 unidade", "gramas": 100},
        {"nome": "Ovo, de galinha, inteiro, cru", "alimento_id": "taco-489", "medida": "2 unidades", "gramas": 100},
        {"nome": " Canela a gosto "},
    ],
    "modo_preparo": "Amasse a banana, misture os ovos e doure dos dois lados.",
    "planos_ids": ["507f1f77bcf86cd799439030", "507f1f77bcf86cd799439030"],
}


def test_nutritionist_creates_recipe_linked_to_plan(client, monkeypatch):
    main.app.dependency_overrides[receita_router.require_nutritionist] = lambda: NUTRITIONIST
    saved = []

    def create(nutritionist_id, recipe):
        saved.append((nutritionist_id, [item.nome for item in recipe.ingredientes], recipe.planos_ids))
        return {
            **recipe.model_dump(exclude={"planos_ids", "ingredientes"}),
            **receita_crud.calcular_nutricao([item.model_dump() for item in recipe.ingredientes], recipe.porcoes),
            "id": "507f1f77bcf86cd799439040",
            "nutricionista_id": nutritionist_id,
            "nutricionista_nome": "Amanda Ribeiro",
            "planos": [{"id": "507f1f77bcf86cd799439030", "titulo": "Plano leve", "paciente_nome": "Maria Souza"}],
            "criada_em": "2026-10-08T12:00:00Z",
        }

    monkeypatch.setattr(receita_router, "criar_receita", create)
    try:
        response = client.post("/receitas", json=RECIPE)
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["planos"][0]["titulo"] == "Plano leve"
    assert saved == [(NUTRITIONIST["id"], ["Banana, prata, crua", "Ovo, de galinha, inteiro, cru", "Canela a gosto"], ["507f1f77bcf86cd799439030"])]


def test_recipe_cannot_be_linked_to_another_nutritionist_plan(client, monkeypatch):
    main.app.dependency_overrides[receita_router.require_nutritionist] = lambda: NUTRITIONIST
    def reject(*_):
        raise ValueError("Vincule a receita apenas a planos alimentares seus.")

    monkeypatch.setattr(receita_router, "criar_receita", reject)
    try:
        response = client.post("/receitas", json=RECIPE)
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 422


def test_patient_cannot_create_recipe(client):
    main.app.dependency_overrides[receita_router.get_current_user] = lambda: PATIENT
    try:
        response = client.post("/receitas", json=RECIPE)
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403


def test_patient_only_sees_recipes_from_own_plans(monkeypatch):
    plan_id = ObjectId("507f1f77bcf86cd799439030")
    queries = []

    class Cursor(list):
        def sort(self, *_):
            return self

    class Plans:
        def find(self, query, *_):
            queries.append(("planos", query))
            if query == {"paciente_id": ObjectId(PATIENT["id"])}:
                return [{"_id": plan_id}]
            return [{"_id": plan_id, "titulo": "Plano leve", "paciente_id": ObjectId(PATIENT["id"])}]

    class Recipes:
        def find(self, query):
            queries.append(("receitas", query))
            return Cursor([{
                **{chave: valor for chave, valor in RECIPE.items() if chave != "planos_ids"},
                "_id": ObjectId("507f1f77bcf86cd799439040"),
                "nutricionista_id": ObjectId(NUTRITIONIST["id"]),
                "planos_ids": [plan_id],
                "criada_em": datetime(2026, 10, 8, tzinfo=timezone.utc),
            }])

    class Users:
        def find(self, *_):
            return [
                {"_id": ObjectId(NUTRITIONIST["id"]), "nome": "Amanda Ribeiro"},
                {"_id": ObjectId(PATIENT["id"]), "nome": "Maria Souza"},
            ]

    class Database:
        def __getitem__(self, name):
            return {"planos": Plans(), "receitas": Recipes(), "usuarios": Users()}[name]

    monkeypatch.setattr(receita_crud, "get_database", lambda: Database())

    recipes = receita_crud.listar_receitas(PATIENT)

    assert ("receitas", {"planos_ids": {"$in": [plan_id]}}) in queries
    assert recipes[0]["planos"] == [{"id": str(plan_id), "titulo": "Plano leve", "paciente_nome": "Maria Souza"}]
    assert recipes[0]["nutricionista_nome"] == "Amanda Ribeiro"


def test_recipe_nutrition_is_calculated_from_taco():
    result = receita_crud.calcular_nutricao(RECIPE["ingredientes"], 2)

    assert result["ingredientes_calculados"] == 2
    assert result["nutricao_total"]["energia_kcal"] == 241.4
    assert result["nutricao_total"]["proteina_g"] == 14.3
    assert result["nutricao_total"]["sodio_mg"] == 167.9
    assert result["nutricao_porcao"]["energia_kcal"] == 120.7
    assert result["ingredientes"][0]["energia_kcal"] == 98.2
    assert result["ingredientes"][2]["energia_kcal"] is None


def test_recipe_rejects_food_outside_taco(client):
    main.app.dependency_overrides[receita_router.require_nutritionist] = lambda: NUTRITIONIST
    try:
        response = client.post("/receitas", json={
            **RECIPE,
            "planos_ids": [],
            "ingredientes": [{"nome": "Inexistente", "alimento_id": "taco-999999", "gramas": 50}],
        })
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 422
    assert "TACO" in response.json()["detail"]


def test_taco_ingredient_requires_grams():
    with pytest.raises(ValidationError):
        ReceitaSalvar(**{**RECIPE, "ingredientes": [{"nome": "Banana", "alimento_id": "taco-182"}]})


def _nomes_encontrados(client, busca):
    response = client.get("/alimentos", params={"busca": busca, "limit": 100})
    assert response.status_code == 200
    return [food["name"] for food in response.json()["items"]]


def test_food_search_shows_taco_name_for_popular_synonym(client):
    nomes = _nomes_encontrados(client, "tapioca")

    assert nomes[0] == "Tapioca, com manteiga"
    assert "Fécula, de mandioca" in nomes
    assert "Polvilho, doce" in nomes


def test_food_search_accepts_words_in_any_order(client):
    nomes = _nomes_encontrados(client, "peito de frango")

    assert nomes
    assert all("Frango" in nome and "peito" in nome for nome in nomes)


def test_food_search_regional_names(client):
    assert "Mandioca, cozida" in _nomes_encontrados(client, "macaxeira")
    assert "Batata, baroa, cozida" in _nomes_encontrados(client, "mandioquinha")
    assert "Toucinho, frito" in _nomes_encontrados(client, "bacon")
    assert "Fécula, de mandioca" in _nomes_encontrados(client, "goma de tapioca")


def test_catalog_includes_ibge_household_measures(client):
    response = client.get("/alimentos/taco-489")

    assert response.status_code == 200
    portions = {portion["label"]: portion["gram_weight"] for portion in response.json()["portions"]}
    assert portions["100 g (base TACO)"] == 100
    assert portions["Unidade · 45 g"] == 45


def test_nutritionist_registers_own_household_measure(client, monkeypatch):
    main.app.dependency_overrides[alimento_router.require_nutritionist] = lambda: NUTRITIONIST
    saved = []

    def create(nutritionist_id, food_id, measure):
        saved.append((nutritionist_id, food_id, measure.rotulo, measure.gramas))
        return {"id": "507f1f77bcf86cd799439050", "alimento_id": food_id, "rotulo": measure.rotulo, "gramas": measure.gramas}

    monkeypatch.setattr(alimento_router, "criar_medida_caseira", create)
    try:
        response = client.post("/alimentos/taco-146/medidas", json={"rotulo": "  colher de sopa   cheia ", "gramas": 12})
        missing = client.post("/alimentos/taco-999999/medidas", json={"rotulo": "Colher", "gramas": 12})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 201
    assert saved == [(NUTRITIONIST["id"], "taco-146", "Colher de sopa cheia", 12)]
    assert missing.status_code == 404


def test_patient_cannot_register_household_measure(client):
    import security

    main.app.dependency_overrides[security.get_current_user] = lambda: PATIENT
    try:
        response = client.post("/alimentos/taco-146/medidas", json={"rotulo": "Colher", "gramas": 12})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403


def test_body_fat_uses_chosen_pollock_protocol():
    from antropometria import calcular_resultados

    sete = calcular_resultados({**REPORT_2022, "protocolo_gordura": "pollock7"})
    tres = calcular_resultados({**REPORT_2022, "protocolo_gordura": "pollock3"})

    assert sete["protocolo_gordura"] == "pollock7"
    assert sete["metodo_gordura"].startswith("Jackson & Pollock (7 dobras)")
    assert tres["protocolo_gordura"] == "pollock3"
    assert tres["metodo_gordura"].startswith("Jackson & Pollock (3 dobras)")
    assert sete["percentual_gordura"] == sete["percentual_gordura_pollock7"]
    assert tres["percentual_gordura"] == tres["percentual_gordura_pollock3"]
    assert sete["percentual_gordura_pollock3"] == tres["percentual_gordura"]
    assert sete["percentual_gordura"] != tres["percentual_gordura"]


def test_chosen_protocol_reports_missing_skinfolds():
    from antropometria import calcular_resultados

    results = calcular_resultados({
        **REPORT_2022,
        "protocolo_gordura": "pollock7",
        "dobras": {"tricipital": 20, "suprailiaca": 18, "coxa": 25},
    })

    assert results["percentual_gordura"] is None
    assert results["percentual_gordura_pollock3"] is not None
    assert results["dobras_faltando"] == ["torácica", "axilar média", "subescapular", "abdominal"]


def test_plan_food_keeps_household_measure_and_calculates_from_grams():
    option = OpcaoAlimento(
        nome="Arroz",
        quantidade=75,
        medida="g",
        calorias=0,
        alimento_id="taco-5",
        quantidade_caseira=3,
        medida_caseira="Colher de sopa",
    )

    assert option.quantidade_caseira == 3
    assert option.medida_caseira == "Colher de sopa"
    assert option.medida == "g"
    assert option.calorias > 0


def test_linked_patient_sends_message_to_nutritionist(client, monkeypatch):
    main.app.dependency_overrides[mensagem_router.get_current_user] = lambda: PATIENT
    monkeypatch.setattr(mensagem_router, "pode_conversar", lambda *_: True)
    sent = []

    def send(user, contact_id, text):
        sent.append((user["id"], contact_id, text))
        return {
            "id": "507f1f77bcf86cd799439060",
            "remetente_id": user["id"],
            "destinatario_id": contact_id,
            "texto": text,
            "criada_em": "2026-10-08T12:00:00Z",
            "lida_em": None,
            "minha": True,
        }

    monkeypatch.setattr(mensagem_router, "enviar_mensagem", send)
    try:
        response = client.post(f"/mensagens/{NUTRITIONIST['id']}", json={"texto": "  Posso trocar o almoço?  "})
        empty = client.post(f"/mensagens/{NUTRITIONIST['id']}", json={"texto": "   "})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 201
    assert sent == [(PATIENT["id"], NUTRITIONIST["id"], "Posso trocar o almoço?")]
    assert empty.status_code == 422


def test_message_requires_link_between_patient_and_nutritionist(client, monkeypatch):
    main.app.dependency_overrides[mensagem_router.get_current_user] = lambda: PATIENT
    monkeypatch.setattr(mensagem_router, "pode_conversar", lambda *_: False)
    try:
        response = client.post(f"/mensagens/{NUTRITIONIST['id']}", json={"texto": "Oi"})
        history = client.get(f"/mensagens/{NUTRITIONIST['id']}")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403
    assert history.status_code == 403


def test_admin_cannot_use_chat(client):
    main.app.dependency_overrides[mensagem_router.get_current_user] = lambda: {**PATIENT, "perfil": "administrador"}
    try:
        response = client.get("/mensagens/conversas")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403


def test_chat_link_comes_from_confirmed_consultation_or_plan(monkeypatch):
    patient_id = ObjectId(PATIENT["id"])
    nutritionist_id = ObjectId(NUTRITIONIST["id"])
    other_id = ObjectId("507f1f77bcf86cd799439099")

    class Consultations:
        def find(self, query, *_):
            assert query["status"] == "confirmada"
            return [{"paciente_id": patient_id, "nutricionista_id": nutritionist_id}]

    class Plans:
        def find(self, query, *_):
            return []

    class Database:
        def __getitem__(self, name):
            return {"consultas": Consultations(), "planos": Plans()}[name]

    monkeypatch.setattr(mensagem_crud, "get_database", lambda: Database())

    assert mensagem_crud.pode_conversar(PATIENT, NUTRITIONIST["id"])
    assert mensagem_crud.pode_conversar(NUTRITIONIST, PATIENT["id"])
    assert not mensagem_crud.pode_conversar(PATIENT, str(other_id))
    assert not mensagem_crud.pode_conversar(PATIENT, "invalido")


def test_opening_conversation_marks_received_messages_as_read(monkeypatch):
    updates = []
    message = {
        "_id": ObjectId("507f1f77bcf86cd799439061"),
        "remetente_id": ObjectId(NUTRITIONIST["id"]),
        "destinatario_id": ObjectId(PATIENT["id"]),
        "texto": "Bom dia!",
        "criada_em": datetime(2026, 10, 8, 12, tzinfo=timezone.utc),
        "lida_em": None,
    }

    class Cursor(list):
        def sort(self, *_):
            return self

        def limit(self, *_):
            return self

    class Messages:
        def update_many(self, query, change):
            updates.append(query)

        def find(self, *_):
            return Cursor([message])

    class Database:
        def __getitem__(self, name):
            assert name == "mensagens"
            return Messages()

    monkeypatch.setattr(mensagem_crud, "get_database", lambda: Database())

    messages = mensagem_crud.listar_mensagens(PATIENT, NUTRITIONIST["id"])

    assert updates == [{"remetente_id": ObjectId(NUTRITIONIST["id"]), "destinatario_id": ObjectId(PATIENT["id"]), "lida_em": None}]
    assert messages[0]["texto"] == "Bom dia!"
    assert messages[0]["minha"] is False


def test_login_is_blocked_after_repeated_failures(client, monkeypatch):
    from routers import auth_router

    monkeypatch.setattr(auth_router, "buscar_usuario_com_senha", lambda _: {"_id": ObjectId(PATIENT["id"]), "senha_hash": "x", "ativo": True})
    monkeypatch.setattr(auth_router, "verify_password", lambda senha, _: senha == "correta123")
    respostas = [client.post("/auth/login", json={"email": "maria@teste.com", "senha": "errada"}).status_code for _ in range(5)]
    bloqueada = client.post("/auth/login", json={"email": "maria@teste.com", "senha": "correta123"})

    assert respostas == [401] * 5
    assert bloqueada.status_code == 429
    assert "Retry-After" in bloqueada.headers


def test_login_checks_password_even_when_email_does_not_exist(client, monkeypatch):
    from routers import auth_router

    verificados = []
    monkeypatch.setattr(auth_router, "buscar_usuario_com_senha", lambda _: None)
    monkeypatch.setattr(auth_router, "verify_password", lambda senha, hash_: verificados.append(hash_) or False)
    response = client.post("/auth/login", json={"email": "ninguem@teste.com", "senha": "qualquer"})

    assert response.status_code == 401
    assert verificados == [auth_router.SENHA_FICTICIA]


def test_tokens_issued_before_password_change_are_rejected(monkeypatch):
    import security
    from fastapi import HTTPException
    from fastapi.security import HTTPAuthorizationCredentials

    token = create_access_token(PATIENT["id"])
    momento = datetime.now(timezone.utc)
    monkeypatch.setattr(
        "security.buscar_usuario",
        lambda *_, **__: {**PATIENT, "senha_alterada_em": momento.replace(year=momento.year + 1)},
    )
    with pytest.raises(HTTPException) as erro:
        security.get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token))
    assert erro.value.status_code == 401

    monkeypatch.setattr(
        "security.buscar_usuario",
        lambda *_, **__: {**PATIENT, "senha_alterada_em": momento.replace(year=momento.year - 1)},
    )
    usuario = security.get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token))
    assert usuario["id"] == PATIENT["id"]
    assert "senha_alterada_em" not in usuario


def test_api_sends_security_headers(client):
    response = client.get("/alimentos/categorias")

    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"


def test_listing_plans_fetches_names_in_a_single_query(monkeypatch):
    patient_id = ObjectId(PATIENT["id"])
    nutritionist_id = ObjectId(NUTRITIONIST["id"])
    calls = {"find": 0, "find_one": 0}

    class Cursor(list):
        def sort(self, *_):
            return self

    class Plans:
        def find(self, *_):
            return Cursor([
                {"_id": ObjectId(), "paciente_id": patient_id, "nutricionista_id": nutritionist_id, "titulo": f"Plano {n}",
                 "descricao": "d", "refeicoes": []}
                for n in range(3)
            ])

    class Users:
        def find(self, *_):
            calls["find"] += 1
            return [{"_id": patient_id, "nome": "Maria Souza"}, {"_id": nutritionist_id, "nome": "Amanda Ribeiro"}]

        def find_one(self, *_):
            calls["find_one"] += 1
            return None

    class Database:
        def __getitem__(self, name):
            return {"planos": Plans(), "usuarios": Users()}[name]

    monkeypatch.setattr(plano_crud, "get_database", lambda: Database())

    plans = plano_crud.listar_planos(NUTRITIONIST)

    assert calls == {"find": 1, "find_one": 0}
    assert [plan["paciente_nome"] for plan in plans] == ["Maria Souza"] * 3


def test_patient_fills_own_anamnesis(client, monkeypatch):
    main.app.dependency_overrides[anamnese_router.get_current_user] = lambda: PATIENT
    saved = []

    def save(patient_id, user, anamnesis):
        saved.append((patient_id, user["perfil"], anamnesis.objetivo, anamnesis.restricoes))
        return {**anamnesis.model_dump(), "paciente_id": patient_id, "preenchida": True}

    monkeypatch.setattr(anamnese_router, "salvar_anamnese", save)
    try:
        response = client.put("/anamnese/minha", json={"objetivo": "  Emagrecer  ", "restricoes": ["sem_lactose"], "horario_acorda": "06:30"})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert saved == [(PATIENT["id"], "paciente", "Emagrecer", ["sem_lactose"])]


def test_anamnesis_rejects_invalid_values(client):
    main.app.dependency_overrides[anamnese_router.get_current_user] = lambda: PATIENT
    try:
        response = client.put("/anamnese/minha", json={"horario_acorda": "25:00", "qualidade_sono": "otima"})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 422


def test_nutritionist_cannot_read_unlinked_patient_anamnesis(client, monkeypatch):
    main.app.dependency_overrides[anamnese_router.require_nutritionist] = lambda: NUTRITIONIST
    monkeypatch.setattr(anamnese_router, "paciente_vinculado", lambda *_: False)
    try:
        response = client.get(f"/anamnese/paciente/{PATIENT['id']}")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403


def test_nutritionist_cannot_use_patient_anamnesis_route(client):
    main.app.dependency_overrides[anamnese_router.get_current_user] = lambda: NUTRITIONIST
    try:
        response = client.get("/anamnese/minha")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403


def test_patient_save_keeps_nutritionist_notes_private(monkeypatch):
    from schemas.anamnese_schema import AnamneseSalvar

    stored = {"paciente_id": ObjectId(PATIENT["id"]), "observacoes_nutricionista": "Investigar resistência à insulina."}

    class Anamneses:
        def find_one_and_update(self, query, update, upsert, return_document):
            stored.update(update["$set"])
            return stored

        def find_one(self, query):
            return stored

    monkeypatch.setattr(anamnese_crud, "get_database", lambda: {"anamneses": Anamneses()})

    patient_view = anamnese_crud.salvar_anamnese(PATIENT["id"], PATIENT, AnamneseSalvar(objetivo="Ganhar massa", observacoes_nutricionista="tentativa"))
    nutritionist_view = anamnese_crud.buscar_anamnese(PATIENT["id"], "nutricionista")

    assert patient_view["observacoes_nutricionista"] == ""
    assert patient_view["atualizada_por_perfil"] == "paciente"
    assert nutritionist_view["observacoes_nutricionista"] == "Investigar resistência à insulina."
    assert nutritionist_view["objetivo"] == "Ganhar massa"
