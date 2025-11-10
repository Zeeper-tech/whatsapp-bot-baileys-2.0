import express from "express";
const app = express();

app.get("/", (req, res) => res.send("Bot de WhatsApp activo ✅"));
app.listen(3000, () => console.log("Servidor keep_alive corriendo en puerto 3000"));
