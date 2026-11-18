const firebaseConfig = {
  apiKey: 'AIzaSyBTyUnGyKLcWHnnaQ3DrbOm2oObqtk8U3U',
  authDomain: 'rhythm-canvas-8a552.firebaseapp.com',
  projectId: 'rhythm-canvas-8a552',
  storageBucket: 'rhythm-canvas-8a552.firebasestorage.app',
  messagingSenderId: '1051679737910',
  appId: '1:1051679737910:web:efb6fa4246738398933097',
};

declare global {
  interface Window {
    firebase?: any;
    Peer?: any;
  }
}

let auth: any = null;
let db: any = null;
let storage: any = null;

try {
  if (typeof window !== 'undefined' && window.firebase) {
    if (typeof window.firebase.firestore?.setLogLevel === 'function') {
      window.firebase.firestore.setLogLevel('silent');
    }
    if (!window.firebase.apps.length) {
      window.firebase.initializeApp(firebaseConfig);
    }
    auth = window.firebase.auth();
    db = window.firebase.firestore();
    try {
      db.settings({
        experimentalAutoDetectLongPolling: true,
        merge: true,
      });
    } catch {
      // Settings already locked on existing instance
    }
    storage = window.firebase.storage();
  }
} catch (e) {
  console.warn('Firebase Init Notice:', e);
}

export { auth, db, storage };
