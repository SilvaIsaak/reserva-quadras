// Config e estado central do app (state, storage, USER_ROLES, config do Supabase, agendas fixas)
const storage = {
    get: (key, fallback) => {
        try {
            const val = localStorage.getItem(key);
            if (!val) return fallback;
            try {
                return JSON.parse(val);
            } catch (e) {
                return val; // Retorna como string se não for JSON
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
            console.warn(`LocalStorage write denied for ${key}.`, e);
            // Cota estourada ou acesso negado. Falhar em silêncio significava perder
            // cadastros de sócios sem nenhum sinal na tela.
            if (!storage._warned) {
                storage._warned = true;
                try {
                    showToast('Não foi possível salvar neste dispositivo (armazenamento cheio). Avise a diretoria.', 'error');
                } catch (_) {}
            }
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
let state = {
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
// publico não faz login. diretora/esportes autenticam de verdade
// via Supabase Auth (supabaseClient.auth.signInWithPassword) — a
// senha nunca é comparada no navegador.
// ============================================================
const USER_ROLES = {
    publico:  { label: 'Público',  icon: 'fas fa-users',        color: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', views: ['public'] },
    diretora: { label: 'Diretora', icon: 'fas fa-chart-pie',    color: 'bg-purple-500/10 border-purple-500/30 text-purple-400',   views: ['home'] },
    esportes: { label: 'Esportes', icon: 'fas fa-shield-halved', color: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400',  views: ['home', 'public', 'admin', 'settings'] }
};

let currentUser = null;
let selectedUserForLogin = null;


let pwdTargetUser = null;


// ============================================================
// SUPABASE — configuração do projeto
// Cole aqui a Project URL e a anon key do seu projeto Supabase
// (Painel do projeto → Project Settings → API). A anon key é
// pública por design — segura para ficar no front-end, desde que
// o RLS (supabase/schema.sql) esteja aplicado.
// ============================================================
const SUPABASE_URL = "https://rtitwzudsqbbzxuanxwx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0aXR3enVkc3FiYnp4dWFueHd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1OTc1MjAsImV4cCI6MjEwMjE3MzUyMH0.ifSVLwb6at2Ci1SPFg_L5H822joYPD22ylY-YnaAeLs";

// E-mails das contas reais de staff criadas em Authentication → Users.
// A senha exibida na tela de login é a senha dessas contas no Supabase.
const STAFF_EMAILS = {
    esportes: "silvaisaak50@gmail.com",
    diretora: "silvaisaak50+diretora@gmail.com"
};

const FIXED_SCHEDULES = {
    "Quadra 1": [
        { days: [1, 2, 3, 4, 5], start: "06:30", end: "11:00", status: "free" },
        { days: [1, 2, 3, 4, 5], start: "11:00", end: "16:00", status: "lesson" },
        { days: [1, 2, 3, 4, 5], start: "16:00", end: "22:00", status: "free" },
        { days: [6, 0], start: "06:30", end: "22:00", status: "free" }
    ],
    "Quadra 2": [
        { days: [1, 2, 3, 4, 5], start: "06:30", end: "17:00", status: "lesson" },
        { days: [1, 2, 3, 4, 5], start: "17:00", end: "22:00", status: "free" },
        { days: [6, 0], start: "06:30", end: "22:00", status: "free" }
    ],
    "Quadra 5": [
        { days: [1, 2, 3, 4, 5], start: "06:30", end: "10:00", status: "free" },
        { days: [1, 2, 3, 4, 5], start: "10:00", end: "17:00", status: "lesson" },
        { days: [1, 2, 3, 4, 5], start: "17:00", end: "22:00", status: "free" },
        { days: [6, 0], start: "06:30", end: "22:00", status: "free" }
    ],
    "Quadra 6": [
        { days: [1, 2, 3, 4, 5], start: "07:00", end: "12:00", status: "lesson" },
        { days: [1, 2, 3, 4, 5], start: "12:00", end: "13:00", status: "free" },
        { days: [1, 2, 3, 4, 5], start: "13:00", end: "18:00", status: "lesson" },
        { days: [1, 2, 3, 4, 5], start: "18:00", end: "19:00", status: "free" },
        { days: [1, 2, 3, 4, 5], start: "19:00", end: "22:00", status: "lesson" },
        { days: [6, 0], start: "06:30", end: "22:00", status: "free" }
    ],
    "Quadra 7": [
        { days: [1, 2, 3, 4, 5], start: "07:00", end: "12:30", status: "lesson" },
        { days: [1, 2, 3, 4, 5], start: "12:30", end: "14:30", status: "free" },
        { days: [1, 2, 3, 4, 5], start: "14:30", end: "22:00", status: "lesson" },
        { days: [6, 0], start: "06:30", end: "22:00", status: "free" }
    ],
    "Quadra Rápida": [
        { days: [1], start: "07:00", end: "12:00", status: "lesson" },
        { days: [1], start: "12:30", end: "18:00", status: "free" },
        { days: [1], start: "18:00", end: "22:00", status: "lesson" },
        { days: [2, 3, 4], start: "07:00", end: "12:00", status: "lesson" },
        { days: [2, 3, 4], start: "12:00", end: "14:00", status: "free" },
        { days: [2, 3, 4], start: "14:00", end: "22:00", status: "lesson" },
        { days: [5], start: "07:00", end: "12:00", status: "lesson" },
        { days: [5], start: "12:00", end: "13:30", status: "free" },
        { days: [5], start: "13:30", end: "18:00", status: "lesson" },
        { days: [5], start: "18:00", end: "22:00", status: "lesson" },
        { days: [6, 0], start: "06:30", end: "22:00", status: "free" }
    ]
};

// Recarrega a grade personalizada salva em saveFixedSchedules().
// Sem isso, o editor de horários gravava no localStorage e nunca lia de volta:
// a tela dizia "salvo com sucesso" e o próximo F5 restaurava o padrão acima.
(function hydrateFixedSchedules() {
    const saved = storage.get('rq_pro_fixed_schedules');
    if (!saved) return;
    try {
        const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            Object.keys(FIXED_SCHEDULES).forEach(k => delete FIXED_SCHEDULES[k]);
            Object.assign(FIXED_SCHEDULES, parsed);
        }
    } catch (e) {
        console.warn('Grade de aulas salva é inválida — mantendo o padrão.', e);
    }
})();

// Função para obter o status atual de uma quadra com base nas agendas fixas
