(function () {
    const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    window.NUTRILIFE_API_URL = window.NUTRILIFE_API_URL
        || (isLocal ? "http://localhost:8000" : "https://nutrilife-of.onrender.com");
})();
