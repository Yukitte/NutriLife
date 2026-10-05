from fastapi import FastAPI
import os
from pymongo import MongoClient

app = FastAPI(title="NutriLife API")

@app.on_event("startup")
def startup_db_client():
    client = MongoClient(os.getenv("MONGODB_URI"))
    db = client[os.getenv("MONGODB_DATABASE")]

@app.get("/api/planos-alimentares/meu-plano/{paciente_id}")
def get_plano(paciente_id: str):
    client = MongoClient(os.getenv("MONGODB_URI"))
    db = client[os.getenv("MONGODB_DATABASE")]
    from bson.objectid import ObjectId
    plano = db.planos_alimentares.find_one({"paciente_id": ObjectId(paciente_id)})
    
    if plano:
        plano["_id"] = str(plano["_id"]) # Converte ObjectId para string JSON
        plano["paciente_id"] = str(plano["paciente_id"])
        plano["nutricionista_id"] = str(plano["nutricionista_id"])
        return plano
    return {"erro": "Plano não encontrado"}