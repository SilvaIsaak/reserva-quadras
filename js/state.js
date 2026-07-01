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

// --- State ---
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

// Para evitar dependência circular, a função save será definida no firebase.js ou main.js
// e poderá ser importada onde necessário.
