(function () {
    const WHATSAPP_SUPORTE = "";

    const botao = document.getElementById("whatsapp-suporte");
    if (!WHATSAPP_SUPORTE || !botao) return;

    botao.href = `https://wa.me/${WHATSAPP_SUPORTE}`;
    botao.hidden = false;
})();
