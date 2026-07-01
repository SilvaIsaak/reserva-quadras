import { state, saveLocal } from './state.js';

export let firebaseApp = null;
export let firebaseDb = null;
export let isCloudSyncing = false;

const HARDCODED_FIREBASE_CONFIG = { 
    "apiKey": "AIzaSyDta2ReINHNdfsyqma8zrPqUuR40gXEyw8", 
    "authDomain": "reserva-de-quadras-ff122.firebaseapp.com", 
    "projectId": "reserva-de-quadras-ff122", 
    "storageBucket": "reserva-de-quadras-ff122.firebasestorage.app", 
    "messagingSenderId": "535600657201", 
    "appId": "1:535600657201:web:d3997814a9ebdec8237610" 
};

state.settings.firebaseConfig = HARDCODED_FIREBASE_CONFIG;

export function connectFirebase(renderCallback) {
    if (!state.settings.firebaseConfig) return;

    try {
        if (firebaseApp) firebaseApp.delete();
        
        firebaseApp = firebase.initializeApp(state.settings.firebaseConfig);
        firebaseDb = firebase.database();
        
        firebaseDb.ref('rq_state').on('value', (snapshot) => {
            const cloudData = snapshot.val();
            if (cloudData && !isCloudSyncing) {
                state.courts = cloudData.courts || state.courts;
                state.bookings = Array.isArray(cloudData.bookings) ? cloudData.bookings : Object.values(cloudData.bookings || {});
                state.waitlist = Array.isArray(cloudData.waitlist) ? cloudData.waitlist : Object.values(cloudData.waitlist || {});
                state.withdrawals = Array.isArray(cloudData.withdrawals) ? cloudData.withdrawals : Object.values(cloudData.withdrawals || {});
                state.history = Array.isArray(cloudData.history) ? cloudData.history : Object.values(cloudData.history || {});
                state.members = cloudData.members || state.members;
                state.manuallyReleasedLessons = cloudData.manuallyReleasedLessons || [];
                
                if (cloudData.settings) {
                    state.settings.clubName = cloudData.settings.clubName || state.settings.clubName;
                    state.settings.primaryColor = cloudData.settings.primaryColor || state.settings.primaryColor;
                }
                
                saveLocal(); 
                if (renderCallback) renderCallback();
            }
        });
    } catch (err) {
        console.error("Firebase connection error:", err);
    }
}

export function save() {
    saveLocal();
    if (firebaseDb) {
        isCloudSyncing = true;
        const sanitizedData = JSON.parse(JSON.stringify({
            courts: state.courts,
            bookings: state.bookings,
            waitlist: state.waitlist,
            withdrawals: state.withdrawals,
            history: state.history,
            members: state.members,
            manuallyReleasedLessons: state.manuallyReleasedLessons,
            settings: {
                clubName: state.settings.clubName,
                primaryColor: state.settings.primaryColor
            }
        }));

        firebaseDb.ref('rq_state').set(sanitizedData).then(() => {
            isCloudSyncing = false;
        }).catch((err) => {
            console.error("Erro ao salvar no Firebase:", err);
            isCloudSyncing = false;
        });
    }
}
