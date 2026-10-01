import jwt
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

import main
from crud.usuario_crud import _serializar_profissional
from routers import alimento_router, auth_router, usuario_router
from schemas.consulta_schema import DisponibilidadeUpdate
from schemas.plano_schema import OpcaoAlimento
from schemas.usuario_schema import UsuarioCreate, UsuarioUpdate
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
            "telefone": "61988887777",
            "endereco": "Rua das Flores, 10",
            "cep": "70000000",
            "estado": "DF",
            "senha": "senha-segura-123",
            "tipo": "paciente",
        },
    )

    assert response.status_code == 201
    assert response.json()["usuario"]["perfil"] == "paciente"
    assert "senha" not in response.json()["usuario"]
    assert created_users[0][1] == "hashed"


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


@pytest.mark.parametrize("path", ["/usuarios", "/planos"])
def test_private_resources_require_authentication(client, path):
    response = client.get(path)

    assert response.status_code == 401


def test_appointment_list_requires_authentication(client):
    assert client.get("/consultas").status_code == 401


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
