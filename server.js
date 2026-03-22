const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mineflayer = require('mineflayer');
const bedrock = require('bedrock-protocol');
const path = require('path');
const axios = require('axios'); // Add axios for heartbeat
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

// Render Heartbeat - Keep server alive
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(async () => {
  try {
    await axios.get(RENDER_URL);
    console.log('[نبض] تم إرسال إشارة البقاء حياً للسيرفر.');
  } catch (e) {
    console.log('[تحذير] فشل إرسال إشارة البقاء حياً.');
  }
}, 5 * 60 * 1000); // Every 5 minutes

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
  console.log(`[جاري البدء] تشغيل بوت ${isBedrock ? 'بيدروك' : 'جافا'} باسم ${username} على ${host}:${port}...`);
  
  try {
    if (isBedrock) {
      const client = bedrock.createClient({
        host: host,
        port: parseInt(port),
        username: username,
        version: version,
        offline: true,
        connectTimeout: 15000
      });

      activeBots[id] = { bedrock: client };
      updateFirebaseBotStatus(id, 'online');

      client.on('spawn', () => {
        io.emit('botStatus', { id, status: 'online', msg: 'متصل الآن!' });
        io.emit('botLog', { id, msg: `[نجاح] البوت ${username} دخل السيرفر بنجاح.` });
        
        activeBots[id].afkInterval = setInterval(() => {
          if (client.status === 'active') {
            client.queue('move_player', {
              runtime_id: client.entityId,
              position: client.position,
              pitch: (Math.random() * 40) - 20,
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
        io.emit('botLog', { id, msg: `[دردشة] ${msg}` });
      });

      client.on('error', (err) => {
        let errorMsg = "خطأ في الاتصال";
        if (err.message.includes('version')) errorMsg = "الإصدار المختار غير متوافق مع السيرفر";
        if (err.message.includes('refused')) errorMsg = "السيرفر رفض الاتصال (تأكد أنه شغال)";
        
        io.emit('botLog', { id, msg: `[خطأ] ${errorMsg}` });
        io.emit('botStatus', { id, status: 'offline', msg: errorMsg });
        stopBot(id);
      });

      client.on('disconnect', (packet) => {
        io.emit('botLog', { id, msg: `[انفصال] تم الخروج من السيرفر: ${packet.reason || 'سبب غير معروف'}` });
        stopBot(id);
      });

    } else {
      const bot = mineflayer.createBot({
        host: host,
        port: parseInt(port),
        username: username,
        version: version || false,
        auth: 'offline'
      });

      activeBots[id] = bot;
      updateFirebaseBotStatus(id, 'online');

      bot.on('login', () => {
        // تحديث الحالة فوراً في الواجهة ليصبح الزر أحمر
        io.emit('botStatus', { id, status: 'online', msg: 'متصل!' });
        io.emit('botLog', { id, msg: `[نجاح] البوت ${username} سجل دخوله.` });
        console.log(`[SUCCESS] ${username} joined ${host}`);
        
        bot.afkInterval = setInterval(() => {
          if (bot.entity) {
            const yaw = (Math.random() * Math.PI * 2);
            const pitch = (Math.random() * 1.5) - 0.75;
            bot.look(yaw, pitch);

            const rand = Math.random();
            if (rand > 0.8) {
              bot.setControlState('jump', true);
              setTimeout(() => bot.setControlState('jump', false), 500);
            } else if (rand > 0.6) {
              bot.setControlState('sneak', true);
              setTimeout(() => bot.setControlState('sneak', false), 1000);
            }

            const moveType = Math.random() > 0.5 ? 'forward' : 'back';
            bot.setControlState(moveType, true);
            setTimeout(() => bot.setControlState(moveType, false), 300);
          }
        }, 10000 + (Math.random() * 5000));
      });

      bot.on('spawn', () => {
        io.emit('botLog', { id, msg: `[معلومة] البوت ظهر في العالم الآن.` });
        // تأكيد إضافي للحالة عند الظهور
        io.emit('botStatus', { id, status: 'online' });
      });

      bot.on('error', (err) => {
        let errorMsg = `خطأ: ${err.message}`;
        if (err.message.includes('ECONNREFUSED')) errorMsg = "تعذر الاتصال بالسيرفر (تأكد أنه شغال)";
        
        io.emit('botLog', { id, msg: `[خطأ] ${errorMsg}` });
        io.emit('botStatus', { id, status: 'offline', msg: errorMsg });
        stopBot(id);
      });

      bot.on('kicked', (reason) => {
        const kickReason = typeof reason === 'string' ? reason : JSON.stringify(reason);
        io.emit('botLog', { id, msg: `[طرد] تم طرد البوت: ${kickReason}` });
        io.emit('botStatus', { id, status: 'offline', msg: 'تم الطرد من السيرفر' });
        
        if (activeBots[id]) {
            if (activeBots[id].afkInterval) clearInterval(activeBots[id].afkInterval);
            delete activeBots[id];
        }
        
        setTimeout(() => {
          const config = botsConfig.find(b => b.id === id);
          if (config && config.lastStatus === 'online') {
              io.emit('botLog', { id, msg: `[إعادة محاولة] جاري محاولة الدخول مرة أخرى تلقائياً...` });
              startBot(config);
          }
        }, 5000);
      });

      bot.on('end', () => {
        io.emit('botLog', { id, msg: `[انفصال] انقطع الاتصال. جاري إعادة المحاولة خلال 5 ثوانٍ...` });
        io.emit('botStatus', { id, status: 'offline', msg: 'منقطع' });
        delete activeBots[id];
        
        setTimeout(() => {
          const config = botsConfig.find(b => b.id === id);
          if (config && config.lastStatus === 'online' && !activeBots[id]) {
              startBot(config);
          }
        }, 5000);
      });
    }

  } catch (err) {
    io.emit('botLog', { id, msg: `[خطأ حرج] ${err.message}` });
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
