window.ESPECIALIDADES = [
    "Nutrição clínica",
    "Nutrição esportiva",
    "Nutrição materno-infantil",
    "Nutrição pediátrica",
    "Nutrição em gerontologia (idosos)",
    "Nutrição funcional",
    "Nutrição comportamental",
    "Nutrição vegetariana e vegana",
    "Emagrecimento e obesidade",
    "Diabetes e endocrinologia",
    "Nutrição cardiovascular",
    "Nutrição renal",
    "Nutrição oncológica",
    "Transtornos alimentares",
    "Alergias e intolerâncias alimentares",
    "Saúde da mulher",
    "Nutrição estética",
    "Fitoterapia",
    "Nutrição enteral e parenteral",
    "Saúde coletiva"
];

window.preencherEspecialidades = function (select) {
    window.ESPECIALIDADES.forEach((nome) => select.add(new Option(nome, nome)));
};
