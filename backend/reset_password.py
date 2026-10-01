from getpass import getpass

from database.connection import get_database
from main import initialize_database
from security import hash_password


def main() -> None:
    initialize_database()
    email = input("E-mail da conta: ").strip().lower()
    password = getpass("Nova senha (mínimo 8 caracteres): ")
    confirmation = getpass("Confirme a nova senha: ")

    if len(password) < 8 or len(password) > 128:
        raise SystemExit("A senha deve ter entre 8 e 128 caracteres.")
    if password != confirmation:
        raise SystemExit("As senhas não conferem.")

    result = get_database()["usuarios"].update_one(
        {"email": email},
        {"$set": {"senha_hash": hash_password(password)}},
    )
    if result.matched_count == 0:
        raise SystemExit("Conta não encontrada.")
    print("Senha atualizada.")


if __name__ == "__main__":
    main()
