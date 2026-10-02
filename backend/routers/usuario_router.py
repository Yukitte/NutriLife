from fastapi import APIRouter, Depends, HTTPException, Query, status
from pymongo.errors import DuplicateKeyError

from crud.usuario_crud import (
    atualizar_usuario,
    buscar_usuario,
    buscar_nutricionista,
    criar_usuario,
    listar_nutricionistas,
    listar_nutricionistas_proximos,
    listar_pacientes,
    paciente_vinculado,
    remover_usuario,
)
from schemas.usuario_schema import (
    TokenResponse,
    UsuarioCreate,
    UsuarioPublico,
    UsuarioResponse,
    UsuarioUpdate,
)
from security import create_access_token, get_current_user, hash_password, require_nutritionist

router = APIRouter(prefix="/usuarios", tags=["Usuários"])


@router.post("", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def cadastrar_usuario(usuario: UsuarioCreate):
    try:
        created = criar_usuario(usuario, hash_password(usuario.senha))
    except DuplicateKeyError as error:
        campo = (error.details or {}).get("keyPattern", {})
        detail = "CPF já cadastrado." if "cpf_hash" in campo else "E-mail já cadastrado."
        raise HTTPException(status_code=409, detail=detail) from error
    return {
        "access_token": create_access_token(created["id"]),
        "usuario": created,
    }


@router.get("", response_model=list[UsuarioResponse])
def consultar_pacientes(nutricionista: dict = Depends(require_nutritionist)):
    return listar_pacientes(nutricionista["id"])


@router.get("/me", response_model=UsuarioResponse)
def consultar_perfil(usuario: dict = Depends(get_current_user)):
    return usuario


@router.put("/me", response_model=UsuarioResponse)
def atualizar_perfil(
    changes: UsuarioUpdate,
    usuario: dict = Depends(get_current_user),
):
    professional_fields = {
        "crn",
        "especialidades",
        "biografia",
        "valor_consulta",
        "pagseguro_link",
    }
    changes_requested = changes.model_dump(exclude_unset=True)
    if usuario["perfil"] != "nutricionista" and professional_fields.intersection(
        changes_requested
    ):
        raise HTTPException(
            status_code=403,
            detail="Somente nutricionistas podem editar dados profissionais.",
        )
    try:
        updated = atualizar_usuario(usuario["id"], changes)
    except DuplicateKeyError as error:
        raise HTTPException(status_code=409, detail="E-mail já cadastrado.") from error
    if updated is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    return updated


@router.get("/nutricionistas", response_model=list[UsuarioPublico])
def consultar_nutricionistas(estado: str | None = None):
    if estado and len(estado.strip()) != 2:
        raise HTTPException(status_code=422, detail="Informe a sigla de um estado.")
    return listar_nutricionistas(estado.strip() if estado else None)


@router.get("/nutricionistas/proximos", response_model=list[UsuarioPublico])
def consultar_nutricionistas_proximos(
    raio_km: float | None = Query(default=None, gt=0, le=500),
    estado: str | None = None,
    usuario: dict = Depends(get_current_user),
):
    if estado and len(estado.strip()) != 2:
        raise HTTPException(status_code=422, detail="Informe a sigla de um estado.")
    profissionais = listar_nutricionistas_proximos(
        usuario["id"],
        raio_km,
        estado.strip() if estado else None,
    )
    if profissionais is None:
        raise HTTPException(
            status_code=422,
            detail="Não foi possível localizar o CEP do seu cadastro. Confira o CEP no seu perfil.",
        )
    return profissionais


@router.get("/nutricionistas/{usuario_id}", response_model=UsuarioPublico)
def consultar_perfil_publico(usuario_id: str):
    professional = buscar_nutricionista(usuario_id)
    if professional is None:
        raise HTTPException(status_code=404, detail="Nutricionista não encontrado.")
    return professional


@router.get("/{usuario_id}", response_model=UsuarioResponse)
def consultar_usuario(
    usuario_id: str,
    usuario: dict = Depends(get_current_user),
):
    if usuario["perfil"] != "nutricionista" and usuario_id != usuario["id"]:
        raise HTTPException(status_code=403, detail="Acesso não permitido.")
    found = buscar_usuario(usuario_id)
    if found is None or (
        usuario["perfil"] == "nutricionista" and found["perfil"] != "paciente"
    ):
        raise HTTPException(status_code=404, detail="Paciente não encontrado.")
    if usuario["perfil"] == "nutricionista" and not paciente_vinculado(
        usuario["id"],
        usuario_id,
    ):
        raise HTTPException(status_code=404, detail="Paciente não vinculado.")
    return found


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def excluir_propria_conta(usuario: dict = Depends(get_current_user)):
    if not remover_usuario(usuario["id"]):
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
