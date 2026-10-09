import math
import time
from collections import deque
from threading import Lock

from fastapi import HTTPException, Request, status


class LimiteTentativas:
    def __init__(self, maximo: int, janela_segundos: int):
        self.maximo = maximo
        self.janela = janela_segundos
        self._registros: dict[str, deque[float]] = {}
        self._trava = Lock()

    def _limpar(self, chave: str, agora: float) -> deque[float]:
        registros = self._registros.setdefault(chave, deque())
        while registros and agora - registros[0] > self.janela:
            registros.popleft()
        return registros

    def segundos_bloqueado(self, *chaves: str) -> int:
        agora = time.monotonic()
        with self._trava:
            espera = 0.0
            for chave in chaves:
                registros = self._limpar(chave, agora)
                if len(registros) >= self.maximo:
                    espera = max(espera, self.janela - (agora - registros[0]))
            return math.ceil(espera)

    def registrar(self, *chaves: str) -> None:
        agora = time.monotonic()
        with self._trava:
            for chave in chaves:
                self._limpar(chave, agora).append(agora)

    def limpar(self, *chaves: str) -> None:
        with self._trava:
            for chave in chaves:
                self._registros.pop(chave, None)

    def exigir_liberado(self, *chaves: str) -> None:
        espera = self.segundos_bloqueado(*chaves)
        if espera:
            minutos = max(1, math.ceil(espera / 60))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Muitas tentativas. Tente novamente em {minutos} minuto{'s' if minutos > 1 else ''}.",
                headers={"Retry-After": str(espera)},
            )


def ip_do_cliente(request: Request) -> str:
    return request.client.host if request.client else "desconhecido"


limite_login = LimiteTentativas(maximo=5, janela_segundos=15 * 60)
limite_recuperacao = LimiteTentativas(maximo=5, janela_segundos=30 * 60)
limite_cadastro = LimiteTentativas(maximo=10, janela_segundos=60 * 60)
