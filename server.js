const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mineflayer = require('mineflayer');
const bedrock = require('bedrock-protocol');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Firebase integration
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, setDoc, doc, deleteDoc, onSnapshot, query, where } = require('firebase/firestore');

const firebaseConfig = { 
  apiKey: "AIzaSyBX_2q-e8uCp7mGWajktZmX20UkEgSuYvc", 
  authDomain: "muazaf.firebaseapp.com", 
  projectId: "muazaf", 
  storageBucket: "muazaf.firebasestorage.app", 
  messagingSenderId: "823385580323", 
  appId: "1:823385580323:web:bf9cd59260533532392296", 
  measurementId: "G-YE14MDH8K4" 
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const botsCollection = collection(db, 'bots');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Store active bot instances
let activeBots = {};
let botsConfig = [];

// Real-time sync with Firebase Firestore
onSnapshot(botsCollection, (snapshot) => {
  botsConfig = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  console.log('Bots configuration synced from Firebase');
  // Auto-start logic removed per user request
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Get all bots
app.get('/api/bots', (req, res) => {
  const botsWithStatus = botsConfig.map(bot => ({
    ...bot,
    status: activeBots[bot.id] ? 'online' : 'offline'
  }));
  res.json(botsWithStatus);
});

// API: Add/Update bot (Syncs to Firebase)
app.post('/api/bots', async (req, res) => {
  const newBot = req.body;
  if (!newBot.id) newBot.id = uuidv4();
  
  try {
    const botRef = doc(db, 'bots', newBot.id);
    await setDoc(botRef, newBot, { merge: true });
    res.json(newBot);
  } catch (err) {
    console.error("Error saving to Firebase:", err);
    res.status(500).send("Error saving bot configuration");
  }
});

// API: Delete bot
app.delete('/api/bots/:id', async (req, res) => {
  const { id } = req.params;
  if (activeBots[id]) stopBot(id);
  
  try {
    const botRef = doc(db, 'bots', id);
    await deleteDoc(botRef);
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send("Error deleting bot configuration");
  }
});

async function updateFirebaseBotStatus(id, status) {
    try {
        const botRef = doc(db, 'bots', id);
        await setDoc(botRef, { lastStatus: status }, { merge: true });
    } catch (e) {
        console.error("Failed to update status in Firebase", e);
    }
}

function startBot(botData) {
  const { id, host, port, username, version, type } = botData;
  if (activeBots[id]) return;

  const isBedrock = type === 'bedrock';
  console.log(`Starting ${isBedrock ? 'Bedrock' : 'Java'} bot ${username} on ${host}:${port}...`);
  
  try {
    if (isBedrock) {
      // Bedrock Protocol Implementation
      const client = bedrock.createClient({
        host: host,
        port: parseInt(port),
        username: username,
        version: version,
        offline: true,
        connectTimeout: 10000
      });

      activeBots[id] = { bedrock: client };
      updateFirebaseBotStatus(id, 'online');

      client.on('spawn', () => {
        io.emit('botStatus', { id, status: 'online', msg: 'Bedrock bot spawned!' });
        io.emit('botLog', { id, msg: `[INFO] Bedrock bot ${username} joined successfully.` });
        
        // Bedrock AFK - Simple packet rotation every 5s to avoid timeout
        activeBots[id].afkInterval = setInterval(() => {
          if (client.status === 'active') {
            client.queue('move_player', {
              runtime_id: client.entityId,
              position: client.position,
              pitch: 0,
              yaw: (Math.random() * 360),
              head_yaw: (Math.random() * 360),
              mode: 0,
              on_ground: true,
              teleport_cause: 0,
              tick: 0
            });
          }
        }, 5000);
      });

      client.on('text', (packet) => {
        const msg = packet.message || packet.source_name + ": " + packet.message;
        io.emit('botLog', { id, msg: `[CHAT] ${msg}` });
      });

      client.on('error', (err) => {
        let errorMsg = err.message;
        if (errorMsg.includes('version')) errorMsg = "Wrong Version / إصدار غير صحيح";
        if (errorMsg.includes('refused')) errorMsg = "Server Refused / السيرفر رفض الاتصال";
        
        io.emit('botLog', { id, msg: `[ERROR] ${errorMsg}` });
        io.emit('botStatus', { id, status: 'offline', msg: errorMsg });
        stopBot(id);
      });

      client.on('disconnect', (packet) => {
        const reason = packet.reason || "Unknown / سبب غير معروف";
        io.emit('botLog', { id, msg: `[DISCONNECTED] ${reason}` });
        stopBot(id);
      });

    } else {
      // Existing Mineflayer Java Implementation
      const bot = mineflayer.createBot({
        host: host,
        port: parseInt(port),
        username: username,
        version: version || false,
        auth: 'offline' // CRITICAL for Aternos/Cracked servers
      });

      activeBots[id] = bot;
      updateFirebaseBotStatus(id, 'online');

      bot.on('login', () => {
        io.emit('botStatus', { id, status: 'online', msg: 'Bot logged in!' });
        console.log(`[SUCCESS] ${username} joined ${host}`);
        
        let yaw = 0;
        bot.afkInterval = setInterval(() => {
          if (bot.entity) {
            yaw += 0.2;
            if (yaw > Math.PI * 2) yaw = 0;
            bot.look(yaw, -0.5); 
          }
        }, 100);
      });

      bot.on('spawn', () => {
        io.emit('botLog', { id, msg: `[INFO] Bot spawned in the world.` });
      });

      bot.on('error', (err) => {
        console.log(`[ERROR] ${username}: ${err.message}`);
        io.emit('botLog', { id, msg: `[ERROR] ${err.message}` });
        io.emit('botStatus', { id, status: 'offline', msg: `Error: ${err.message}` });
        stopBot(id);
      });

      bot.on('kicked', (reason) => {
        console.log(`[KICKED] ${username} from ${host}. Reason: ${reason}`);
        io.emit('botLog', { id, msg: `[KICKED] ${reason}` });
        io.emit('botStatus', { id, status: 'offline', msg: 'Kicked from server' });
        
        if (activeBots[id]) {
            if (activeBots[id].afkInterval) clearInterval(activeBots[id].afkInterval);
            delete activeBots[id];
        }
        
        setTimeout(() => {
          const config = botsConfig.find(b => b.id === id);
          if (config && config.lastStatus === 'online') {
              console.log(`[RETRY] Reconnecting ${username} after kick...`);
              startBot(config);
          }
        }, 5000);
      });

      bot.on('end', () => {
        console.log(`[DISCONNECT] ${username} connection ended.`);
        io.emit('botLog', { id, msg: `[SYS] Connection ended. Retrying in 5s...` });
        io.emit('botStatus', { id, status: 'offline', msg: 'Disconnected' });
        delete activeBots[id];
        
        setTimeout(() => {
          const config = botsConfig.find(b => b.id === id);
          if (config && config.lastStatus === 'online' && !activeBots[id]) {
              console.log(`[RETRY] Reconnecting ${username}...`);
              startBot(config);
          }
        }, 5000);
      });
    }

  } catch (err) {
    io.emit('botLog', { id, msg: `[CRITICAL] ${err.message}` });
  }
}

function stopBot(id) {
  if (activeBots[id]) {
    const bot = activeBots[id];
    if (bot.afkInterval) clearInterval(bot.afkInterval);
    if (bot.quit) bot.quit(); // Java
    if (bot.bedrock && bot.bedrock.disconnect) bot.bedrock.disconnect(); // Bedrock
    delete activeBots[id];
  }
  updateFirebaseBotStatus(id, 'offline');
  io.emit('botStatus', { id, status: 'offline', msg: 'Bot stopped manually' });
}

io.on('connection', (socket) => {
  socket.on('startBot', (id) => {
    const botData = botsConfig.find(b => b.id === id);
    if (botData) startBot(botData);
  });

  socket.on('stopBot', (id) => {
    stopBot(id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});