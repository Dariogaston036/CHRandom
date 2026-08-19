// server.js — Servidor de señalización + matchmaking para chat random tipo Omegle
// Node.js + Express + Socket.io

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(express.static("public"));

let waitingQueue = [];
const activePairs = new Map();

function removeFromQueue(socketId) {
  waitingQueue = waitingQueue.filter((u) => u.socketId !== socketId);
}

function findMatch(newUser) {
  for (let i = 0; i < waitingQueue.length; i++) {
    const candidate = waitingQueue[i];
    const aAceptaB =
      newUser.buscaGenero === "cualquiera" || newUser.buscaGenero === candidate.genero;
    const bAceptaA =
      candidate.buscaGenero === "cualquiera" || candidate.buscaGenero === newUser.genero;

    if (aAceptaB && bAceptaA) {
      waitingQueue.splice(i, 1);
      return candidate;
    }
  }
  return null;
}

io.on("connection", (socket) => {
  console.log("Conectado:", socket.id);

  socket.on("buscar-pareja", ({ genero, buscaGenero }) => {
    const generosValidos = ["hombre", "mujer", "otro"];
    const busquedaValida = ["cualquiera", "hombre", "mujer"];
    if (!generosValidos.includes(genero) || !busquedaValida.includes(buscaGenero)) {
      socket.emit("error-match", "Preferencias inválidas");
      return;
    }

    const newUser = { socketId: socket.id, genero, buscaGenero };
    const match = findMatch(newUser);

    if (match) {
      activePairs.set(socket.id, match.socketId);
      activePairs.set(match.socketId, socket.id);

      io.to(match.socketId).emit("match-encontrado", { initiator: true, partnerId: socket.id });
      io.to(socket.id).emit("match-encontrado", { initiator: false, partnerId: match.socketId });
    } else {
      waitingQueue.push(newUser);
      socket.emit("esperando");
    }
  });

  socket.on("signal", ({ to, data }) => {
    io.to(to).emit("signal", { from: socket.id, data });
  });

  socket.on("siguiente", () => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit("partner-desconectado");
      activePairs.delete(partnerId);
      activePairs.delete(socket.id);
    }
    removeFromQueue(socket.id);
  });

  socket.on("reportar", ({ motivo }) => {
    const partnerId = activePairs.get(socket.id);
    console.log(`[REPORTE] ${socket.id} reportó a ${partnerId} — motivo: ${motivo}`);
  });

  socket.on("disconnect", () => {
    console.log("Desconectado:", socket.id);
    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit("partner-desconectado");
      activePairs.delete(partnerId);
      activePairs.delete(socket.id);
    }
    removeFromQueue(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
