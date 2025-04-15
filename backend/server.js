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
// Key: socket.id, Value: { id: socket.id, position: {x,y,z}, rotation: {x,y,z,w} }
let players = {};

// --- Socket.IO Event Handling ---

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // 1. Create a new player entry with quaternion rotation
    players[socket.id] = {
        id: socket.id,
        position: { x: 0, y: 0.5, z: 55 }, // Match frontend starting Z pos for consistency
        rotation: { x: 0, y: 0, z: 0, w: 1 }, // Default rotation (Identity Quaternion - facing Z+)
        // You could add other initial state like color, car model later
        // model: 'default',
        // color: Math.random() * 0xffffff // Example: Assign random color
    };
    console.log('Current players:', Object.keys(players).length);

    // 2. Send the list of *already connected* players to the *new* player
    // Includes their positions and rotations.
    socket.emit('currentPlayers', players);

    // 3. Announce the *new* player (with full state) to *all other* existing players
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // 4. Handle player movement/state updates from a client
    socket.on('playerUpdate', (playerData) => {
        // Ensure the player exists and data structure is as expected
        if (players[socket.id] && playerData.position && playerData.rotation) {
            // Update the player's data on the server, including the full quaternion
            players[socket.id] = {
                ...players[socket.id], // Keep existing data like ID, color etc.
                position: playerData.position,
                rotation: playerData.rotation, // Store the {x, y, z, w} object
                // Include other state if sent (e.g., speed for backend logic/validation)
                // speed: playerData.speed
            };

            // Broadcast the updated data (including full rotation) to *all other* players
            socket.broadcast.emit('opponentUpdate', players[socket.id]);
        } else {
            console.warn(`Received incomplete or invalid update for player: ${socket.id}`, playerData);
            // Could request the client to re-register or handle error
        }
    });

    // 5. Handle player disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // Remove player from the server state
        delete players[socket.id];
        // Notify all *remaining* players that this player has left
        io.emit('playerDisconnected', socket.id); // Send the ID of the disconnected player
        console.log('Current players:', Object.keys(players).length);
    });

    // --- Add other game-specific events here ---
    // e.g., socket.on('requestRespawn', () => { /* ... logic to reset player position ... */ });
    // e.g., socket.on('finishedLap', (lapTime) => { /* ... record lap time ... */ });

});

// Basic HTTP route (optional, useful for health checks)
app.get('/', (req, res) => {
    res.send('Monad Velocity Backend is Running!');
});

server.listen(PORT, () => {
    console.log(`Server listening on *:${PORT}`);
});