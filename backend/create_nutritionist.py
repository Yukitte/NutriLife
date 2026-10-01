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
    usuario = UsuarioCreate(nome=nome, email=email, senha=senha)
    try:
        created = criar_usuario(usuario, hash_password(senha), perfil="nutricionista")
    except DuplicateKeyError as error:
        raise SystemExit("Este e-mail já está cadastrado.") from error
    print(f"Nutricionista criada: {created['email']}")


if __name__ == "__main__":
    main()
