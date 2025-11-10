// ==================== IMPORTS ====================
const { default: makeWASocket, useSingleFileAuthState, delay } = require("@whiskeysockets/baileys");
const express = require("express");
const QRCode = require("qrcode");

// ==================== AUTH ====================
const { state, saveState } = useSingleFileAuthState("./auth_info.json");

// ==================== EXPRESS SERVER ====================
const app = express();
const PORT = process.env.PORT || 3000;

// Endpoint principal
app.get("/", (req, res) => {
    res.send("<h1>Bot de WhatsApp corriendo</h1>");
});

app.listen(PORT, () => console.log(`Servidor web corriendo en puerto ${PORT}`));

// ==================== BOT SOCKET ====================
const sock = makeWASocket({ auth: state });
sock.ev.on("creds.update", saveState);

// ==================== CONEXIÓN Y QR ====================
sock.ev.on("connection.update", async (update) => {
    const { connection, qr } = update;

    if (qr) {
        console.log("QR generado en terminal:");
        require("qrcode-terminal").generate(qr, { small: true });

        // Mostrar QR grande en navegador
        app.get("/", async (req, res) => {
            const qrImage = await QRCode.toDataURL(qr);
            res.send(`
                <html>
                <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;">
                    <h1>Escanea este QR con WhatsApp</h1>
                    <img src="${qrImage}" style="width:400px;height:400px;" />
                </body>
                </html>
            `);
        });
    }

    if (connection === "open") console.log("✅ Conectado a WhatsApp!");
});

// ==================== FUNCIONES DEL BOT ====================

// Mapa para guardar reacciones/votos por mensaje
const voteData = {}; // { mensajeId: { votantes: Set(), todos: Set() } }

// Función para contar votos/reacciones
async function contarVotaciones(mensaje) {
    const mensajeId = mensaje.key.id;

    if (!voteData[mensajeId]) {
        voteData[mensajeId] = { votantes: new Set(), todos: new Set() };
    }

    const grupo = mensaje.key.remoteJid;

    // Guardar a todos los participantes del grupo
    if (!voteData[mensajeId].todos.size) {
        const groupMetadata = await sock.groupMetadata(grupo);
        groupMetadata.participants.forEach(p => voteData[mensajeId].todos.add(p.id));
    }

    // Revisar reacciones (WhatsApp soporta extensiones)
    const reactions = mensaje.message?.reactionMessage?.text || [];
    reactions.forEach(userId => voteData[mensajeId].votantes.add(userId));
}

// Función para mostrar fantasmas (no votaron ni reaccionaron)
function getFantasmas(mensajeId) {
    const data = voteData[mensajeId];
    if (!data) return [];

    const fantasmas = [...data.todos].filter(u => !data.votantes.has(u));
    return fantasmas;
}

// ==================== EVENTO DE MENSAJES ====================
sock.ev.on("messages.upsert", async ({ messages, type }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

    // Comando para mostrar fantasmas de un mensaje
    if (text === "#fantasmas") {
        const mensajeId = msg.key.id; // Podrías cambiar por ID de encuesta específica
        const fantasmas = getFantasmas(mensajeId);
        await sock.sendMessage(msg.key.remoteJid, { text: "Usuarios que no votaron ni reaccionaron:\n" + fantasmas.join("\n") });
    }

    // Contar reacciones/votos
    await contarVotaciones(msg);
});
