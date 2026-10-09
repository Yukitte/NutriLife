from datetime import datetime

from pydantic import BaseModel


class ResumoUsuarios(BaseModel):
    total: int
    pacientes: int
    nutricionistas: int
    administradores: int
    desativados: int
    novos_30_dias: int


class CadastrosDoMes(BaseModel):
    mes: str
    pacientes: int
    nutricionistas: int


class TotalPorEstado(BaseModel):
    estado: str
    total: int


class CadastroRecente(BaseModel):
    nome: str
    perfil: str
    criado_em: datetime


class ResumoConsultas(BaseModel):
    total: int
    confirmadas: int
    pendentes: int
    canceladas: int
    proximos_7_dias: int


class ConsultasDoMes(BaseModel):
    mes: str
    total: int


class NutricionistaDestaque(BaseModel):
    nome: str
    consultas: int


class ResumoConteudo(BaseModel):
    planos: int
    receitas: int
    avaliacoes_fisicas: int
    anamneses: int
    mensagens_30_dias: int
    comentarios: int
    nota_media: float | None = None


class ResumoPlataforma(BaseModel):
    usuarios: ResumoUsuarios
    cadastros_por_mes: list[CadastrosDoMes]
    nutricionistas_por_estado: list[TotalPorEstado]
    ultimos_cadastros: list[CadastroRecente]
    consultas: ResumoConsultas
    consultas_por_mes: list[ConsultasDoMes]
    nutricionistas_destaque: list[NutricionistaDestaque]
    conteudo: ResumoConteudo
