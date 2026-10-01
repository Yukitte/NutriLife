from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pymongo.errors import ServerSelectionTimeoutError

from database.connection import get_client, get_database
from routers.alimento_router import router as alimento_router
from routers.auth_router import router as auth_router
from routers.consulta_router import router as consulta_router
from routers.plano_router import router as plano_router
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
    database["planos"].create_index(
        [("paciente_id", 1), ("nutricionista_id", 1)],
        name="plans_by_patient_and_nutritionist",
    )
    database["consultas"].create_index(
        [("nutricionista_id", 1), ("inicio", 1)],
        unique=True,
        partialFilterExpression={
            "status": {"$in": ["pendente_pagamento", "confirmada"]}
        },
        name="unique_active_appointment_slot",
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield
    get_client().close()


app = FastAPI(title="NutriLife API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth_router)
app.include_router(alimento_router)
app.include_router(usuario_router)
app.include_router(plano_router)
app.include_router(consulta_router)


@app.get("/health", tags=["Sistema"])
def health_check():
    try:
        get_database().command("ping")
    except ServerSelectionTimeoutError as error:
        raise HTTPException(status_code=503, detail="Banco de dados indisponível.") from error
    return {"status": "ok", "database": "connected"}
