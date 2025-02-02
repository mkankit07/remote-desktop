// server/index.js
const express = require("express");
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["*"],
    credentials: true,
  },
});
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
    optionsSuccessStatus: 204,
  })
);

// Store active rooms and their participants
const rooms = new Map(); // roomId -> { hostId, viewers: Set, hostSocket }

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // Host creates a new room
  socket.on("requestConnection", () => {
    // const roomId = uuidv4();
    const roomId = "1234567"
    rooms.set(roomId, {
      hostId: socket.id,
      viewers: new Set(),
      hostSocket: socket,
    });
    socket.join(roomId);
    socket.emit("connectionEstablished", {
      connectionId: roomId,
      viewerCount: 0,
    });
    console.log(`Host ${socket.id} created room ${roomId}`);
  });

  // Viewer joins a room
  socket.on("joinConnection", ({ connectionId }) => {
    const room = rooms.get(connectionId);
    if (room) {
      room.viewers.add(socket.id);
      socket.join(connectionId);

      // Notify host about new viewer
      io.to(room.hostId).emit("viewerJoined", {
        viewerId: socket.id,
        roomId: connectionId,
        viewerCount: room.viewers.size,
      });

      // Notify viewer about successful join
      socket.emit("joinedRoom", {
        hostId: room.hostId,
        roomId: connectionId,
        viewerCount: room.viewers.size,
      });

      // Notify all viewers about updated viewer count
      io.to(connectionId).emit("viewerCountUpdated", {
        count: room.viewers.size,
      });

      console.log(
        `Viewer ${socket.id} joined room ${connectionId}. Total viewers: ${room.viewers.size}`
      );
    } else {
      socket.emit("error", {
        message: "Invalid connection ID or room no longer exists",
      });
    }
  });

  // Handle WebRTC signaling
  socket.on("offer", ({ offer, to, roomId }) => {
    io.to(to).emit("offer", { offer, from: socket.id, roomId });
  });

  socket.on("answer", ({ answer, to, roomId }) => {
    io.to(to).emit("answer", { answer, from: socket.id, roomId });
  });

  socket.on("iceCandidate", ({ candidate, to, roomId }) => {
    io.to(to).emit("iceCandidate", { candidate, from: socket.id, roomId });
  });

  // Handle disconnections
  socket.on("disconnect", () => {
    // Check all rooms for the disconnected socket
    for (const [roomId, room] of rooms.entries()) {
      if (room.hostId === socket.id) {
        // Host disconnected, notify all viewers
        room.viewers.forEach((viewerId) => {
          io.to(viewerId).emit("hostDisconnected", {
            message: "Host has disconnected",
          });
        });
        rooms.delete(roomId);
        console.log(`Host ${socket.id} disconnected, room ${roomId} closed`);
      } else if (room.viewers.has(socket.id)) {
        // Viewer disconnected
        room.viewers.delete(socket.id);
        // Notify host and remaining viewers
        io.to(roomId).emit("viewerCountUpdated", {
          count: room.viewers.size,
        });
        io.to(room.hostId).emit("viewerDisconnected", {
          viewerId: socket.id,
          remainingViewers: room.viewers.size,
        });
        console.log(
          `Viewer ${socket.id} disconnected from room ${roomId}. Remaining viewers: ${room.viewers.size}`
        );
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
