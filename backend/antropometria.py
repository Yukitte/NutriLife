import math

DOBRAS_JP7 = ["toracica", "axilar_media", "tricipital", "subescapular", "abdominal", "suprailiaca", "coxa"]
DOBRAS_JP3 = {
    "masculino": ["toracica", "abdominal", "coxa"],
    "feminino": ["tricipital", "suprailiaca", "coxa"],
}
CMB_REFERENCIA_CM = {"masculino": 25.3, "feminino": 23.2}
MASSA_RESIDUAL = {"masculino": 0.241, "feminino": 0.209}
RCQ_HEYWARD = {
    "masculino": [(29, 0.83, 0.88, 0.94), (39, 0.84, 0.91, 0.96), (49, 0.88, 0.95, 1.00), (59, 0.90, 0.96, 1.02), (200, 0.91, 0.98, 1.03)],
    "feminino": [(29, 0.71, 0.77, 0.82), (39, 0.72, 0.78, 0.84), (49, 0.73, 0.79, 0.87), (59, 0.74, 0.81, 0.88), (200, 0.76, 0.83, 0.90)],
}


def _arredondar(valor: float | None, casas: int = 1) -> float | None:
    return None if valor is None else round(valor, casas)


def classificar_imc(imc: float, idade: int) -> str:
    if idade >= 60:
        if imc < 22:
            return "Baixo peso"
        return "Adequado" if imc <= 27 else "Sobrepeso"
    faixas = [(18.5, "Baixo peso"), (25, "Adequado"), (30, "Sobrepeso"), (35, "Obesidade grau I"), (40, "Obesidade grau II")]
    for limite, classe in faixas:
        if imc < limite:
            return classe
    return "Obesidade grau III"


def classificar_rcq(rcq: float, sexo: str, idade: int) -> str:
    for idade_max, baixo, moderado, alto in RCQ_HEYWARD[sexo]:
        if idade <= idade_max:
            if rcq < baixo:
                return "Baixo"
            if rcq <= moderado:
                return "Moderado"
            return "Alto" if rcq <= alto else "Muito alto"
    return "Muito alto"


def classificar_cmb(adequacao: float) -> str:
    if adequacao >= 90:
        return "Eutrofia"
    if adequacao >= 80:
        return "Desnutrição leve"
    if adequacao >= 70:
        return "Desnutrição moderada"
    return "Desnutrição grave"


def classificar_gordura(percentual: float, sexo: str) -> str:
    if sexo == "masculino":
        faixas = [(6, "Risco por desnutrição"), (15, "Abaixo da média"), (16, "Média"), (25, "Acima da média")]
    else:
        faixas = [(9, "Risco por desnutrição"), (23, "Abaixo da média"), (24, "Média"), (32, "Acima da média")]
    for limite, classe in faixas:
        if percentual < limite:
            return classe
    return "Risco por obesidade"


NOMES_DOBRAS = {
    "toracica": "torácica", "axilar_media": "axilar média", "tricipital": "tricipital",
    "subescapular": "subescapular", "abdominal": "abdominal", "suprailiaca": "suprailíaca", "coxa": "coxa",
}
NOMES_PROTOCOLOS = {"pollock7": "Jackson & Pollock (7 dobras)", "pollock3": "Jackson & Pollock (3 dobras)"}


def dobras_do_protocolo(protocolo: str, sexo: str) -> list[str]:
    return DOBRAS_JP7 if protocolo == "pollock7" else DOBRAS_JP3[sexo]


def densidade_protocolo(dobras: dict, sexo: str, idade: int, protocolo: str) -> tuple[float | None, float | None]:
    nomes = dobras_do_protocolo(protocolo, sexo)
    if not all(dobras.get(nome) is not None for nome in nomes):
        return None, None
    soma = sum(dobras[nome] for nome in nomes)
    if protocolo == "pollock7":
        if sexo == "masculino":
            densidade = 1.112 - 0.00043499 * soma + 0.00000055 * soma ** 2 - 0.00028826 * idade
        else:
            densidade = 1.097 - 0.00046971 * soma + 0.00000056 * soma ** 2 - 0.00012828 * idade
    elif sexo == "masculino":
        densidade = 1.10938 - 0.0008267 * soma + 0.0000016 * soma ** 2 - 0.0002574 * idade
    else:
        densidade = 1.0994921 - 0.0009929 * soma + 0.0000023 * soma ** 2 - 0.0001392 * idade
    return densidade, soma


def percentual_siri(densidade: float) -> float:
    return max(0.0, (4.95 / densidade - 4.50) * 100)


def densidade_corporal(dobras: dict, sexo: str, idade: int, protocolo: str | None = None) -> tuple[float | None, str | None, float | None]:
    protocolos = [protocolo] if protocolo else ["pollock7", "pollock3"]
    for atual in protocolos:
        densidade, soma = densidade_protocolo(dobras, sexo, idade, atual)
        if densidade:
            return densidade, f"{NOMES_PROTOCOLOS[atual]} + Siri", soma
    return None, None, None


FATORES_ATIVIDADE = {
    "sedentario": 1.2,
    "leve": 1.375,
    "moderado": 1.55,
    "intenso": 1.725,
    "muito_intenso": 1.9,
}


def calcular_resultados(medida: dict) -> dict:
    sexo = medida["sexo_biologico"]
    idade = medida["idade_anos"]
    peso = medida["peso_kg"]
    altura_cm = medida["altura_cm"]
    dobras = medida.get("dobras") or {}
    circ = medida.get("circunferencias") or {}

    altura_m = altura_cm / 100
    imc = peso / altura_m ** 2
    resultados = {
        "imc": _arredondar(imc),
        "classificacao_imc": classificar_imc(imc, idade),
        "rcq": None,
        "risco_rcq": None,
        "rce": None,
        "risco_rce": None,
        "cmb_cm": None,
        "adequacao_cmb": None,
        "classificacao_cmb": None,
        "soma_dobras_mm": _arredondar(sum(v for v in dobras.values() if v is not None)) if any(v is not None for v in dobras.values()) else None,
        "soma_dobras_metodo_mm": None,
        "densidade_corporal": None,
        "percentual_gordura": None,
        "classificacao_gordura": None,
        "massa_gordura_kg": None,
        "massa_livre_gordura_kg": None,
        "massa_residual_kg": _arredondar(peso * MASSA_RESIDUAL[sexo]),
        "metodo_gordura": None,
        "protocolo_gordura": None,
        "dobras_faltando": [],
        "percentual_gordura_pollock7": None,
        "percentual_gordura_pollock3": None,
        "tmb_kcal": None,
        "fator_atividade": None,
        "get_kcal": None,
    }

    if circ.get("cintura") and circ.get("quadril"):
        rcq = circ["cintura"] / circ["quadril"]
        resultados["rcq"] = _arredondar(rcq, 2)
        resultados["risco_rcq"] = classificar_rcq(rcq, sexo, idade)

    if circ.get("cintura"):
        rce = circ["cintura"] / altura_cm
        resultados["rce"] = _arredondar(rce, 2)
        resultados["risco_rce"] = "Elevado" if rce >= 0.5 else "Adequado"

    if circ.get("braco_relaxado") and dobras.get("tricipital") is not None:
        cmb = circ["braco_relaxado"] - math.pi * dobras["tricipital"] / 10
        adequacao = cmb / CMB_REFERENCIA_CM[sexo] * 100
        resultados["cmb_cm"] = _arredondar(cmb)
        resultados["adequacao_cmb"] = _arredondar(adequacao)
        resultados["classificacao_cmb"] = classificar_cmb(adequacao)

    for nome_protocolo in ("pollock7", "pollock3"):
        densidade_comparada, _ = densidade_protocolo(dobras, sexo, idade, nome_protocolo)
        if densidade_comparada:
            resultados[f"percentual_gordura_{nome_protocolo}"] = _arredondar(percentual_siri(densidade_comparada))

    protocolo = medida.get("protocolo_gordura")
    if protocolo:
        resultados["protocolo_gordura"] = protocolo
        resultados["dobras_faltando"] = [
            NOMES_DOBRAS[nome] for nome in dobras_do_protocolo(protocolo, sexo) if dobras.get(nome) is None
        ]
    densidade, metodo, soma = densidade_corporal(dobras, sexo, idade, protocolo)
    if densidade and not protocolo:
        resultados["protocolo_gordura"] = "pollock7" if metodo.startswith(NOMES_PROTOCOLOS["pollock7"]) else "pollock3"
    if densidade:
        percentual = percentual_siri(densidade)
        massa_gordura = peso * percentual / 100
        resultados.update({
            "soma_dobras_metodo_mm": _arredondar(soma),
            "densidade_corporal": _arredondar(densidade, 3),
            "percentual_gordura": _arredondar(percentual),
            "classificacao_gordura": classificar_gordura(percentual, sexo),
            "massa_gordura_kg": _arredondar(massa_gordura),
            "massa_livre_gordura_kg": _arredondar(peso - massa_gordura),
            "metodo_gordura": metodo,
        })

    if idade >= 18:
        ajuste = -161 if sexo == "feminino" else 5
        tmb = 10 * peso + 6.25 * altura_cm - 5 * idade + ajuste
        resultados["tmb_kcal"] = round(tmb)
        fator = FATORES_ATIVIDADE.get(medida.get("nivel_atividade"))
        if fator:
            resultados["fator_atividade"] = fator
            resultados["get_kcal"] = round(tmb * fator)

    return resultados
