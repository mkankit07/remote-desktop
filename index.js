const express = require('express');
const app = express();
const cors = require('cors');

app.use(cors({origin:"*"}))
const server = require("http").Server(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "*",  // Allow all origins
    methods: ["GET", "POST"],
    allowedHeaders: ["*"],
    credentials: true
  }
})
const {v4:uuuidv4}= require("uuid")

const PORT = process.env.PORT || 3000
const connections = new Map()


io.on("connection", (socket)=>{

    console.log("New client connected");

    socket.on("requestConnection", ()=>{
        const connectionId = uuuidv4()
        connections.set(connectionId, socket.id)
        socket.emit("connectionEstablished", {connectionId})
    })

    socket.on("joinConnection",({connectionId})=>{
        const hostSocketId = connections.get(connectionId)
        if(hostSocketId) {
            io.to(hostSocketId).emit("remoteConnectionRequest",{
                fromSocket:socket.io
            })
        }
    })

    socket.on('offer', ({ offer, to }) => {
        io.to(to).emit('offer', { offer, from: socket.id });
      });
    
      socket.on('answer', ({ answer, to }) => {
        io.to(to).emit('answer', { answer, from: socket.id });
      });
    
      socket.on('iceCandidate', ({ candidate, to }) => {
        io.to(to).emit('iceCandidate', { candidate, from: socket.id });
      });
    
      socket.on('disconnect', () => {
        // Remove disconnected client
        for (const [connectionId, socketId] of connections.entries()) {
          if (socketId === socket.id) {
            connections.delete(connectionId);
          }
        }
      });
})

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });