from datetime import datetime, timezone

import jwt
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from pydantic import ValidationError

import main
from crud import consulta_crud
from crud import plano_crud
from crud import usuario_crud
from crud.usuario_crud import _serializar_profissional
from routers import admin_router, alimento_router, auth_router, comentario_router, consulta_router, usuario_router
from schemas.consulta_schema import (
    ConsultaAvaliacaoUpdate,
    ConsultaConfirmar,
    ConsultaCreate,
    DisponibilidadeUpdate,
)
from schemas.plano_schema import OpcaoAlimento, PlanoUpdate
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
        lambda _: {
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
        lambda _: {"id": patient_id, "nome": "Maria Souza", "perfil": "paciente"},
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
        lambda _: {
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
        lambda _: {
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
        lambda _: {"id": patient_id, "nome": "Maria Souza", "perfil": "paciente"},
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
        lambda _: {"id": patient_id, "nome": "Maria Souza", "perfil": "paciente"},
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

