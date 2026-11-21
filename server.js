
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server);

const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));
app.use("/assets", express.static(path.join(__dirname, "assets")));

const rooms = new Map();

const BOARD_SIZE = 10;

function makeLobbyCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code;
    do {
        code = Array.from({ length: 4 }, () =>
            chars[Math.floor(Math.random() * chars.length)]
        ).join("");
    } while (rooms.has(code));
    return code;
}

function createRoom(code) {
    return {
        code,
        players: {},
        ready: {},
        boards: {},
        ships: {},
        turn: null,
        inGame: false,
    };
}

function isValidBoard(board) {
    return Array.isArray(board)
        && board.length === BOARD_SIZE
        && board.every(row =>
            Array.isArray(row)
            && row.length === BOARD_SIZE
            && row.every(cell => Number.isInteger(cell) && cell >= 0 && cell <= 4)
        );
}

function opponentNumber(playerNumber) {
    return playerNumber === 1 ? 2 : 1;
}

function shipsLeft(room) {
    const count = n => (room.ships[n] || []).filter(ship => ship && !ship.sunk).length;
    return { 1: count(1), 2: count(2) };
}

function closeRoom(lobbyCode, leavingSocket) {
    const room = rooms.get(lobbyCode);
    leavingSocket.leave(lobbyCode);
    leavingSocket.data.roomCode = null;
    if (!room) return;
    const leftPlayer = room.players[leavingSocket.id];
    for (const socketId of Object.keys(room.players)) {
        if (socketId === leavingSocket.id) continue;
        const other = io.sockets.sockets.get(socketId);
        if (!other) continue;
        other.emit("opponent-disconnected", { playerNumber: leftPlayer });
        other.leave(lobbyCode);
        other.data.roomCode = null;
    }
    rooms.delete(lobbyCode);
}

io.on("connection", (socket) => {
    socket.on("create-lobby", () => {
        if (socket.data.roomCode) return;
        const code = makeLobbyCode();
        const room = createRoom(code);
        room.players[socket.id] = 1;
        rooms.set(code, room);
        socket.data.roomCode = code;
        socket.join(code);
        socket.emit("lobby-created", { code, playerNumber: 1 });
        io.to(code).emit("lobby-state", { code, connected: 1 });
    });

    socket.on("join-lobby", ({ code }) => {
        if (socket.data.roomCode) return;
        if (typeof code !== "string") {
            socket.emit("lobby-error", { message: "Codigo invalido." });
            return;
        }
        const lobbyCode = code.trim().toUpperCase();
        const room = rooms.get(lobbyCode);
        if (!room) {
            socket.emit("lobby-error", { message: "Lobby nao encontrado." });
            return;
        }
        if (Object.keys(room.players).length >= 2) {
            socket.emit("lobby-error", { message: "Lobby cheio." });
            return;
        }
        room.players[socket.id] = 2;
        socket.data.roomCode = lobbyCode;
        socket.join(lobbyCode);
        socket.emit("lobby-joined", { code: lobbyCode, playerNumber: 2 });
        io.to(lobbyCode).emit("lobby-state", { code: lobbyCode, connected: 2 });
    });

    socket.on("player-ready", ({ board, ships }) => {
        const lobbyCode = socket.data.roomCode;
        const room = lobbyCode ? rooms.get(lobbyCode) : null;
        if (!room) return;
        const playerNumber = room.players[socket.id];
        if (!playerNumber) return;
        if (room.inGame || room.ready[playerNumber]) return;
        if (!isValidBoard(board) || !Array.isArray(ships)) return;

        room.boards[playerNumber] = board;
        room.ships[playerNumber] = ships;
        room.ready[playerNumber] = true;
        io.to(lobbyCode).emit("player-ready", { playerNumber });

        if (room.ready[1] && room.ready[2]) {
            room.turn = 1;
            room.inGame = true;
            io.to(lobbyCode).emit("game-start", { turn: room.turn });
        }
    });

    socket.on("attack", ({ row, col }) => {
        const lobbyCode = socket.data.roomCode;
        const room = lobbyCode ? rooms.get(lobbyCode) : null;
        if (!room || !room.inGame) return;
        const playerNumber = room.players[socket.id];
        if (room.turn !== playerNumber) return;
        if (!Number.isInteger(row) || !Number.isInteger(col)) return;
        if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return;

        const target = opponentNumber(playerNumber);
        const board = room.boards[target];
        if (!board) return;

        const value = board[row][col];
        if (value !== 0 && value !== 1) return;

        const result = value === 1 ? "hit" : "miss";
        board[row][col] = value === 1 ? 2 : 3;

        const ships = room.ships[target] || [];
        let sunkShip = null;
        if (result === "hit") {
            for (const ship of ships) {
                if (!ship || !Array.isArray(ship.positions)) continue;
                if (ship.positions.some(([shipRow, shipCol]) => shipRow === row && shipCol === col)) {
                    ship.hits = (ship.hits || 0) + 1;
                    if (ship.hits >= ship.size) {
                        ship.sunk = true;
                        sunkShip = {
                            name: ship.name,
                            positions: ship.positions,
                        };
                        for (const [shipRow, shipCol] of ship.positions) {
                            if (board[shipRow] && board[shipRow][shipCol] !== undefined) {
                                board[shipRow][shipCol] = 4;
                            }
                        }
                    }
                    break;
                }
            }
        }

        const sunkCount = ships.filter(ship => ship && ship.sunk).length;
        const gameOver = ships.length > 0 && sunkCount === ships.length;

        if (gameOver) {
            room.inGame = false;
            room.turn = null;
        } else if (result === "miss") {
            room.turn = target;
        }

        io.to(lobbyCode).emit("attack-result", {
            attacker: playerNumber,
            target,
            row,
            col,
            result,
            sunkShip,
            gameOver,
            turn: room.turn,
            shipsLeft: shipsLeft(room),
        });

        if (gameOver) {
            io.to(lobbyCode).emit("game-over", { winner: playerNumber });
        } else if (result === "miss") {
            io.to(lobbyCode).emit("turn-changed", { turn: room.turn });
        }
    });

    socket.on("leave-lobby", () => {
        const lobbyCode = socket.data.roomCode;
        if (lobbyCode) closeRoom(lobbyCode, socket);
    });

    socket.on("disconnect", () => {
        const lobbyCode = socket.data.roomCode;
        if (lobbyCode) closeRoom(lobbyCode, socket);
    });
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
