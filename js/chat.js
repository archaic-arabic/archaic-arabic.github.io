// ==========================================
// 1. DOM ELEMENTS
// ==========================================
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const chatBox = document.getElementById('chat-box');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const nextBtn = document.getElementById('next-btn');

// ==========================================
// 2. GLOBAL VARIABLES
// ==========================================
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let socket = null; // Will hold the Socket.io connection

// Corrected STUN Server configurations (Fixed the double colon typo)

const rtcConfig = {
    iceServers: [
        { urls: 'stun:://google.com' },
        { urls: 'stun:://google.com' }
    ]
};

// ==========================================
// 3. STEP 1: INITIALIZE WEBCAM & MICROPHONE
// ==========================================
async function startWebcam() {
    try {
        // Request video and audio permissions from the browser
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        // Display the webcam stream in the "You" video box
        localVideo.srcObject = localStream;
        
        appendSystemMessage("Webcam successfully connected. Ready to search!");
        
        // Once webcam is running, connect to the backend server
        initSocketConnection();
        
    } catch (error) {
        console.error("Error accessing media devices:", error);
        appendSystemMessage("Error: Could not access your webcam or microphone. Please check permissions.");
    }
}

// ==========================================
// 4. STEP 2: SOCKET.IO BACKEND CONNECTION
// ==========================================
function initSocketConnection() {
    appendSystemMessage("Connecting to matchmaking server...");
    
    // Connects to your future Node.js server running on your computer
    // Note: Ensure the Socket.io client script tag is added to your HTML
    if (typeof io !== 'undefined') {
        // socket = io("http://localhost:3000"); old local version
        // socket = io("https://onrender.com");  old render version
        socket = io("https://archaic-arabic.onrender.com");
        setupSocketListeners();
    } else {
        console.warn("Socket.io is not loaded yet. Setup form listeners locally.");
    }
    
    setupFormListeners();
}

// ==========================================
// 5. STEP 3: WEBRTC PEER CONNECTION LOGIC
// ==========================================
function createPeerConnection() {
    // If a connection already exists, clean it up first
    if (peerConnection) {
        peerConnection.close();
    }

    peerConnection = new RTCPeerConnection(rtcConfig);

    // Feed your local webcam video tracks into the peer connection to send to the stranger
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    // Listen for when the stranger's live video stream arrives
    peerConnection.ontrack = (event) => {
        if (!remoteStream) {
            remoteStream = new MediaStream();
            remoteVideo.srcObject = remoteStream;
        }
        remoteStream.addTrack(event.track);
    };

    // Listen for internet pathway configurations (ICE) and send them to the server
    peerConnection.onicecandidate = (event) => {
        if (event.candidate && socket) {
            socket.emit('ice-candidate', event.candidate);
        }
    };
}

// ==========================================
// 6. STEP 4: SIGNALLING & SERVER EVENTS
// ==========================================
function setupSocketListeners() {
    if (!socket) return;

    // A. Server paired you with a stranger
    socket.on('matched', async (data) => {
        appendSystemMessage("Stranger found! Connecting video...");
        createPeerConnection();

        // One client is designated as the caller to initiate the connection handshake
        if (data.isCaller) {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('send-offer', offer);
        }
    });

    // B. Receive connection offer from a stranger
    socket.on('receive-offer', async (offer) => {
        createPeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('send-answer', answer);
    });

    // C. Receive handshake answer back from a stranger
    socket.on('receive-answer', async (answer) => {
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
    });

    // D. Receive network candidates passed through from the stranger
    socket.on('remote-ice-candidate', async (candidate) => {
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    });

    // E. Receive text chat messages from the stranger
    socket.on('receive-chat-message', (data) => {
        appendUserMessage("Stranger", data.text);
    });

    // F. Stranger disconnected or pressed Next
    socket.on('stranger-disconnected', () => {
        appendSystemMessage("Stranger disconnected. Searching for a new match...");
        resetWebRTC();
    });
    socket.on('matched-reset', () => {
        appendSystemMessage("Re-entered the matchmaking pool. Waiting for next stranger...");
      });
}

// ==========================================
// 7. STEP 5: CHAT & UI FORM LISTENERS
// ==========================================
function setupFormListeners() {
    messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = messageInput.value.trim();
        if (!text) return;

        // Display your own text message locally
        appendUserMessage("You", text);
        messageInput.value = '';

        // Send text message out to the server to route to the stranger
        if (socket) {
            socket.emit('chat-message', text);
        }
    });

    nextBtn.addEventListener('click', () => {
        appendSystemMessage("Disconnecting... Searching for a new stranger.");
        
        // Notify the server you are leaving this match
        if (socket) {
            socket.emit('leave-room');
        }
        
        resetWebRTC();
    });
}

// ==========================================
// 8. HELPER & CLEANUP FUNCTIONS
// ==========================================
function resetWebRTC() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (remoteVideo) {
        remoteVideo.srcObject = null;
    }
    remoteStream = null;
}

function appendSystemMessage(text) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('system-msg');
    msgDiv.innerText = text;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight; // Auto-scroll to bottom
}

function appendUserMessage(sender, text) {
    const msgDiv = document.createElement('div');
    msgDiv.style.margin = "5px 0";
    
    const label = document.createElement('strong');
    label.style.color = (sender === "You") ? "#1e90ff" : "#ff4757";
    label.innerText = `${sender}: `;
    
    // FIXED: Using createTextNode prevents script injection (XSS attacks)
    const messageText = document.createTextNode(text); 
    
    msgDiv.appendChild(label);
    msgDiv.appendChild(messageText);
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight; // Auto-scroll to bottom
}

// ==========================================
// 9. START THE APPLICATION LIFE CYCLE
// ==========================================
startWebcam();

