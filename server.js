const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
// const io = new Server(server, {
//     cors: { origin: "*" }
// });
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

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Add incoming user to the waiting queue immediately
    waitingQueue.push(socket);

    // If we have at least 2 people waiting, pair them up!
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
        waitingQueue = waitingQueue.filter(user => user.id !== socket.id);
        if (socket.roomId) {
            socket.to(socket.roomId).emit('stranger-disconnected');
        }
    }

    socket.on('leave-room', () => {
        handleDisconnect();
        socket.leave(socket.roomId);
        socket.roomId = null;
        // Re-inject them into the matchmaking pool immediately
        io.to(socket.id).emit('matched-reset'); 
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        handleDisconnect();
    });
});

server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});

