from collections import Counter
from datetime import datetime, timedelta, timezone

from database.connection import get_database


def _com_fuso(valor: datetime) -> datetime:
    return valor.replace(tzinfo=timezone.utc) if valor.tzinfo is None else valor


def _ultimos_meses(agora: datetime, quantidade: int) -> list[str]:
    ano, mes = agora.year, agora.month
    meses = []
    for _ in range(quantidade):
        meses.append(f"{ano:04d}-{mes:02d}")
        mes -= 1
        if mes == 0:
            ano, mes = ano - 1, 12
    return list(reversed(meses))


def resumo_plataforma(agora: datetime | None = None) -> dict:
    database = get_database()
    agora = agora or datetime.now(timezone.utc)
    meses = _ultimos_meses(agora, 6)
    inicio_30_dias = agora - timedelta(days=30)

    usuarios = list(database["usuarios"].find({}, {"nome": 1, "perfil": 1, "ativo": 1, "estado": 1}))
    for usuario in usuarios:
        usuario["criado_em"] = usuario["_id"].generation_time
    por_perfil = Counter(usuario.get("perfil") for usuario in usuarios)
    cadastros = {mes: {"mes": mes, "pacientes": 0, "nutricionistas": 0} for mes in meses}
    for usuario in usuarios:
        mes = usuario["criado_em"].strftime("%Y-%m")
        if mes in cadastros and usuario.get("perfil") in ("paciente", "nutricionista"):
            cadastros[mes][f"{usuario['perfil']}s"] += 1
    estados = Counter(
        usuario.get("estado") for usuario in usuarios
        if usuario.get("perfil") == "nutricionista" and usuario.get("estado")
    )

    consultas = list(database["consultas"].find({}, {"status": 1, "inicio": 1, "nutricionista_id": 1}))
    status_consultas = Counter(consulta.get("status") for consulta in consultas)
    proximos_7_dias = sum(
        1 for consulta in consultas
        if consulta.get("status") in ("confirmada", "pendente_confirmacao", "pendente_pagamento")
        and agora <= _com_fuso(consulta["inicio"]) <= agora + timedelta(days=7)
    )
    consultas_por_mes = Counter(_com_fuso(consulta["inicio"]).strftime("%Y-%m") for consulta in consultas)
    por_nutricionista = Counter(
        consulta["nutricionista_id"] for consulta in consultas if consulta.get("status") == "confirmada"
    )
    nomes = {usuario["_id"]: usuario.get("nome", "") for usuario in usuarios}

    notas = [comentario["nota"] for comentario in database["comentarios"].find({}, {"nota": 1}) if comentario.get("nota")]

    return {
        "usuarios": {
            "total": len(usuarios),
            "pacientes": por_perfil.get("paciente", 0),
            "nutricionistas": por_perfil.get("nutricionista", 0),
            "administradores": por_perfil.get("administrador", 0),
            "desativados": sum(1 for usuario in usuarios if usuario.get("ativo") is False),
            "novos_30_dias": sum(1 for usuario in usuarios if usuario["criado_em"] >= inicio_30_dias),
        },
        "cadastros_por_mes": list(cadastros.values()),
        "nutricionistas_por_estado": [{"estado": estado, "total": total} for estado, total in estados.most_common(6)],
        "ultimos_cadastros": [
            {"nome": usuario.get("nome", ""), "perfil": usuario.get("perfil", ""), "criado_em": usuario["criado_em"]}
            for usuario in sorted(usuarios, key=lambda item: item["criado_em"], reverse=True)[:5]
        ],
        "consultas": {
            "total": len(consultas),
            "confirmadas": status_consultas.get("confirmada", 0),
            "pendentes": status_consultas.get("pendente_confirmacao", 0) + status_consultas.get("pendente_pagamento", 0),
            "canceladas": status_consultas.get("cancelada", 0),
            "proximos_7_dias": proximos_7_dias,
        },
        "consultas_por_mes": [{"mes": mes, "total": consultas_por_mes.get(mes, 0)} for mes in meses],
        "nutricionistas_destaque": [
            {"nome": nomes.get(nutricionista_id, "Nutricionista"), "consultas": total}
            for nutricionista_id, total in por_nutricionista.most_common(5)
        ],
        "conteudo": {
            "planos": database["planos"].count_documents({}),
            "receitas": database["receitas"].count_documents({}),
            "avaliacoes_fisicas": database["medidas_antropometricas"].count_documents({}),
            "anamneses": database["anamneses"].count_documents({}),
            "mensagens_30_dias": database["mensagens"].count_documents({"criada_em": {"$gte": inicio_30_dias}}),
            "comentarios": len(notas),
            "nota_media": round(sum(notas) / len(notas), 1) if notas else None,
        },
    }
