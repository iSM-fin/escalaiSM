import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyBAqj1MdaAFPyEgogs3kYZmkTi2crakFoI",
    authDomain: "escala-ism.firebaseapp.com",
    databaseURL: "https://escala-ism-default-rtdb.firebaseio.com",
    projectId: "escala-ism",
    storageBucket: "escala-ism.firebasestorage.app",
    messagingSenderId: "24608035306",
    appId: "1:24608035306:web:1051d32a7c7f486d812293",
    measurementId: "G-WY95XT15HF"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { db, app, auth, googleProvider };
