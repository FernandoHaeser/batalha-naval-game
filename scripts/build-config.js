const fs = require("fs");
const path = require("path");

const serverUrl = (process.env.SOCKET_SERVER_URL || "").trim().replace(/\/+$/, "");
const target = path.join(__dirname, "..", "public", "config.js");

fs.writeFileSync(target, `window.SOCKET_SERVER_URL = ${JSON.stringify(serverUrl)};\n`);

console.log(serverUrl
    ? `config.js gerado com SOCKET_SERVER_URL=${serverUrl}`
    : "config.js gerado sem SOCKET_SERVER_URL (modo online usara o mesmo dominio)");
