// NÃO CONECTADO AO index.html — referência para modularização futura, ver prompt-reorganizacao-reservaquadras.md

// --- Safe LocalStorage Wrapper ---
export const storage = {
    get: (key, fallback) => {
        try {
            const val = localStorage.getItem(key);
            if (!val) return fallback;
            try {
                return JSON.parse(val);
            } catch (e) {
                return val;
            }
        } catch (e) {
            console.warn(`LocalStorage access denied for ${key}. Using fallback.`);
            return fallback;
        }
    },
    set: (key, val) => {
        try {
            const stringVal = typeof val === 'string' ? val : JSON.stringify(val);
            localStorage.setItem(key, stringVal);
        } catch (e) {
            console.warn(`LocalStorage write denied for ${key}.`);
        }
    },
    remove: (key) => {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.warn(`LocalStorage remove denied for ${key}.`);
        }
    }
};

// --- State & Config ---
export let state = {
    courts: storage.get('rq_pro_courts', ["Quadra 1", "Quadra 2", "Quadra 3", "Quadra 4", "Quadra 5", "Quadra 6", "Quadra 7", "Quadra Rápida"]),
    bookings: storage.get('rq_pro_bookings', []),
    waitlist: storage.get('rq_pro_waitlist', []),
    withdrawals: storage.get('rq_pro_withdrawals', []),
    history: Array.isArray(storage.get('rq_pro_history', [])) ? storage.get('rq_pro_history', []) : [], 
    members: storage.get('rq_pro_members', {
        "1001": ["João Silva", "Maria Silva", "Pedro"],
        "2002": ["Carlos Santos", "Ana"],
        "3003": ["Roberto Oliveira"],
        "4004": ["Fernando Costa", "Julia"]
    }),
    settings: storage.get('rq_pro_settings', { 
        clubName: "ReservaQuadras",
        primaryColor: "#6366f1",
        theme: "dark",
        performanceMode: true
    }),
    activeAdminCourt: null,
    currentView: 'home',
    manuallyReleasedLessons: storage.get('rq_pro_manually_released', [])
};

// ============================================================
// SISTEMA DE USUÁRIOS — 3 perfis: publico, diretora, esportes
// ============================================================
export const USER_PASSWORDS = {
    publico:  null,
    diretora: 'diretora',
    esportes: 'esportes'
};

export const USER_ROLES = {
    publico:  { label: 'Público',  icon: 'fas fa-users',        color: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', views: ['public'] },
    diretora: { label: 'Diretora', icon: 'fas fa-chart-pie',    color: 'bg-purple-500/10 border-purple-500/30 text-purple-400',   views: ['home'] },
    esportes: { label: 'Esportes', icon: 'fas fa-shield-halved', color: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400',  views: ['home', 'public', 'admin', 'settings'] }
};

export let currentUser = null;
export let selectedUserForLogin = null;

// Carrega senhas salvas no localStorage (se houver)
export function loadSavedPasswords() {
    const saved = storage.get('rq_user_passwords');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.esportes) USER_PASSWORDS.esportes = parsed.esportes;
            if (parsed.diretora) USER_PASSWORDS.diretora = parsed.diretora;
        } catch(e) {}
    }
}
loadSavedPasswords();

export let pwdTargetUser = null;

export const HARDCODED_FIREBASE_CONFIG = { 
    "apiKey": "AIzaSyDta2ReINHNdfsyqma8zrPqUuR40gXEyw8", 
    "authDomain": "reserva-de-quadras-ff122.firebaseapp.com", 
    "projectId": "reserva-de-quadras-ff122", 
    "storageBucket": "reserva-de-quadras-ff122.firebasestorage.app", 
    "messagingSenderId": "535600657201", 
    "appId": "1:535600657201:web:d3997814a9ebdec8237610" 
};

state.settings.firebaseConfig = HARDCODED_FIREBASE_CONFIG;

export let lastClosingDate = storage.get('last_closing_date') || '';

export function saveLocal() {
    storage.set('rq_pro_courts', state.courts);
    storage.set('rq_pro_bookings', state.bookings);
    storage.set('rq_pro_waitlist', state.waitlist);
    storage.set('rq_pro_withdrawals', state.withdrawals);
    storage.set('rq_pro_history', state.history);
    storage.set('rq_pro_members', state.members);
    storage.set('rq_pro_settings', state.settings);
    storage.set('rq_pro_manually_released', state.manuallyReleasedLessons);
}
