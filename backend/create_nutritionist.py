from getpass import getpass

from main import initialize_database
from pymongo.errors import DuplicateKeyError

from crud.usuario_crud import criar_usuario
from schemas.usuario_schema import UsuarioCreate
from security import hash_password


def main() -> None:
    initialize_database()
    nome = input("Nome da nutricionista: ").strip()
    email = input("E-mail: ").strip()
    senha = getpass("Senha (mínimo 8 caracteres): ")
    telefone = input("Telefone com DDD: ").strip()
    endereco = input("Endereço profissional: ").strip()
    cep = input("CEP profissional: ").strip()
    estado = input("UF (ex.: SP): ").strip().upper()
    crn = input("CRN: ").strip().upper()
    specialties = input("Especialidades (separadas por vírgula): ").strip()
    biography = input("Biografia profissional: ").strip()
    price = input("Valor da consulta (ex.: 150.00): ").strip()
    payment_link = input("Link de checkout PagSeguro: ").strip()
    usuario = UsuarioCreate(
        nome=nome,
        email=email,
        senha=senha,
        telefone=telefone,
        endereco=endereco,
        cep=cep,
        estado=estado,
        tipo="nutricionista",
        crn=crn,
    )
    try:
        created = criar_usuario(usuario, hash_password(senha))
        from bson import ObjectId
        from database.connection import get_database

        get_database()["usuarios"].update_one(
            {"_id": ObjectId(created["id"])},
            {
                "$set": {
                    "especialidades": [
                        item.strip() for item in specialties.split(",") if item.strip()
                    ],
                    "biografia": biography,
                    "valor_consulta": float(price) if price else 0,
                    "pagseguro_link": payment_link or None,
                }
            },
        )
    except DuplicateKeyError as error:
        raise SystemExit("Este e-mail já está cadastrado.") from error
    print(f"Nutricionista criada: {created['email']}")


if __name__ == "__main__":
    main()
