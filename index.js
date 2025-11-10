import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import "./keep_alive.js";

const votos = {};

async function connectBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./session");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    printQRInTerminal: true,
    auth: state,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    if (msg.message.pollCreationMessage) {
      const pollId = msg.key.id;
      votos[pollId] = { votantes: new Set() };
      await sock.sendMessage(from, { text: `✅ Encuesta detectada (ID: ${pollId})` });
    }

    if (msg.message.pollUpdateMessage) {
      const pollId = msg.message.pollUpdateMessage.pollCreationMessageKey.id;
      if (votos[pollId]) votos[pollId].votantes.add(sender);
    }

    if (msg.message.conversation === "!no_votaron") {
      const pollIds = Object.keys(votos);
      if (pollIds.length === 0)
        return sock.sendMessage(from, { text: "❌ No se han detectado encuestas aún." });

      const pollId = pollIds[pollIds.length - 1];
      const groupMetadata = await sock.groupMetadata(from);
      const allMembers = groupMetadata.participants.map(p => p.id);
      const noVotaron = allMembers.filter(m => !votos[pollId].votantes.has(m));

      const lista = noVotaron.map(u => "• " + u.replace("@s.whatsapp.net", "")).join("\n");
      await sock.sendMessage(from, {
        text: `👥 No votaron (${noVotaron.length}):\n${lista || "Todos votaron 🎉"}`
      });
    }
  });

  sock.ev.on("connection.update", ({ connection, qr }) => {
    if (qr) qrcode.generate(qr, { small: true });
    if (connection === "close") {
      console.log("❌ Conexión cerrada. Reintentando...");
      connectBot();
    } else if (connection === "open") {
      console.log("✅ Bot conectado correctamente a WhatsApp!");
    }
  });
}

connectBot();
