const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Room storage: { roomCode: { players: { socketId: playerData }, started: boolean } }
const rooms = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('createRoom', ({playerName}) => {
    const roomCode = generateRoomCode();
    rooms[roomCode] = { players: {}, started: false };
    socket.join(roomCode);
    rooms[roomCode].players[socket.id] = {
      id: socket.id,
      name: playerName,
      position: { x: 0, y: 0.5, z: 55 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      lapCount: 0
    };
    socket.emit('roomCreated', { roomCode });
    console.log(rooms)
    // socket.emit('currentPlayers', rooms[roomCode].players);
  });

  socket.on('joinRoom', ({ roomCode, playerName }) => {
    if (rooms[roomCode]) {
      if (rooms[roomCode].started) {
        socket.emit('joinError', { message: 'Race has already started.' });
      } else if (Object.keys(rooms[roomCode].players).length >= 4) {
        socket.emit('joinError', { message: 'Room is full.' });
      } else {
        socket.join(roomCode);
        rooms[roomCode].players[socket.id] = {
          id: socket.id,
          name: playerName,
          position: { x: 0, y: 0.5, z: 55 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          lapCount: 0
        };
        // socket.emit('currentPlayers', rooms[roomCode].players);
        socket.to(roomCode).emit('newPlayer', rooms[roomCode].players[socket.id]);
        socket.emit('joinSuccess');
        if (Object.keys(rooms[roomCode].players).length >= 2 && !rooms[roomCode].started) {
          rooms[roomCode].started = true;
          io.to(roomCode).emit('raceStart');
        }
      }
    } else {
      socket.emit('joinError', { message: 'Room does not exist.' });
    }
  });

  socket.on('getUpdate', ({ roomCode }) => {
    if (roomCode && typeof roomCode === 'string' && rooms[roomCode]) {
      console.log("PD",rooms[roomCode].players)
      socket.emit('currentPlayers', rooms[roomCode].players);
    } else {
      console.error(`Invalid roomCode received in getUpdate: ${roomCode}`);
      socket.emit('joinError', { message: 'Invalid or non-existent room code.' });
    }
  });
  

  socket.on('playerUpdate', (playerData) => {
    const roomCode = getRoomCode(socket);
    if (roomCode && rooms[roomCode].players[socket.id]) {
      rooms[roomCode].players[socket.id] = {
        ...rooms[roomCode].players[socket.id],
        position: playerData.position,
        rotation: playerData.rotation
      };
      socket.to(roomCode).emit('opponentUpdate', rooms[roomCode].players[socket.id]);
    }
  });

  socket.on('lapCompleted', (data) => {
    const roomCode = getRoomCode(socket);
    if (rooms[roomCode] && rooms[roomCode].players[socket.id] && data.lapCount) {
      if (data.lapCount === rooms[roomCode].players[socket.id].lapCount + 1) {
        rooms[roomCode].players[socket.id].lapCount = data.lapCount;
        socket.to(roomCode).emit('lapCompleted', { id: socket.id, lapCount: data.lapCount });
        if (data.lapCount >= 3) {
          io.to(roomCode).emit('playerWon', { id: socket.id });
        }
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    const roomCode = getRoomCode(socket);
    if (roomCode && rooms[roomCode] && rooms[roomCode].players[socket.id]) {
      delete rooms[roomCode].players[socket.id];
      io.to(roomCode).emit('playerDisconnected', socket.id);
      if (Object.keys(rooms[roomCode].players).length === 0) {
        delete rooms[roomCode];
      }
    }
  });
});

function getRoomCode(socket) {
  const roomsArray = Array.from(socket.rooms);
  return roomsArray.find(room => room !== socket.id);
}

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  if (rooms[code]) {
    return generateRoomCode();
  }
  return code;
}

app.get('/', (req, res) => {
  res.send('Monad Velocity Backend is Running!');
});

server.listen(PORT, () => {
  console.log(`Server listening on *:${PORT}`);
});