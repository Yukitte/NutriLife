from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pymongo.errors import ServerSelectionTimeoutError

from database.connection import get_client, get_database
from routers.admin_router import router as admin_router
from routers.anamnese_router import router as anamnese_router
from routers.alimento_router import router as alimento_router
from routers.auth_router import router as auth_router
from routers.comentario_router import router as comentario_router
from routers.consulta_router import router as consulta_router
from routers.medida_router import router as medida_router
from routers.mensagem_router import router as mensagem_router
from routers.plano_router import router as plano_router
from routers.receita_router import router as receita_router
from routers.usuario_router import router as usuario_router
from settings import get_settings

settings = get_settings()


def initialize_database() -> None:
    database = get_database()
    users = database["usuarios"]
    users.update_many(
        {"perfil": {"$exists": False}, "tipo": {"$in": ["NUTRICIONISTA", "nutricionista"]}},
        {"$set": {"perfil": "nutricionista"}},
    )
    users.update_many(
        {"perfil": {"$exists": False}, "tipo": {"$in": ["PACIENTE", "paciente"]}},
        {"$set": {"perfil": "paciente"}},
    )
    for user in users.find({"email": {"$type": "string"}}, {"email": 1}):
        normalized_email = user["email"].strip().lower()
        if normalized_email != user["email"]:
            users.update_one(
                {"_id": user["_id"]},
                {"$set": {"email": normalized_email}},
            )
    users.create_index("email", unique=True, name="unique_user_email")
    users.create_index(
        "cpf_hash",
        unique=True,
        partialFilterExpression={"cpf_hash": {"$type": "string"}},
        name="unique_user_cpf",
    )
    database["anamneses"].create_index("paciente_id", unique=True, name="unique_anamnesis_patient")
    database["medidas_antropometricas"].create_index(
        [("paciente_id", 1), ("data_avaliacao", 1)],
        name="measurements_by_patient_and_date",
    )
    database["comentarios"].create_index(
        [("paciente_id", 1), ("nutricionista_id", 1)],
        unique=True,
        name="unique_comment_per_patient_and_nutritionist",
    )
    database["comentarios"].create_index(
        [("nutricionista_id", 1), ("criado_em", -1)],
        name="comments_by_nutritionist",
    )
    database["planos"].create_index(
        [("paciente_id", 1), ("nutricionista_id", 1)],
        name="plans_by_patient_and_nutritionist",
    )
    database["receitas"].create_index(
        [("nutricionista_id", 1), ("titulo", 1)],
        name="recipes_by_nutritionist",
    )
    database["receitas"].create_index("planos_ids", name="recipes_by_plan")
    database["mensagens"].create_index(
        [("remetente_id", 1), ("destinatario_id", 1), ("criada_em", -1)],
        name="messages_by_conversation",
    )
    database["mensagens"].create_index(
        [("destinatario_id", 1), ("lida_em", 1)],
        name="unread_messages_by_recipient",
    )
    database["medidas_caseiras"].create_index(
        [("nutricionista_id", 1), ("alimento_id", 1), ("rotulo", 1)],
        unique=True,
        name="unique_household_measure_per_nutritionist",
    )
    database["consultas"].create_index(
        [("paciente_id", 1), ("inicio", 1)],
        name="appointments_by_patient",
    )
    database["planos"].create_index(
        [("nutricionista_id", 1), ("_id", -1)],
        name="plans_by_nutritionist",
    )
    database["consultas"].create_index(
        [("nutricionista_id", 1), ("inicio", 1)],
        unique=True,
        partialFilterExpression={
            "status": {
                "$in": ["pendente_pagamento", "pendente_confirmacao", "confirmada"]
            }
        },
        name="unique_active_appointment_slot_v2",
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield
    get_client().close()


producao = settings.app_env.lower() == "production"
app = FastAPI(
    title="NutriLife API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if producao else "/docs",
    redoc_url=None if producao else "/redoc",
    openapi_url=None if producao else "/openapi.json",
)


@app.middleware("http")
async def cabecalhos_de_seguranca(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if not request.url.path.startswith(("/docs", "/redoc", "/openapi.json", "/alimentos")):
        response.headers.setdefault("Cache-Control", "no-store")
    if producao:
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(alimento_router)
app.include_router(usuario_router)
app.include_router(plano_router)
app.include_router(consulta_router)
app.include_router(comentario_router)
app.include_router(medida_router)
app.include_router(receita_router)
app.include_router(mensagem_router)
app.include_router(anamnese_router)


@app.get("/health", tags=["Sistema"])
def health_check():
    try:
        get_database().command("ping")
    except ServerSelectionTimeoutError as error:
        raise HTTPException(status_code=503, detail="Banco de dados indisponível.") from error
    return {"status": "ok", "database": "connected"}
