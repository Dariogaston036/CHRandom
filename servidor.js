const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const aplicacion = express();
const servidor = http.createServer(aplicacion);
const io = new Server(servidor, {
  cors: { origen: "*" },
});

aplicacion.use(express.static("público"));

// Cola de usuarios esperando
const colaDeEspera = [];
// Salas activas: { usuarioA: socket.id, usuarioB: socket.id }
const salasActivas = new Map();

io.on("connection", (socket) => {
  console.log(`Usuario conectado: ${socket.id}`);

  // Enviar estado inicial
  socket.emit("estado", {
    enEspera: colaDeEspera.length,
    activo: false,
    salaId: null,
  });

  socket.on("buscar", () => {
    // Si ya está en cola, no lo vuelvas a agregar
    if (colaDeEspera.includes(socket.id)) return;

    colaDeEspera.push(socket.id);
    console.log(`${socket.id} está buscando. Cola: ${colaDeEspera.length}`);

    // Notificar a todos sobre la cola
    io.emit("estado_cola", colaDeEspera.length);

    // Si hay al menos 2, matchea
    if (colaDeEspera.length >= 2) {
      const usuario1 = colaDeEspera.shift();
      const usuario2 = colaDeEspera.shift();
      const salaId = `sala_${usuario1}_${usuario2}`;

      // Guardar la sala
      salasActivas.set(salaId, { usuario1, usuario2 });

      // Agregar usuarios a la sala de Socket.io
      const socket1 = io.sockets.sockets.get(usuario1);
      const socket2 = io.sockets.sockets.get(usuario2);

      if (socket1) socket1.join(salaId);
      if (socket2) socket2.join(salaId);

      // Notificar que encontró pareja
      io.to(salaId).emit("parejaEncontrada", { salaId });
      io.emit("estado_cola", colaDeEspera.length);

      console.log(
        `✓ Match: ${usuario1.slice(0, 5)} <-> ${usuario2.slice(0, 5)}`
      );
    }
  });

  socket.on("mensaje", (data) => {
    // Buscar a qué sala pertenece
    let salaId = null;
    for (let [sala, usuarios] of salasActivas.entries()) {
      if (usuarios.usuario1 === socket.id || usuarios.usuario2 === socket.id) {
        salaId = sala;
        break;
      }
    }

    if (salaId) {
      // Enviar a la otra persona en la sala
      socket.to(salaId).emit("mensaje", {
        texto: data.texto,
        timestamp: Date.now(),
      });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Usuario desconectado: ${socket.id}`);

    // Remover de cola
    const indexEnCola = colaDeEspera.indexOf(socket.id);
    if (indexEnCola !== -1) {
      colaDeEspera.splice(indexEnCola, 1);
    }

    // Remover de sala y notificar al otro
    for (let [salaId, usuarios] of salasActivas.entries()) {
      if (usuarios.usuario1 === socket.id || usuarios.usuario2 === socket.id) {
        io.to(salaId).emit("otraPersonaSeDesconecto");
        salasActivas.delete(salaId);
        break;
      }
    }

    io.emit("estado_cola", colaDeEspera.length);
  });

  // Para re-intentar (vuelve a la cola)
  socket.on("reintentar", () => {
    // Remover de salas anteriores
    for (let [salaId, usuarios] of salasActivas.entries()) {
      if (usuarios.usuario1 === socket.id || usuarios.usuario2 === socket.id) {
        socket.leave(salaId);
        salasActivas.delete(salaId);
      }
    }

    // Volver a la cola
    if (!colaDeEspera.includes(socket.id)) {
      colaDeEspera.push(socket.id);
    }

    socket.emit("estado", {
      enEspera: colaDeEspera.length,
      activo: false,
      salaId: null,
    });

    io.emit("estado_cola", colaDeEspera.length);
  });
});

const puerto = process.env.PORT || 3000;
servidor.listen(puerto, () => {
  console.log(`🚀 Servidor corriendo en puerto ${puerto}`);
});
