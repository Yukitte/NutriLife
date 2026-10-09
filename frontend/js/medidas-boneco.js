import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const PASTA_MODELOS = new URL("../assets/modelos/", import.meta.url);
const FAIXAS = ["min", "average", "max"];

const AJUSTES = [
    { regua: "neck", medida: "pescoco" },
    { regua: "bust", medida: "torax" },
    { regua: "waist", medida: "cintura" },
    { regua: "hips", medida: "quadril" },
    { regua: "upperarm", medida: "braco_relaxado" },
    { regua: "thigh", medida: (c) => c.coxa_medial || c.coxa_proximal },
    { regua: "knee", medida: "coxa_distal", fator: 0.92 },
    { regua: "calf", medida: "panturrilha" },
];

const REFERENCIA = {
    feminino: { altura: 165, medidas: { pescoco: 32, ombro: 100, torax: 86, cintura: 70, abdomen: 78, quadril: 96, braco_relaxado: 27, antebraco: 23, coxa_proximal: 56, coxa_medial: 50, coxa_distal: 40, panturrilha: 35 } },
    masculino: { altura: 175, medidas: { pescoco: 38, ombro: 115, torax: 98, cintura: 82, abdomen: 86, quadril: 98, braco_relaxado: 31, antebraco: 27, coxa_proximal: 56, coxa_medial: 51, coxa_distal: 41, panturrilha: 37 } },
};

const ROTULOS = [
    { chave: "pescoco", nome: "Pescoço", torso: true },
    { chave: "ombro", nome: "Ombro", torso: true },
    { chave: "torax", nome: "Tórax", torso: true },
    { chave: "cintura", nome: "Cintura", torso: true },
    { chave: "abdomen", nome: "Abdômen", torso: true },
    { chave: "quadril", nome: "Quadril", torso: true },
    { chave: "braco_relaxado", nome: "Braço" },
    { chave: "antebraco", nome: "Antebraço" },
    { chave: "coxa_proximal", nome: "Coxa proximal" },
    { chave: "coxa_medial", nome: "Coxa medial" },
    { chave: "coxa_distal", nome: "Coxa distal" },
    { chave: "panturrilha", nome: "Panturrilha" },
];

let manifestoPromise;
const modelos = {};

function carregarManifesto() {
    if (!manifestoPromise) {
        manifestoPromise = fetch(new URL("corpo.json", PASTA_MODELOS)).then((resposta) => {
            if (!resposta.ok) throw new Error("Modelo 3D não encontrado.");
            return resposta.json();
        });
    }
    return manifestoPromise;
}

async function carregarModelo(sexo) {
    if (!modelos[sexo]) {
        modelos[sexo] = (async () => {
            const manifesto = await carregarManifesto();
            const info = manifesto.sexos[sexo];
            const resposta = await fetch(new URL(info.arquivo, PASTA_MODELOS));
            if (!resposta.ok) throw new Error("Modelo 3D não encontrado.");
            const bin = await resposta.arrayBuffer();
            const morphs = {};
            Object.entries(info.morphs).forEach(([nome, morph]) => {
                morphs[nome] = {
                    indices: new Uint16Array(bin, morph.indices, morph.quantidade),
                    valores: new Int16Array(bin, morph.valores, morph.quantidade * 3),
                    escala: morph.escala,
                };
            });
            return {
                triangulosCorpo: manifesto.triangulos_corpo,
                posicoes: new Float32Array(bin, info.posicoes, manifesto.vertices * 3),
                indices: new Uint16Array(bin, info.indices, manifesto.triangulos * 3),
                reguas: manifesto.reguas,
                morphs,
            };
        })();
    }
    return modelos[sexo];
}

function aplicarMorph(posicoes, morph, peso) {
    if (!peso) return;
    const fator = morph.escala * peso;
    for (let i = 0; i < morph.indices.length; i += 1) {
        const destino = morph.indices[i] * 3;
        posicoes[destino] += morph.valores[i * 3] * fator;
        posicoes[destino + 1] += morph.valores[i * 3 + 1] * fator;
        posicoes[destino + 2] += morph.valores[i * 3 + 2] * fator;
    }
}

function perimetro(posicoes, regua) {
    let total = 0;
    for (let i = 1; i < regua.length; i += 1) {
        const a = regua[i - 1] * 3;
        const b = regua[i] * 3;
        total += Math.hypot(posicoes[a] - posicoes[b], posicoes[a + 1] - posicoes[b + 1], posicoes[a + 2] - posicoes[b + 2]);
    }
    return total;
}

function recortarPoligono(vertices, eixo, limite, manterMaior) {
    const resultado = [];
    for (let i = 0; i < vertices.length; i += 1) {
        const atual = vertices[i];
        const proximo = vertices[(i + 1) % vertices.length];
        const dentroAtual = manterMaior ? atual.p[eixo] >= limite : atual.p[eixo] <= limite;
        const dentroProximo = manterMaior ? proximo.p[eixo] >= limite : proximo.p[eixo] <= limite;
        if (dentroAtual) resultado.push(atual);
        if (dentroAtual !== dentroProximo) {
            const t = (limite - atual.p[eixo]) / (proximo.p[eixo] - atual.p[eixo]);
            const misturar = (a, b) => a.map((valor, k) => valor + (b[k] - valor) * t);
            resultado.push({ p: misturar(atual.p, proximo.p), n: misturar(atual.n, proximo.n) });
        }
    }
    return resultado;
}

function montarRoupa(posicoes, normais, indices, totalTriangulos, faixa, afastamento) {
    const saida = [];
    const normaisSaida = [];
    for (let t = 0; t < totalTriangulos; t += 1) {
        let poligono = [0, 1, 2].map((k) => {
            const v = indices[t * 3 + k] * 3;
            return { p: [posicoes[v], posicoes[v + 1], posicoes[v + 2]], n: [normais[v], normais[v + 1], normais[v + 2]] };
        });
        const ys = poligono.map((v) => v.p[1]);
        if (Math.max(...ys) < faixa.yMin || Math.min(...ys) > faixa.yMax) continue;
        poligono = recortarPoligono(poligono, 1, faixa.yMin, true);
        if (poligono.length) poligono = recortarPoligono(poligono, 1, faixa.yMax, false);
        if (poligono.length) poligono = recortarPoligono(poligono, 0, -faixa.xMax, true);
        if (poligono.length) poligono = recortarPoligono(poligono, 0, faixa.xMax, false);
        for (let k = 1; k < poligono.length - 1; k += 1) {
            [poligono[0], poligono[k], poligono[k + 1]].forEach(({ p, n }) => {
                saida.push(p[0] + n[0] * afastamento, p[1] + n[1] * afastamento, p[2] + n[2] * afastamento);
                const tamanho = Math.hypot(n[0], n[1], n[2]) || 1;
                normaisSaida.push(n[0] / tamanho, n[1] / tamanho, n[2] / tamanho);
            });
        }
    }
    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute("position", new THREE.Float32BufferAttribute(saida, 3));
    geometria.setAttribute("normal", new THREE.Float32BufferAttribute(normaisSaida, 3));
    return geometria;
}

function contornoConvexo(pontos) {
    const ordenados = pontos.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cruz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const metade = (lista) => {
        const pilha = [];
        lista.forEach((ponto) => {
            while (pilha.length >= 2 && cruz(pilha[pilha.length - 2], pilha[pilha.length - 1], ponto) <= 0) pilha.pop();
            pilha.push(ponto);
        });
        pilha.pop();
        return pilha;
    };
    return metade(ordenados).concat(metade(ordenados.reverse()));
}

function raioNoAngulo(contorno, centro, angulo) {
    const dx = Math.cos(angulo);
    const dz = Math.sin(angulo);
    let melhor = 0;
    for (let i = 0; i < contorno.length; i += 1) {
        const a = contorno[i];
        const b = contorno[(i + 1) % contorno.length];
        const ex = b[0] - a[0];
        const ez = b[1] - a[1];
        const denominador = dx * ez - dz * ex;
        if (Math.abs(denominador) < 1e-9) continue;
        const ax = a[0] - centro[0];
        const az = a[1] - centro[1];
        const t = (ax * ez - az * ex) / denominador;
        const u = (ax * dz - az * dx) / denominador;
        if (t > 0 && u >= 0 && u <= 1) melhor = Math.max(melhor, t);
    }
    return melhor;
}

function montarTop(posicoes, indices, totalTriangulos, faixa, afastamento) {
    const aneis = 18;
    const lados = 72;
    const contornos = [];
    const lacuna = faixa.lacuna;
    const ateLacuna = (valores) => {
        const ordenados = valores.sort((a, b) => a - b);
        for (let i = 1; i < ordenados.length; i += 1) {
            if (ordenados[i] - ordenados[i - 1] > lacuna) return ordenados[i - 1];
        }
        return ordenados[ordenados.length - 1];
    };
    let limiteDireita = Infinity;
    let limiteEsquerda = -Infinity;
    for (let anel = 0; anel <= aneis; anel += 1) {
        const y = faixa.yMin + ((faixa.yMax - faixa.yMin) * anel) / aneis;
        const pontos = [];
        for (let t = 0; t < totalTriangulos; t += 1) {
            for (let k = 0; k < 3; k += 1) {
                const a = indices[t * 3 + k] * 3;
                const b = indices[t * 3 + ((k + 1) % 3)] * 3;
                const ya = posicoes[a + 1];
                const yb = posicoes[b + 1];
                if ((ya - y) * (yb - y) > 0 || ya === yb) continue;
                const f = (y - ya) / (yb - ya);
                const x = posicoes[a] + (posicoes[b] - posicoes[a]) * f;
                pontos.push([x, posicoes[a + 2] + (posicoes[b + 2] - posicoes[a + 2]) * f]);
            }
        }
        const direita = Math.min(limiteDireita, ateLacuna(pontos.filter((ponto) => ponto[0] >= 0).map((ponto) => ponto[0])));
        const esquerda = Math.max(limiteEsquerda, -ateLacuna(pontos.filter((ponto) => ponto[0] <= 0).map((ponto) => -ponto[0])));
        limiteDireita = direita + lacuna * 0.1;
        limiteEsquerda = esquerda - lacuna * 0.1;
        contornos.push(contornoConvexo(pontos.filter((ponto) => ponto[0] >= esquerda && ponto[0] <= direita)));
    }
    const meioZ = contornos.reduce((soma, contorno) => {
        const zs = contorno.map((ponto) => ponto[1]);
        return soma + (Math.min(...zs) + Math.max(...zs)) / 2;
    }, 0) / contornos.length;
    const centro = [0, meioZ];
    const raios = contornos.map((contorno) => Array.from({ length: lados }, (_, i) => raioNoAngulo(contorno, centro, (i / lados) * Math.PI * 2)));
    const envolver = (coluna) => {
        const casca = [];
        coluna.forEach((raio, anel) => {
            while (casca.length >= 2) {
                const [a1, r1] = casca[casca.length - 2];
                const [a2, r2] = casca[casca.length - 1];
                if ((r2 - r1) * (anel - a1) <= (raio - r1) * (a2 - a1)) casca.pop();
                else break;
            }
            casca.push([anel, raio]);
        });
        return coluna.map((_, anel) => {
            const k = casca.findIndex(([a]) => a >= anel);
            if (casca[k][0] === anel) return casca[k][1];
            const [a1, r1] = casca[k - 1];
            const [a2, r2] = casca[k];
            return r1 + ((r2 - r1) * (anel - a1)) / (a2 - a1);
        });
    };
    const colunas = Array.from({ length: lados }, (_, i) => envolver(raios.map((linha) => linha[i])));
    let suaves = raios.map((linha, anel) => linha.map((_, i) => colunas[i][anel]));
    for (let passo = 0; passo < 2; passo += 1) {
        suaves = suaves.map((linha) => linha.map((raio, i) => Math.max(raio, (linha[(i + lados - 1) % lados] + raio + linha[(i + 1) % lados]) / 3)));
    }
    suaves = suaves.map((linha) => linha.map((raio) => raio + afastamento));
    const vertices = [];
    suaves.forEach((linha, anel) => {
        const y = faixa.yMin + ((faixa.yMax - faixa.yMin) * anel) / aneis;
        linha.forEach((raio, i) => {
            const angulo = (i / lados) * Math.PI * 2;
            vertices.push(centro[0] + Math.cos(angulo) * raio, y, centro[1] + Math.sin(angulo) * raio);
        });
    });
    const faces = [];
    for (let anel = 0; anel < aneis; anel += 1) {
        for (let i = 0; i < lados; i += 1) {
            const a = anel * lados + i;
            const b = anel * lados + ((i + 1) % lados);
            faces.push(a, a + lados, b, b, a + lados, b + lados);
        }
    }
    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometria.setIndex(faces);
    geometria.computeVertexNormals();
    return geometria;
}

function pesosDaFaixa(valor) {
    const v = Math.min(Math.max(valor, 0), 1);
    if (v <= 0.5) return { min: 1 - v / 0.5, average: v / 0.5, max: 0 };
    return { min: 0, average: 1 - (v - 0.5) / 0.5, max: (v - 0.5) / 0.5 };
}

function interpolar(valor, pontos) {
    if (valor <= pontos[0][0]) return pontos[0][1];
    for (let i = 1; i < pontos.length; i += 1) {
        if (valor <= pontos[i][0]) {
            const [x0, y0] = pontos[i - 1];
            const [x1, y1] = pontos[i];
            return y0 + ((valor - x0) / (x1 - x0)) * (y1 - y0);
        }
    }
    return pontos[pontos.length - 1][1];
}

function estimarMedidas(medida, sexo) {
    const referencia = REFERENCIA[sexo];
    const imc = medida.peso_kg / (medida.altura_cm / 100) ** 2;
    const fatorPeso = Math.min(Math.max((imc / 22) ** 0.55, 0.7), 1.9);
    const fatorAltura = medida.altura_cm / referencia.altura;
    const estimadas = {};
    Object.entries(referencia.medidas).forEach(([chave, valor]) => {
        estimadas[chave] = valor * fatorAltura * fatorPeso;
    });
    return estimadas;
}

async function montarCorpo(medida, materiais) {
    const sexo = medida.sexo_biologico === "masculino" ? "masculino" : "feminino";
    const modelo = await carregarModelo(sexo);
    const posicoes = new Float32Array(modelo.posicoes);
    const informadas = medida.circunferencias || {};
    const alturaM = medida.altura_cm / 100;
    const imc = medida.peso_kg / alturaM ** 2;

    const peso = interpolar(imc, [[15, 0], [22, 0.5], [38, 1]]);
    const massaLivre = medida.resultados?.massa_livre_gordura_kg;
    const musculo = massaLivre
        ? interpolar(massaLivre / alturaM ** 2, sexo === "masculino" ? [[16, 0], [19, 0.5], [24, 1]] : [[12.5, 0], [15.5, 0.5], [19, 1]])
        : 0.5;
    const pesosMusculo = pesosDaFaixa(musculo);
    const pesosPeso = pesosDaFaixa(peso);
    FAIXAS.forEach((m) => {
        FAIXAS.forEach((w) => {
            if (m === "average" && w === "average") return;
            aplicarMorph(posicoes, modelo.morphs[`${m}-${w}`], pesosMusculo[m] * pesosPeso[w]);
        });
    });

    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 1; i < posicoes.length; i += 3) {
        if (posicoes[i] < minY) minY = posicoes[i];
        if (posicoes[i] > maxY) maxY = posicoes[i];
    }
    const escala = alturaM / ((maxY - minY) * 0.1);
    const emCm = (valor) => valor * 10 * escala;

    for (let passada = 0; passada < 2; passada += 1) {
        AJUSTES.forEach((ajuste) => {
            const bruto = typeof ajuste.medida === "function" ? ajuste.medida(informadas) : informadas[ajuste.medida];
            if (!bruto) return;
            const alvo = bruto * (ajuste.fator || 1);
            const regua = modelo.reguas[ajuste.regua];
            const atual = emCm(perimetro(posicoes, regua));
            const direcao = alvo > atual ? "incr" : "decr";
            const morph = modelo.morphs[`${ajuste.regua}-${direcao}`];
            const teste = new Float32Array(posicoes);
            aplicarMorph(teste, morph, 1);
            const variacao = Math.abs(emCm(perimetro(teste, regua)) - atual);
            if (variacao < 0.01) return;
            const pesoMorph = Math.min(Math.abs(alvo - atual) / variacao, direcao === "incr" ? 2 : 1);
            aplicarMorph(posicoes, morph, pesoMorph);
        });
    }

    const medidasModelo = {
        pescoco: emCm(perimetro(posicoes, modelo.reguas.neck)),
        torax: emCm(perimetro(posicoes, modelo.reguas.bust)),
        cintura: emCm(perimetro(posicoes, modelo.reguas.waist)),
        quadril: emCm(perimetro(posicoes, modelo.reguas.hips)),
        braco_relaxado: emCm(perimetro(posicoes, modelo.reguas.upperarm)),
        coxa_medial: emCm(perimetro(posicoes, modelo.reguas.thigh)),
        panturrilha: emCm(perimetro(posicoes, modelo.reguas.calf)),
    };
    const estimadas = estimarMedidas(medida, sexo);

    for (let i = 0; i < posicoes.length; i += 3) {
        posicoes[i] *= 0.1 * escala;
        posicoes[i + 1] = (posicoes[i + 1] - minY) * 0.1 * escala;
        posicoes[i + 2] *= 0.1 * escala;
    }

    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute("position", new THREE.BufferAttribute(posicoes, 3));
    geometria.setIndex(new THREE.BufferAttribute(new Uint16Array(modelo.indices), 1));
    geometria.computeVertexNormals();
    const grupo = new THREE.Group();
    grupo.add(new THREE.Mesh(geometria, materiais.pele));

    const normais = geometria.getAttribute("normal").array;
    const alturaRegua = (nome) => modelo.reguas[nome].reduce((soma, i) => soma + posicoes[i * 3 + 1], 0) / modelo.reguas[nome].length;
    const larguraRegua = (nome) => Math.max(...modelo.reguas[nome].map((i) => Math.abs(posicoes[i * 3])));
    const yCintura = alturaRegua("waist");
    const yQuadril = alturaRegua("hips");
    const yCoxa = alturaRegua("thigh");
    const faixas = [{
        yMin: sexo === "masculino" ? yCoxa - (yQuadril - yCoxa) * 0.3 : yCoxa + (yQuadril - yCoxa) * 0.28,
        yMax: yQuadril + (yCintura - yQuadril) * 0.55,
        xMax: larguraRegua("hips") * 1.35,
    }];
    if (sexo === "feminino") {
        const yBusto = alturaRegua("bust");
        const yAbaixo = alturaRegua("underbust");
        faixas.push({
            yMin: yAbaixo - (yBusto - yAbaixo) * 0.45,
            yMax: yBusto + (yBusto - yAbaixo) * 1.15,
            lacuna: alturaM * 0.02,
            top: true,
        });
    }
    faixas.forEach((faixa) => {
        const roupa = faixa.top
            ? montarTop(posicoes, modelo.indices, modelo.triangulosCorpo, faixa, alturaM * 0.003)
            : montarRoupa(posicoes, normais, modelo.indices, modelo.triangulosCorpo, faixa, alturaM * 0.0032);
        grupo.add(new THREE.Mesh(roupa, materiais.roupa));
    });

    const ponto = (indice) => new THREE.Vector3(posicoes[indice * 3], posicoes[indice * 3 + 1], posicoes[indice * 3 + 2]);
    const extremo = (nomeRegua, lado) => {
        const regua = modelo.reguas[nomeRegua];
        let melhor = ponto(regua[0]);
        regua.forEach((indice) => {
            const p = ponto(indice);
            if (lado < 0 ? p.x < melhor.x : p.x > melhor.x) melhor = p;
        });
        return melhor;
    };
    const ladoDe = (nomeRegua) => {
        const regua = modelo.reguas[nomeRegua];
        const media = regua.reduce((soma, indice) => soma + posicoes[indice * 3], 0) / regua.length;
        return media < 0 ? -1 : 1;
    };

    const cintura = extremo("waist", -1);
    const quadril = extremo("hips", -1);
    const braco = extremo("upperarm", ladoDe("upperarm"));
    const punho = extremo("wrist", ladoDe("wrist"));
    const coxa = extremo("thigh", ladoDe("thigh"));
    const joelho = extremo("knee", ladoDe("knee"));
    const ancoras = {
        pescoco: extremo("neck", -1),
        ombro: extremo("shoulder", -1),
        torax: extremo("bust", -1),
        cintura,
        abdomen: cintura.clone().lerp(quadril, 0.45),
        quadril,
        braco_relaxado: braco,
        antebraco: braco.clone().lerp(punho, 0.6),
        coxa_proximal: coxa.clone().add(new THREE.Vector3(0, alturaM * 0.045, 0)),
        coxa_medial: coxa,
        coxa_distal: joelho.clone().lerp(coxa, 0.3),
        panturrilha: extremo("calf", ladoDe("calf")),
    };

    const valores = {};
    const estimada = new Set();
    ROTULOS.forEach(({ chave }) => {
        if (informadas[chave]) {
            valores[chave] = informadas[chave];
        } else {
            valores[chave] = medidasModelo[chave] ?? estimadas[chave];
            estimada.add(chave);
        }
    });

    return { corpo: grupo, ancoras, valores, estimada, altura: alturaM };
}

function criarVisualizador(container) {
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
        container.textContent = "Seu navegador não conseguiu exibir o modelo 3D.";
        return { atualizar() {}, capturar() { return null; } };
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.classList.add("body-viewer--ativo");
    container.append(renderer.domElement);

    const camada = document.createElement("div");
    camada.className = "body-viewer__labels";
    const linhas = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    linhas.classList.add("body-viewer__lines");
    const carregando = document.createElement("p");
    carregando.className = "body-viewer__loading";
    carregando.textContent = "Carregando modelo 3D...";
    container.append(linhas, camada, carregando);

    const cena = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
    cena.add(new THREE.HemisphereLight(0xffffff, 0xc9d3ca, 1.3));
    const principal = new THREE.DirectionalLight(0xffffff, 2.1);
    principal.position.set(1.6, 2.8, 3.2);
    cena.add(principal);
    const preenchimento = new THREE.DirectionalLight(0xf1efe8, 0.8);
    preenchimento.position.set(-2.5, 1.5, 2);
    cena.add(preenchimento);
    const contorno = new THREE.DirectionalLight(0xffffff, 1.1);
    contorno.position.set(0, 2.5, -3.5);
    cena.add(contorno);

    const sombra = new THREE.Mesh(
        new THREE.CircleGeometry(0.38, 48),
        new THREE.MeshBasicMaterial({ color: 0x0d5017, transparent: true, opacity: 0.08 }),
    );
    sombra.rotation.x = -Math.PI / 2;
    sombra.position.y = 0.001;
    cena.add(sombra);

    const materiais = {
        pele: new THREE.MeshStandardMaterial({ color: 0xe4d9cd, roughness: 0.62, metalness: 0 }),
        roupa: new THREE.MeshStandardMaterial({ color: 0xb8d9bd, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }),
    };
    const controles = new OrbitControls(camera, renderer.domElement);
    controles.enablePan = false;
    controles.enableDamping = true;
    controles.autoRotate = true;
    controles.autoRotateSpeed = 1.0;
    controles.minPolarAngle = Math.PI * 0.3;
    controles.maxPolarAngle = Math.PI * 0.62;
    controles.addEventListener("start", () => {
        controles.autoRotate = false;
    });

    let atual = null;
    let versao = 0;
    let elementosRotulo = [];

    function enquadrar(altura) {
        controles.target.set(0, altura * 0.52, 0);
        const tangente = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const distancia = Math.max((altura * 0.58) / tangente, (altura * 0.5) / (tangente * camera.aspect));
        camera.position.set(0, altura * 0.55, distancia);
        controles.minDistance = distancia * 0.55;
        controles.maxDistance = distancia * 1.5;
        controles.update();
    }

    function redimensionar() {
        const largura = container.clientWidth;
        const alturaTela = container.clientHeight;
        if (!largura || !alturaTela) return;
        renderer.setSize(largura, alturaTela, false);
        camera.aspect = largura / alturaTela;
        camera.updateProjectionMatrix();
        if (atual) enquadrar(atual.altura);
        linhas.setAttribute("viewBox", `0 0 ${largura} ${alturaTela}`);
    }

    function criarRotulos(info) {
        camada.replaceChildren();
        elementosRotulo = ROTULOS.map((rotulo) => {
            const ancora = info.ancoras[rotulo.chave];
            const lado = rotulo.torso || ancora.x < 0 ? "esquerda" : "direita";
            const elemento = document.createElement("div");
            elemento.className = `body-label body-label--${lado}`;
            if (info.estimada.has(rotulo.chave)) {
                elemento.classList.add("body-label--estimado");
                elemento.title = "Medida não informada: valor estimado.";
            }
            const nome = document.createElement("span");
            nome.textContent = rotulo.nome;
            const valor = document.createElement("strong");
            valor.textContent = `${info.valores[rotulo.chave].toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cm`;
            elemento.append(nome, valor);
            camada.append(elemento);
            return { ...rotulo, lado, elemento };
        });
    }

    const centro = new THREE.Vector3();
    function posicionarRotulos() {
        if (!atual) return;
        const largura = container.clientWidth;
        const alturaTela = container.clientHeight;
        const espaco = largura < 520 ? 30 : 36;
        centro.copy(controles.target);
        const direcaoCamera = camera.position.clone().sub(centro).setY(0).normalize();
        const grupos = { esquerda: [], direita: [] };
        elementosRotulo.forEach((rotulo) => {
            const ponto = atual.ancoras[rotulo.chave].clone();
            const visivel = ponto.clone().sub(centro).setY(0).normalize().dot(direcaoCamera) > -0.25;
            const tela = ponto.project(camera);
            grupos[rotulo.lado].push({
                rotulo,
                px: (tela.x * 0.5 + 0.5) * largura,
                py: (-tela.y * 0.5 + 0.5) * alturaTela,
                visivel,
            });
        });
        let svg = "";
        Object.entries(grupos).forEach(([lado, itens]) => {
            itens.sort((a, b) => a.py - b.py);
            let ultimo = -Infinity;
            itens.forEach((item) => {
                const y = Math.min(Math.max(item.py, ultimo + espaco, 16), alturaTela - 16);
                ultimo = y;
                const elemento = item.rotulo.elemento;
                elemento.style.top = `${y}px`;
                elemento.style.opacity = item.visivel ? "1" : "0.35";
                const borda = lado === "esquerda" ? elemento.offsetWidth + 8 : largura - elemento.offsetWidth - 8;
                svg += `<line x1="${borda}" y1="${y}" x2="${item.px}" y2="${item.py}" opacity="${item.visivel ? 0.7 : 0.2}"/>`;
                svg += `<circle cx="${item.px}" cy="${item.py}" r="3" opacity="${item.visivel ? 1 : 0.3}"/>`;
            });
        });
        linhas.innerHTML = svg;
    }

    function animar() {
        controles.update();
        renderer.render(cena, camera);
        posicionarRotulos();
        requestAnimationFrame(animar);
    }

    new ResizeObserver(redimensionar).observe(container);
    redimensionar();
    requestAnimationFrame(animar);

    return {
        capturar() {
            if (!atual) return null;
            const posicao = camera.position.clone();
            const distancia = posicao.distanceTo(controles.target);
            camera.position.set(controles.target.x, controles.target.y + atual.altura * 0.03, controles.target.z + distancia);
            camera.lookAt(controles.target);
            renderer.render(cena, camera);
            const imagem = renderer.domElement.toDataURL("image/png");
            camera.position.copy(posicao);
            controles.update();
            return imagem;
        },
        async atualizar(medida) {
            const minhaVersao = ++versao;
            carregando.hidden = false;
            try {
                const novo = await montarCorpo(medida, materiais);
                if (minhaVersao !== versao) return;
                if (atual) {
                    cena.remove(atual.corpo);
                    atual.corpo.traverse((objeto) => objeto.geometry && objeto.geometry.dispose());
                }
                atual = novo;
                cena.add(atual.corpo);
                enquadrar(atual.altura);
                criarRotulos(atual);
            } catch (erro) {
                carregando.textContent = erro.message || "Não foi possível carregar o modelo 3D.";
                return;
            }
            carregando.hidden = true;
        },
    };
}

window.NutriBoneco = { criarVisualizador };
window.dispatchEvent(new Event("nutri-boneco-pronto"));
