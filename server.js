const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: [
            "https://archaic-arabic.github.io", // ✅ Your live website URL goes here!
            "http://localhost:3000"              // Keeps local desktop testing working too!
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Automatically serves your HTML/CSS/JS frontend files to the browser
app.use(express.static(path.join(__dirname)));

// The queue array that holds users waiting for a match
let waitingQueue = [];

// Pair up the first two people in the queue, if there are at least two
function tryMatch() {
    if (waitingQueue.length >= 2) {
        const peerA = waitingQueue.shift();
        const peerB = waitingQueue.shift();

        // Create a unique room for this specific pair
        const roomId = `room_${peerA.id}_${peerB.id}`;
        peerA.join(roomId);
        peerB.join(roomId);

        peerA.roomId = roomId;
        peerB.roomId = roomId;

        // Tell both users they are matched
        peerA.emit('matched', { isCaller: true });
        peerB.emit('matched', { isCaller: false });

        console.log(`Matched ${peerA.id} with ${peerB.id} in ${roomId}`);
    }
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Add incoming user to the waiting queue immediately
    waitingQueue.push(socket);
    tryMatch();

    // --- WEBRTC SIGNALLING RELAYS ---
    socket.on('send-offer', (offer) => {
        socket.to(socket.roomId).emit('receive-offer', offer);
    });

    socket.on('send-answer', (answer) => {
        socket.to(socket.roomId).emit('receive-answer', answer);
    });

    socket.on('ice-candidate', (candidate) => {
        socket.to(socket.roomId).emit('remote-ice-candidate', candidate);
    });

    // --- TEXT CHAT RELAY ---
    socket.on('chat-message', (text) => {
        socket.to(socket.roomId).emit('receive-chat-message', { text: text });
    });

    // --- LEAVE / DISCONNECT LOGIC ---
    function handleDisconnect() {
        // Remove this socket from the waiting queue if it happens to be in it
        waitingQueue = waitingQueue.filter(user => user.id !== socket.id);

        if (socket.roomId) {
            const roomId = socket.roomId;

            // Let the other person in the room know their stranger left
            socket.to(roomId).emit('stranger-disconnected');

            // Find whichever other socket(s) are still in the room and re-queue them
            const room = io.sockets.adapter.rooms.get(roomId);
            if (room) {
                room.forEach((socketId) => {
                    if (socketId !== socket.id) {
                        const otherSocket = io.sockets.sockets.get(socketId);
                        if (otherSocket) {
                            otherSocket.leave(roomId);
                            otherSocket.roomId = null;
                            waitingQueue.push(otherSocket);
                        }
                    }
                });
            }

            socket.leave(roomId);
        }
    }

    socket.on('leave-room', () => {
        handleDisconnect();
        socket.roomId = null;

        // Put the person who clicked "Next" back into the pool
        waitingQueue.push(socket);

        // Notify them that they're back in the pool
        io.to(socket.id).emit('matched-reset');

        // Try to immediately pair everyone who's now free
        tryMatch();
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        handleDisconnect();

        // The abandoned peer may now be re-queued — try pairing them too
        tryMatch();
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
