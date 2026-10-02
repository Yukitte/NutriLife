from datetime import datetime, timezone
from getpass import getpass

from bson import ObjectId
from pydantic import EmailStr, TypeAdapter, ValidationError
from pymongo.errors import DuplicateKeyError

from database.connection import get_database
from main import initialize_database
from security import hash_password


def main() -> None:
    initialize_database()
    name = input("Nome completo do administrador: ").strip()
    email = input("E-mail do administrador: ").strip()
    password = getpass("Senha (mínimo de 12 caracteres): ")
    confirmation = getpass("Confirme a senha: ")

    if len(name) < 2:
        raise SystemExit("Informe um nome válido.")
    try:
        normalized_email = str(TypeAdapter(EmailStr).validate_python(email)).lower()
    except ValidationError as error:
        raise SystemExit("Informe um e-mail válido.") from error
    if len(password) < 12:
        raise SystemExit("A senha deve ter pelo menos 12 caracteres.")
    if password != confirmation:
        raise SystemExit("As senhas não conferem.")

    document = {
        "_id": ObjectId(),
        "nome": name,
        "email": normalized_email,
        "senha_hash": hash_password(password),
        "perfil": "administrador",
        "ativo": True,
        "telefone": "",
        "endereco": "",
        "cep": "",
        "estado": "",
        "data_inicio": datetime.now(timezone.utc).date().isoformat(),
    }
    try:
        get_database()["usuarios"].insert_one(document)
    except DuplicateKeyError as error:
        raise SystemExit("Este e-mail já está cadastrado.") from error
    print(f"Administrador criado: {normalized_email}")


if __name__ == "__main__":
    main()
