
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve HTML, CSS and JavaScript
app.use(express.static("public"));

const players = {};

io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    // Maximum of 2 players
    if (Object.keys(players).length >= 2) {
        socket.emit("game-full");
        socket.disconnect();
        return;
    }

    // Assign a player
    const playerNumber = Object.keys(players).length + 1;

    players[socket.id] = {
        id: socket.id,
        x: playerNumber === 1 ? 100 : 400,
        y: 150,
        color: playerNumber === 1 ? "blue" : "red"
    };

    // Send current players to the new player
    socket.emit("current-players", players);

    // Notify everyone about the new player
    io.emit("player-joined", players[socket.id]);

    // Receive player movement
    socket.on("move", (position) => {
        const player = players[socket.id];

        if (!player) return;

        player.x = Math.max(0, Math.min(480, position.x));
        player.y = Math.max(0, Math.min(280, position.y));

        // Broadcast updated position
        io.emit("players-update", players);
    });

    // Handle disconnection
    socket.on("disconnect", () => {
        console.log("Player disconnected:", socket.id);

        delete players[socket.id];

        io.emit("player-left", socket.id);
    });
});

server.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});
