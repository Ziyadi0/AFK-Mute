import { db, botsCollection } from './firebase-config.js';
import { onSnapshot, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

const translations = {
    ar: {
        title: "لوحة تحكم AFK Player",
        connected: "النظام متصل",
        disconnected: "النظام غير متصل",
        addBot: "إضافة بوت",
        botsList: "قائمة البوتات",
        noBots: "لم يتم العثور على بوتات",
        controlCenter: "مركز التحكم",
        currentStatus: "الحالة الحالية",
        serverPort: "Port",
        serverHost: "Host",
        botUsername: "Username",
        botVersion: "Version",
        serverType: "Server Type",
        javaEdition: "Java Edition",
        bedrockEdition: "Bedrock Edition",
        online: "متصل",
        offline: "غير متصل",
        startBot: "تشغيل البوت",
        stopBot: "إيقاف البوت",
        edit: "تعديل",
        delete: "حذف",
        liveTerminal: "سجل البوت (Logs)",
        entries: "سجلات",
        clear: "مسح",
        waitingForLogs: "في انتظار سجلات البوت...",
        editBot: "تعديل البوت",
        addNewBot: "إضافة بوت جديد",
        saveCloud: "حفظ في السحابة",
        cancel: "إلغاء"
    },
    en: {
        title: "AFK Player Dashboard",
        connected: "System Online",
        disconnected: "System Offline",
        addBot: "Add Bot",
        botsList: "Bots List",
        noBots: "No bots found",
        controlCenter: "Control Center",
        currentStatus: "Status",
        serverPort: "Port",
        serverHost: "Host",
        botUsername: "Username",
        botVersion: "Version",
        serverType: "Server Type",
        javaEdition: "Java Edition",
        bedrockEdition: "Bedrock Edition",
        online: "Online",
        offline: "Offline",
        startBot: "Start Bot",
        stopBot: "Stop Bot",
        edit: "Edit",
        delete: "Delete",
        liveTerminal: "Bot Logs",
        entries: "entries",
        clear: "Clear",
        waitingForLogs: "Waiting for logs...",
        editBot: "Edit Bot",
        addNewBot: "Add New Bot",
        saveCloud: "Save to Cloud",
        cancel: "Cancel"
    }
};

// Initialize Alpine data component
document.addEventListener('alpine:init', () => {
    Alpine.data('botApp', () => ({
        socket: null,
        bots: [],
        selectedBot: null,
        logs: [],
        showConfig: false,
        editingBotId: null,
        lang: localStorage.getItem('lang') || 'ar',
        backendConnected: false,
        form: { host: '', port: 25565, username: 'AFK_Bot', version: '1.20.1', type: 'java' },
        versions: {
            java: [
                '1.0.0', '1.1', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', 
                '1.3.1', '1.3.2', 
                '1.4.2', '1.4.4', '1.4.5', '1.4.6', '1.4.7', 
                '1.5', '1.5.1', '1.5.2', 
                '1.6.1', '1.6.2', '1.6.4', 
                '1.7.2', '1.7.4', '1.7.5', '1.7.6', '1.7.7', '1.7.8', '1.7.9', '1.7.10', 
                '1.8', '1.8.1', '1.8.2', '1.8.3', '1.8.4', '1.8.5', '1.8.6', '1.8.7', '1.8.8', '1.8.9', 
                '1.9', '1.9.1', '1.9.2', '1.9.3', '1.9.4', 
                '1.10', '1.10.1', '1.10.2', 
                '1.11', '1.11.1', '1.11.2', 
                '1.12', '1.12.1', '1.12.2', 
                '1.13', '1.13.1', '1.13.2', 
                '1.14', '1.14.1', '1.14.2', '1.14.3', '1.14.4', 
                '1.15', '1.15.1', '1.15.2', 
                '1.16', '1.16.1', '1.16.2', '1.16.3', '1.16.4', '1.16.5', 
                '1.17', '1.17.1', 
                '1.18', '1.18.1', '1.18.2', 
                '1.19', '1.19.1', '1.19.2', '1.19.3', '1.19.4', 
                '1.20', '1.20.1', '1.20.2', '1.20.3', '1.20.4', '1.20.5', '1.20.6', 
                '1.21', '1.21.1', '1.21.2', '1.21.3', '1.21.4', '1.21.5', '1.21.6', '1.21.7', '1.21.8', '1.21.9', '1.21.10', '1.21.11'
            ],
            bedrock: [
                '1.20.0', '1.20.1', '1.20.10', '1.20.30', '1.20.40', '1.20.50', '1.20.60', '1.20.70', '1.20.80', 
                '1.21.0', '1.21.1', '1.21.2', '1.21.20', '1.21.21', '1.21.30', '1.21.40', '1.21.41', '1.21.50'
            ]
        },

        getCurrentVersions() {
            return this.versions[this.form.type] || [];
        },

        updateType() {
            if (this.form.type === 'bedrock') {
                this.form.port = 19132;
                this.form.version = '1.21.50';
                if (!this.form.username.startsWith('.')) {
                    this.form.username = '.' + this.form.username;
                }
            } else {
                this.form.port = 25565;
                this.form.version = '1.20.1';
                if (this.form.username.startsWith('.')) {
                    this.form.username = this.form.username.substring(1);
                }
            }
        },

        t(key) { 
            return (translations[this.lang] && translations[this.lang][key]) ? translations[this.lang][key] : key; 
        },
        
        toggleLang() { 
            this.lang = this.lang === 'ar' ? 'en' : 'ar';
            localStorage.setItem('lang', this.lang);
            this.applyDirection();
            console.log("Language switched to:", this.lang);
        },

        applyDirection() {
            document.documentElement.lang = this.lang;
            document.documentElement.dir = this.lang === 'ar' ? 'rtl' : 'ltr';
        },

        init() {
            console.log("botApp Alpine component initialized!");
            this.applyDirection();

            // Real-time Firebase Sync
            onSnapshot(botsCollection, (snapshot) => {
                this.bots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                console.log("Synced bots:", this.bots.length);
                if (this.bots.length > 0 && !this.selectedBot) {
                    this.selectBot(this.bots[0]);
                }
            });
            
            this.connectSocket();
        },

        connectSocket() {
            if (this.socket) this.socket.disconnect();
            
            try {
                // Smart auto-connection: 
                // If testing locally (port 5500), try to find the bot server on port 3000
                const isLocal = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
                const socketUrl = isLocal ? 'http://localhost:3000' : window.location.origin;

                this.socket = io(socketUrl); 
                this.socket.on('connect', () => { 
                    this.backendConnected = true; 
                    console.log("System linked and ready!");
                });
                this.socket.on('disconnect', () => { this.backendConnected = false; });
                this.socket.on('botStatus', (data) => {
                    console.log("Status update received:", data);
                    const bot = this.bots.find(b => b.id === data.id);
                    if (bot) {
                        bot.status = data.status;
                        // Force UI update for selected bot
                        if (this.selectedBot && this.selectedBot.id === data.id) {
                            this.selectedBot.status = data.status;
                        }
                    }
                });
                this.socket.on('botLog', (data) => {
                    if (this.selectedBot && this.selectedBot.id === data.id) {
                        this.logs.push({ time: new Date().toLocaleTimeString(), msg: data.msg });
                        if (this.logs.length > 100) this.logs.shift();
                        this.$nextTick(() => {
                            const el = document.getElementById('logs-container');
                            if (el) el.scrollTop = el.scrollHeight;
                        });
                    }
                });
            } catch (e) { console.error("Socket error:", e); }
        },

        selectBot(bot) {
            this.selectedBot = bot;
            this.logs = [];
            this.editingBotId = bot.id;
            this.form = { 
                host: bot.host, 
                port: bot.port, 
                username: bot.username, 
                version: bot.version || '1.20.1',
                type: bot.type || 'java'
            };
        },

        openAddBotModal() {
            console.log("Opening Add Modal - BUTTON CLICKED");
            this.editingBotId = null;
            this.form = { host: '', port: 25565, username: 'AFK_Bot', version: '1.20.1', type: 'java' };
            this.showConfig = true;
        },

        async saveBot() {
            try {
                const id = this.editingBotId || crypto.randomUUID();
                // Ensure correct default port for Java if not set
                if (this.form.type === 'java' && !this.form.port) this.form.port = 25565;
                
                await setDoc(doc(db, 'bots', id), { ...this.form, id }, { merge: true });
                console.log("Bot saved to cloud!");
                this.showConfig = false;
            } catch (e) { alert("Cloud Error: " + e.message); }
        },

        async deleteBot() {
            if (confirm(this.lang === 'ar' ? 'هل أنت متأكد من الحذف؟' : 'Delete this bot?')) {
                try {
                    await deleteDoc(doc(db, 'bots', this.selectedBot.id));
                    this.selectedBot = null;
                } catch (e) { alert("Error: " + e.message); }
            }
        },

        toggleBot() {
            if (!this.backendConnected) {
                const msg = this.lang === 'ar' 
                    ? "نظام البوت غير جاهز حالياً. تأكد من تشغيل ملف server.js أولاً ليعمل الموقع." 
                    : "System not ready. Make sure server.js is running first.";
                return alert(msg);
            }
            const action = this.selectedBot.status === 'online' ? 'stopBot' : 'startBot';
            this.socket.emit(action, this.selectedBot.id);
        }
    }));
});
