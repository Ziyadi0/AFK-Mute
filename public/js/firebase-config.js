import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import { getFirestore, collection } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

const firebaseConfig = { 
    apiKey: "AIzaSyBX_2q-e8uCp7mGWajktZmX20UkEgSuYvc", 
    authDomain: "muazaf.firebaseapp.com", 
    projectId: "muazaf", 
    storageBucket: "muazaf.firebasestorage.app", 
    messagingSenderId: "823385580323", 
    appId: "1:823385580323:web:bf9cd59260533532392296", 
    measurementId: "G-YE14MDH8K4" 
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const botsCollection = collection(db, 'bots');

export { db, botsCollection };