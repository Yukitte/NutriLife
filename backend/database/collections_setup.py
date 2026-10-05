import os
from pymongo import MongoClient
from datetime import datetime

# Substitua pela sua string de conexão do MongoDB Atlas
# Ficará assim (substituindo apenas o final pelo seu cluster):
import dotenv
dotenv.load_dotenv()

def setup_database():
    print("Conectando ao MongoDB...")
    client = MongoClient(os.getenv("MONGODB_URI"))
    db = client[os.getenv("MONGODB_DATABASE")]

    # Limpeza para evitar duplicidade durante os testes do MVP
    db.usuarios.drop()
    db.planos_alimentares.drop()
    db.consultas.drop()
    db.pagamentos.drop()

    print("Criando índices e restrições...")
    # Garante que não existirão dois usuários com o mesmo e-mail
    db.usuarios.create_index("email", unique=True)
    # Acelera a busca do plano alimentar quando o paciente logar no sistema
    db.planos_alimentares.create_index("paciente_id")

    print("Inserindo dados iniciais (Seed Data)...")
    
    # 1. Inserção Polimórfica: Nutricionista (Dra. Ana)
    nutri_ana = {
        "nome": "Dra. Ana",
        "email": "ana@nutrilife.com",
        "telefone": "61999999999",
        "senha": "hash_da_senha_criptografada",
        "tipo": "NUTRICIONISTA",
        "dados_nutricionista": {
            "crn": 12345,
            "especialidade": "Emagrecimento",
            "end_clinica": "Asa Sul, Brasília - DF",
            "preco_consulta": 150.00
        }
    }
    nutri_id = db.usuarios.insert_one(nutri_ana).inserted_id

    # 2. Inserção Polimórfica: Paciente (Julia)
    paciente_julia = {
        "nome": "Julia",
        "email": "julia@email.com",
        "telefone": "61988888888",
        "senha": "hash_da_senha_criptografada",
        "tipo": "PACIENTE"
    }
    paciente_id = db.usuarios.insert_one(paciente_julia).inserted_id

    # 3. Inserção em Cascata: Plano Alimentar com Refeições e Alimentos Embutidos
    plano_low_carb = {
        "objetivo": "Emagrecimento",
        "meta_meses": 6,
        "data_inicio": datetime(2026, 3, 20),
        "paciente_id": paciente_id,
        "nutricionista_id": nutri_id,
        "dietas": [
            {
                "horario": "07:00",
                "nome_refeicao": "Café da Manhã",
                "alimentos": [
                    {"nome_alimento": "Cuscuz de milho", "caloria": 224, "porcao": "1 Pedaço grande (200g)"},
                    {"nome_alimento": "Café coado", "caloria": 12, "porcao": "1 Xícara (200ml)"},
                    {"nome_alimento": "Maçã", "caloria": 83, "porcao": "1 Unidade média (130g)"}
                ]
            }
        ]
    }
    db.planos_alimentares.insert_one(plano_low_carb)

    # 4. Agendamento de Consulta
    consulta = {
        "data_hora": datetime(2026, 5, 18, 10, 30),
        "status": "AGENDADA",
        "link_reuniao": "https://www.microsoft.com/pt-br/microsoft-teams",
        "paciente_id": paciente_id,
        "nutricionista_id": nutri_id
    }
    db.consultas.insert_one(consulta)

    print("✅ Banco de dados populado com sucesso!")

if __name__ == "__main__":
    setup_database()