from email.message import EmailMessage
import secrets
import smtplib
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import Response

from crud.usuario_crud import (
    autenticar_usuario,
    buscar_usuario_com_senha,
    guardar_nonce_recuperacao,
    redefinir_senha,
    redefinir_senha_por_cpf,
    serializar_usuario,
)
from schemas.usuario_schema import (
    RecuperacaoSenhaConfirmar,
    RecuperacaoSenhaCpf,
    RecuperacaoSenhaSolicitar,
    TokenResponse,
    UsuarioLogin,
)
from limite_tentativas import ip_do_cliente, limite_login, limite_recuperacao
from security import (
    SENHA_FICTICIA,
    create_access_token,
    create_password_reset_token,
    get_reset_token_claims,
    hash_password,
    verify_password,
)
from settings import get_settings

router = APIRouter(prefix="/auth", tags=["Autenticação"])


def _enviar_link_recuperacao(email: str, token: str) -> None:
    settings = get_settings()
    if not all(
        [
            settings.smtp_host,
            settings.smtp_username,
            settings.smtp_password,
            settings.smtp_from_email,
        ]
    ):
        raise HTTPException(
            status_code=503,
            detail="Recuperação por e-mail ainda não está configurada.",
        )
    query = urlencode({"token": token})
    reset_url = (
        f"{settings.frontend_base_url.rstrip('/')}/pages/auth/recuperar-senha.html?{query}"
    )
    message = EmailMessage()
    message["Subject"] = "Redefinição de senha NutriLife"
    message["From"] = settings.smtp_from_email
    message["To"] = email
    message.set_content(
        "Recebemos uma solicitação para redefinir a senha da sua conta NutriLife.\n\n"
        f"Use este link em até {settings.password_reset_expire_minutes} minutos:\n"
        f"{reset_url}\n\n"
        "Se você não solicitou a redefinição, ignore esta mensagem."
    )
    smtp_factory = (
        smtplib.SMTP_SSL if settings.smtp_port == 465 else smtplib.SMTP
    )
    with smtp_factory(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        if settings.smtp_port != 465:
            smtp.starttls()
        smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)


@router.post("/login", response_model=TokenResponse)
def login(credentials: UsuarioLogin, request: Request):
    email = str(credentials.email).lower()
    chaves = (f"ip:{ip_do_cliente(request)}", f"email:{email}")
    limite_login.exigir_liberado(*chaves)
    usuario = buscar_usuario_com_senha(email)
    senha_confere = verify_password(
        credentials.senha,
        usuario["senha_hash"] if usuario else SENHA_FICTICIA,
    )
    if usuario is None or not senha_confere or not usuario.get("ativo", True):
        limite_login.registrar(*chaves)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha inválidos.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    limite_login.limpar(f"email:{email}")
    public_user = serializar_usuario(usuario)
    return {
        "access_token": create_access_token(public_user["id"]),
        "usuario": public_user,
    }


@router.post("/recuperar-senha", status_code=status.HTTP_202_ACCEPTED)
def solicitar_recuperacao(request: RecuperacaoSenhaSolicitar, http_request: Request):
    chaves = (f"ip:{ip_do_cliente(http_request)}", f"email:{str(request.email).lower()}")
    limite_recuperacao.exigir_liberado(*chaves)
    limite_recuperacao.registrar(*chaves)
    settings = get_settings()
    if not all(
        [
            settings.smtp_host,
            settings.smtp_username,
            settings.smtp_password,
            settings.smtp_from_email,
        ]
    ):
        raise HTTPException(
            status_code=503,
            detail="Recuperação por e-mail ainda não está configurada.",
        )
    email = str(request.email).lower()
    user = autenticar_usuario(email)
    if user is not None:
        nonce = secrets.token_urlsafe(32)
        guardar_nonce_recuperacao(str(user["_id"]), nonce)
        token = create_password_reset_token(str(user["_id"]), nonce)
        _enviar_link_recuperacao(email, token)
    return {"detail": "Se o e-mail estiver cadastrado, enviaremos instruções de recuperação."}


@router.post("/recuperar-senha-cpf", status_code=status.HTTP_204_NO_CONTENT)
def recuperar_senha_por_cpf(request: RecuperacaoSenhaCpf, http_request: Request):
    email = str(request.email).lower()
    chaves = (f"cpf-ip:{ip_do_cliente(http_request)}", f"cpf-email:{email}")
    limite_recuperacao.exigir_liberado(*chaves)
    if not redefinir_senha_por_cpf(email, request.cpf, hash_password(request.senha)):
        limite_recuperacao.registrar(*chaves)
        raise HTTPException(status_code=400, detail="CPF ou e-mail não conferem com nenhum cadastro.")
    limite_recuperacao.limpar(f"cpf-email:{email}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/redefinir-senha", status_code=status.HTTP_204_NO_CONTENT)
def confirmar_recuperacao(request: RecuperacaoSenhaConfirmar):
    claims = get_reset_token_claims(request.token)
    if claims is None or not redefinir_senha(
        claims["user_id"],
        claims["jti"],
        hash_password(request.senha),
    ):
        raise HTTPException(status_code=400, detail="Link de redefinição inválido ou expirado.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
