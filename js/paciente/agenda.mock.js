window.gerarAgendaMock = function (nutriId, ano, mes) {
    const horariosBase = ["08:00", "09:30", "11:00", "14:00", "15:30", "17:00"];
    const totalDias = new Date(ano, mes + 1, 0).getDate();
    const agenda = {};

    for (let dia = 1; dia <= totalDias; dia++) {
        const semana = new Date(ano, mes, dia).getDay();
        if (semana === 0) continue;

        const chave = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
        const semente = (dia * 7 + mes * 3 + nutriId * 5) % 10;

        if (semente === 0 || semente === 4) {
            agenda[chave] = { fechada: true, horarios: [] };
            continue;
        }

        const quantidade = semente % 4;
        const horarios = horariosBase
            .filter((hora) => semana !== 6 || hora < "12:00")
            .filter((_, i) => (i * 3 + semente) % 5 < quantidade);

        agenda[chave] = { fechada: false, horarios };
    }

    return agenda;
};

window.agendarConsultaMock = function (agendamento) {
    console.info("[mock] agendar consulta:", agendamento);
};
