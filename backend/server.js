// server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Configure Socket.IO
// Allow connections from any origin for development (adjust for production!)
const io = new Server(server, {
    cors: {
        origin: "*", // Allows all origins. For production, restrict this to your frontend's URL.
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// In-memory storage for player data
// Key: socket.id, Value: { id: socket.id, position: {x,y,z}, rotation: {x,y,z,w}, lapCount: 0 }
let players = {};

// --- Socket.IO Event Handling ---

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // 1. Create a new player entry with quaternion rotation and lap count
    players[socket.id] = {
        id: socket.id,
        position: { x: 0, y: 0.5, z: 55 }, // Match frontend starting Z pos for consistency
        rotation: { x: 0, y: 0, z: 0, w: 1 }, // Default rotation (Identity Quaternion - facing Z+)
        lapCount: 0 // Initialize lap count
    };
    console.log('Current players:', Object.keys(players).length);

    // 2. Send the list of *already connected* players to the *new* player
    // Includes their positions, rotations, and lap counts
    socket.emit('currentPlayers', players);

    // 3. Announce the *new* player (with full state) to *all other* existing players
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // 4. Handle player movement/state updates from a client
    socket.on('playerUpdate', (playerData) => {
        // Ensure the player exists and data structure is as expected
        if (players[socket.id] && playerData.position && playerData.rotation) {
            // Update the player's data on the server, including the full quaternion
            players[socket.id] = {
                ...players[socket.id], // Keep existing data like ID, lapCount, etc.
                position: playerData.position,
                rotation: playerData.rotation // Store the {x, y, z, w} object
            };

            // Broadcast the updated data (including full rotation) to *all other* players
            socket.broadcast.emit('opponentUpdate', players[socket.id]);
        } else {
            console.warn(`Received incomplete or invalid update for player: ${socket.id}`, playerData);
        }
    });

    // 5. Handle lap completion
    socket.on('lapCompleted', (data) => {
        if (players[socket.id] && data.lapCount) {
            // Basic validation: Ensure lapCount is sequential to prevent cheating
            if (data.lapCount === players[socket.id].lapCount + 1) {
                players[socket.id].lapCount = data.lapCount;
                console.log(`Player ${socket.id} completed lap ${players[socket.id].lapCount}`);
                // Broadcast to all other players
                socket.broadcast.emit('lapCompleted', { id: socket.id, lapCount: players[socket.id].lapCount });
                // Check for winning condition (3 laps)
                if (players[socket.id].lapCount >= 3) {
                    console.log(`Player ${socket.id} wins!`);
                    io.emit('playerWon', { id: socket.id });
                }
            } else {
                console.warn(`Invalid lap count update from player ${socket.id}: expected ${players[socket.id].lapCount + 1}, got ${data.lapCount}`);
            }
        }
    });

    // 6. Handle player disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // Remove player from the server state
        delete players[socket.id];
        // Notify all *remaining* players that this player has left
        io.emit('playerDisconnected', socket.id); // Send the ID of the disconnected player
        console.log('Current players:', Object.keys(players).length);
    });
});

// Basic HTTP route (optional, useful for health checks)
app.get('/', (req, res) => {
    res.send('Monad Velocity Backend is Running!');
});

server.listen(PORT, () => {
    console.log(`Server listening on *:${PORT}`);
});