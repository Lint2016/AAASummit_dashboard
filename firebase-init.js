// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAl5oR3RvlgP8b9WvdxZaPvkc0rMb_R94M",
  authDomain: "aaasummit-d063e.firebaseapp.com",
  projectId: "aaasummit-d063e",
  storageBucket: "aaasummit-d063e.appspot.com",
  messagingSenderId: "44977763419",
  appId: "1:44977763419:web:e3c5bd14fc98d724da3b7e",
  measurementId: "G-YWLCPLNLPZ"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firestore
window.db = firebase.firestore();

console.log('Firebase initialized in public mode');
