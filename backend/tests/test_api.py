from datetime import datetime, timezone

import jwt
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from pydantic import ValidationError

import main
from crud import consulta_crud
from crud.usuario_crud import _serializar_profissional
from routers import alimento_router, auth_router, consulta_router, usuario_router
from schemas.consulta_schema import (
    ConsultaAvaliacaoUpdate,
    ConsultaConfirmar,
    ConsultaCreate,
    DisponibilidadeUpdate,
)
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
            "crn": "",
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
