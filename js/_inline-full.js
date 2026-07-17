// NÃO CONECTADO AO index.html — referência para modularização futura, ver prompt-reorganizacao-reservaquadras.md

    <script>
// --- Helper: abrir/fechar modais com display:flex garantido ---
function showModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    el.style.display = 'flex';
}
function hideModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('hidden');
    el.style.display = '';
}

// --- Safe LocalStorage Wrapper ---
const storage = {
    get: (key, fallback) => {
        try {
            const val = localStorage.getItem(key);
            if (!val) return fallback;
            try {
                return JSON.parse(val);
            } catch (e) {
                return val; // Retorna como string se nÃ£o for JSON
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
let state = {
    courts: storage.get('rq_pro_courts', ["Quadra 1", "Quadra 2", "Quadra 3", "Quadra 4", "Quadra 5", "Quadra 6", "Quadra 7", "Quadra RÃ¡pida"]),
    bookings: storage.get('rq_pro_bookings', []),
    waitlist: storage.get('rq_pro_waitlist', []),
    withdrawals: storage.get('rq_pro_withdrawals', []),
    history: Array.isArray(storage.get('rq_pro_history', [])) ? storage.get('rq_pro_history', []) : [], 
    members: storage.get('rq_pro_members', {
        "1001": ["JoÃ£o Silva", "Maria Silva", "Pedro"],
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
// SISTEMA DE USUÃRIOS â€” 3 perfis: publico, diretora, esportes
// ============================================================
const USER_PASSWORDS = {
    publico:  null,         // sem senha
    diretora: 'diretora',  // senha padrÃ£o (altere aqui)
    esportes: 'esportes'   // senha padrÃ£o (altere aqui)
};

const USER_ROLES = {
    publico:  { label: 'PÃºblico',  icon: 'fas fa-users',        color: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', views: ['public'] },
    diretora: { label: 'Diretora', icon: 'fas fa-chart-pie',    color: 'bg-purple-500/10 border-purple-500/30 text-purple-400',   views: ['home'] },
    esportes: { label: 'Esportes', icon: 'fas fa-shield-halved', color: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400',  views: ['home', 'public', 'admin', 'settings'] }
};

let currentUser = null;
let selectedUserForLogin = null;

function selectUser(role) {
    selectedUserForLogin = role;
    if (USER_PASSWORDS[role] === null) {
        // Sem senha, entra direto
        loginAs(role);
        return;
    }
    // Mostra campo de senha
    document.getElementById('user-list').classList.add('hidden');
    document.getElementById('pin-area').classList.remove('hidden');
    document.getElementById('pin-label').textContent = `Senha para ${USER_ROLES[role].label}`;
    document.getElementById('pin-input').value = '';
    document.getElementById('pin-error').classList.add('hidden');
    setTimeout(() => document.getElementById('pin-input').focus(), 100);
}

function confirmPin() {
    const input = document.getElementById('pin-input').value;
    if (input === USER_PASSWORDS[selectedUserForLogin]) {
        loginAs(selectedUserForLogin);
    } else {
        const err = document.getElementById('pin-error');
        err.classList.remove('hidden');
        document.getElementById('pin-input').value = '';
        document.getElementById('pin-input').focus();
    }
}

function backToUsers() {
    selectedUserForLogin = null;
    document.getElementById('pin-area').classList.add('hidden');
    document.getElementById('user-list').classList.remove('hidden');
}

function loginAs(role) {
    currentUser = role;
    storage.set('rq_pro_user', role); // Persistir usuÃ¡rio logado
    const info = USER_ROLES[role];

    // Esconde tela de login
    const loginScreen = document.getElementById('login-screen');
    gsap.to(loginScreen, { opacity: 0, duration: 0.4, onComplete: () => loginScreen.style.display = 'none' });

    // Atualiza badge na nav
    const badge = document.getElementById('role-badge');
    const roleIcon = document.getElementById('role-icon');
    const roleLabel = document.getElementById('role-label');
    badge.className = `hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${info.color}`;
    roleIcon.className = `${info.icon} text-xs`;
    roleLabel.textContent = info.label;

    // Mostra/oculta itens de nav por role
    applyRoleToNav(role);

    // Navega para a view correta
    const defaultView = info.views[0];
    setTimeout(() => switchView(defaultView), 50);
}

function applyRoleToNav(role) {
    // Hide all role-specific nav links (top nav)
    document.querySelectorAll('[class*="nav-publico"], [class*="nav-diretora"], [class*="nav-esportes"]').forEach(el => {
        el.style.display = 'none';
    });
    // Show top nav links for this role
    document.querySelectorAll(`.nav-${role}`).forEach(el => {
        el.style.display = '';
    });

    // Bottom nav: ocultar botÃµes que nÃ£o pertencem a este perfil
    document.querySelectorAll('#mobile-bottom-nav .bottom-nav-btn').forEach(btn => {
        const views = (btn.getAttribute('data-views') || '').split(' ');
        const hasRole = views.includes(`nav-${role}`);
        btn.style.display = hasRole ? '' : 'none';
    });
}

function logout() {
    currentUser = null;
    selectedUserForLogin = null;
    storage.remove('rq_pro_user'); // Remover persistÃªncia do usuÃ¡rio
    // Esconde todas as views
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    // Mostra tela de login
    const loginScreen = document.getElementById('login-screen');
    loginScreen.style.display = 'flex';
    document.getElementById('pin-area').classList.add('hidden');
    document.getElementById('user-list').classList.remove('hidden');
    gsap.fromTo(loginScreen, { opacity: 0 }, { opacity: 1, duration: 0.4 });
}

// Carrega senhas salvas no localStorage (se houver)
function loadSavedPasswords() {
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

let pwdTargetUser = null;

function openPasswordModal(role) {
    if (currentUser !== 'esportes') return; // sÃ³ esportes pode
    pwdTargetUser = role;
    const info = USER_ROLES[role];
    document.getElementById('pwd-modal-title').textContent = `Senha â€” ${info.label}`;
    document.getElementById('pwd-modal-subtitle').textContent = `Alterar senha de acesso do perfil ${info.label}`;
    document.getElementById('pwd-new').value = '';
    document.getElementById('pwd-confirm').value = '';
    document.getElementById('pwd-match-msg').classList.add('hidden');
    document.getElementById('pwd-save-btn').disabled = true;
    document.getElementById('pwd-save-btn').classList.add('opacity-40');
    const modal = document.getElementById('password-modal');
    showModal('password-modal');
    gsap.fromTo(modal.querySelector('.modal-theme-fix'), { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out' });
    setTimeout(() => document.getElementById('pwd-new').focus(), 150);
}

function closePasswordModal() {
    hideModal('password-modal');
    pwdTargetUser = null;
}

function togglePwdVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash text-sm';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye text-sm';
    }
}

function checkPwdMatch() {
    const newPwd = document.getElementById('pwd-new').value;
    const confirm = document.getElementById('pwd-confirm').value;
    const msg = document.getElementById('pwd-match-msg');
    const btn = document.getElementById('pwd-save-btn');

    if (newPwd.length < 4) {
        msg.textContent = 'MÃ­nimo de 4 caracteres.';
        msg.className = 'text-xs font-bold text-amber-400';
        msg.classList.remove('hidden');
        btn.disabled = true;
        btn.classList.add('opacity-40');
        return;
    }
    if (confirm.length === 0) {
        msg.classList.add('hidden');
        btn.disabled = true;
        btn.classList.add('opacity-40');
        return;
    }
    if (newPwd === confirm) {
        msg.textContent = 'âœ“ Senhas coincidem';
        msg.className = 'text-xs font-bold text-emerald-400';
        msg.classList.remove('hidden');
        btn.disabled = false;
        btn.classList.remove('opacity-40');
    } else {
        msg.textContent = 'âœ— Senhas nÃ£o coincidem';
        msg.className = 'text-xs font-bold text-red-400';
        msg.classList.remove('hidden');
        btn.disabled = true;
        btn.classList.add('opacity-40');
    }
}

function savePassword() {
    const newPwd = document.getElementById('pwd-new').value;
    if (!pwdTargetUser || newPwd.length < 4) return;

    USER_PASSWORDS[pwdTargetUser] = newPwd;

    // Persiste no localStorage
    const toSave = { esportes: USER_PASSWORDS.esportes, diretora: USER_PASSWORDS.diretora };
    storage.set('rq_user_passwords', JSON.stringify(toSave));

    closePasswordModal();
    showToast(`Senha do perfil ${USER_ROLES[pwdTargetUser].label} atualizada!`, 'success');
}
const HARDCODED_FIREBASE_CONFIG = { 
    "apiKey": "AIzaSyDta2ReINHNdfsyqma8zrPqUuR40gXEyw8", 
    "authDomain": "reserva-de-quadras-ff122.firebaseapp.com", 
    "projectId": "reserva-de-quadras-ff122", 
    "storageBucket": "reserva-de-quadras-ff122.firebasestorage.app", 
    "messagingSenderId": "535600657201", 
    "appId": "1:535600657201:web:d3997814a9ebdec8237610" 
};

// Mobile Menu Toggle
function toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    const isHidden = menu.classList.contains('hidden');
    
    if (isHidden) {
        menu.classList.remove('hidden');
        setTimeout(() => menu.classList.add('open'), 10);
    } else {
        menu.classList.remove('open');
        setTimeout(() => menu.classList.add('hidden'), 400);
    }
}

// FunÃ§Ãµes auxiliares para datas dinÃ¢micas
function getTodayDate() {
    return getAccurateNow().toLocaleDateString('pt-BR');
}

function getWeekdayName() {
    return getAccurateNow().toLocaleDateString('pt-BR', { weekday: 'long' });
}

// --- Agendas Fixas ---
// Suporta days: [1,2,3,4,5] (Seg-Sex), [6] (SÃ¡bado), [0] (Domingo)
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
    "Quadra RÃ¡pida": [
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

// FunÃ§Ã£o para obter o status atual de uma quadra com base nas agendas fixas
function getFixedStatus(courtName) {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = SÃ¡bado
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const schedules = FIXED_SCHEDULES[courtName];
    if (!schedules) return null;
    
    for (const schedule of schedules) {
        if (schedule.days.includes(dayOfWeek)) {
            const startMinutes = timeToMinutes(schedule.start);
            const endMinutes = timeToMinutes(schedule.end);
            
            if (endMinutes > startMinutes) {
                if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
                    return schedule.status;
                }
            } else {
                if (currentMinutes >= startMinutes || currentMinutes < endMinutes) {
                    return schedule.status;
                }
            }
        }
    }
    
    return "free";
}

state.settings.firebaseConfig = HARDCODED_FIREBASE_CONFIG;

let lastClosingDate = storage.get('last_closing_date') || '';
let firebaseApp = null;
let firebaseDb = null;
let isCloudSyncing = false;

// FunÃ§Ã£o para encerrar todas as atividades Ã s 22:00
function closeAllActivities() {
    const now = new Date();
    const currentDate = now.toLocaleDateString('pt-BR');
    
    // Verificar se jÃ¡ encerramos hoje
    if (lastClosingDate === currentDate) {
        return;
    }
    
    const currentHour = now.getHours();
    
    // Verificar se Ã© 22:00 ou depois
    if (currentHour < 22) {
        return;
    }
    
    // Encerrar todas as atividades
    const endTime = "22:00";
    
    // Iterar por todas as reservas ativas
    const bookingsToClose = [...state.bookings];
    for (const booking of bookingsToClose) {
        let playDuration = 0;
        if (booking.startTime) {
            try {
                const [h1, m1] = booking.startTime.split(':').map(Number);
                const h2 = 22;
                const m2 = 0;
                playDuration = (h2 * 60 + m2) - (h1 * 60 + m1);
                if (playDuration < 0) playDuration += 24 * 60;
            } catch(e) {}
        }
        
        let waitDuration = 0;
        if (booking.registrationTime && booking.startTime && !booking.type) {
            try {
                const [h1, m1] = booking.registrationTime.split(':').map(Number);
                const [h2, m2] = booking.startTime.split(':').map(Number);
                waitDuration = (h2 * 60 + m2) - (h1 * 60 + m1);
            } catch(e) {}
        }
        
        // Adicionar ao histÃ³rico
        state.history.push({ 
            ...booking, 
            date: currentDate, 
            weekday: now.toLocaleDateString('pt-BR', { weekday: 'long' }), 
            endTime: endTime, 
            playDuration: playDuration > 0 ? playDuration : 0, 
            waitDuration: waitDuration > 0 ? waitDuration : 0,
            tempoEsperaMin: waitDuration > 0 ? waitDuration : 0,
            totalJogadores: (booking.players || []).length,
            periodoStr: getPeriodoStr(booking.startTime),
            activity: booking.type === 'lesson' ? "AULA" : (booking.activity || "OUTRO"),
            encerradoPor: "automatico_22h"
        });
    }
    
    // Limpar todas as reservas
    state.bookings = [];
    
    // Mover fila de espera para desistÃªncias
    const waitlistToClose = [...state.waitlist];
    for (const entry of waitlistToClose) {
        state.withdrawals.push({ 
            ...entry, 
            withdrawnAt: endTime, 
            withdrawnDate: currentDate 
        });
    }
    state.waitlist = [];
    
    // Atualizar a Ãºltima data de encerramento
    lastClosingDate = currentDate;
    storage.set('last_closing_date', lastClosingDate);
    
    save();
    render();
    
    // Mostrar notificaÃ§Ã£o
    showToast("Todas as atividades encerradas automaticamente Ã s 22:00!", "info");
    console.log("Todas as atividades encerradas automaticamente Ã s 22:00");
}

function connectFirebase() {
    if (!state.settings.firebaseConfig) {
        showToast("Cole sua configuraÃ§Ã£o do Firebase primeiro!", "warning");
        return;
    }

    try {
        if (firebaseApp) {
            firebaseApp.delete();
        }
        
        firebaseApp = firebase.initializeApp(state.settings.firebaseConfig);
        firebaseDb = firebase.database(firebaseApp);
        const statusEl = document.getElementById('cloud-status');
        
        firebaseDb.ref('rq_state').on('value', (snapshot) => {
            const cloudData = snapshot.val();
            if (cloudData && !isCloudSyncing) {
                console.log("Sincronizando da nuvem...");
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
                render();
                console.log("Estado atualizado via Nuvem!");
            }
        });

        if(statusEl) {
            statusEl.innerText = "CONECTADO";
            statusEl.classList.replace('text-gray-500', 'text-emerald-400');
        }
        showToast("Conectado Ã  Nuvem!", "success");
    } catch (err) {
        console.error(err);
        showToast("Erro ao conectar ao Firebase!", "error");
    }
}

function applyTheme() {
    let theme = state.settings.theme || 'dark';
    if(theme === 'auto') {
        const hour = new Date().getHours();
        theme = (hour >= 7 && hour < 18) ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon();
}

function toggleTheme() {
    const themes = ['dark', 'light', 'auto'];
    const currentIdx = themes.indexOf(state.settings.theme || 'dark');
    const nextIdx = (currentIdx + 1) % themes.length;
    
    state.settings.theme = themes[nextIdx];
    applyTheme();
    save();
    
    const labels = { 'dark': 'Escuro', 'light': 'Claro', 'auto': 'AutomÃ¡tico' };
    showToast(`Tema ${labels[state.settings.theme]} ativado`, 'info');
}

function updateThemeIcon() {
    const icon = document.getElementById('theme-icon');
    const iconMobile = document.getElementById('theme-icon-mobile');
    if(!icon && !iconMobile) return;
    
    const mode = state.settings.theme || 'dark';
    let iconClass = '';
    if(mode === 'auto') {
        iconClass = 'fas fa-wand-magic-sparkles text-indigo-400';
    } else if(mode === 'light') {
        iconClass = 'fas fa-sun text-amber-500';
    } else {
        iconClass = 'fas fa-moon text-indigo-400';
    }
    
    if(icon) icon.className = iconClass + (icon.id === 'theme-icon' ? ' text-sm md:text-base' : '');
    if(iconMobile) iconMobile.className = iconClass + ' text-sm';
}

if(!state.courts.includes("Quadra RÃ¡pida")) {
    state.courts.push("Quadra RÃ¡pida");
    storage.set('rq_pro_courts', JSON.stringify(state.courts));
}

// Datas dinÃ¢micas via funÃ§Ãµes getTodayDate() e getWeekdayName()

function saveLocal() {
    storage.set('rq_pro_courts', state.courts);
    storage.set('rq_pro_bookings', state.bookings);
    storage.set('rq_pro_waitlist', state.waitlist);
    storage.set('rq_pro_withdrawals', state.withdrawals);
    storage.set('rq_pro_history', state.history);
    storage.set('rq_pro_members', state.members);
    storage.set('rq_pro_settings', state.settings);
    storage.set('rq_pro_manually_released', state.manuallyReleasedLessons);
}

function save() {
    saveLocal();
    if (firebaseDb) {
        isCloudSyncing = true;
        
        // Sanitizar dados para evitar erro de 'undefined' no Firebase
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

function switchView(view) {
    // Guard: check if currentUser has access
    if (currentUser && USER_ROLES[currentUser] && !USER_ROLES[currentUser].views.includes(view)) {
        return; // silently block
    }
    
    const targetView = document.getElementById(`${view}-view`);
    if(!targetView) return;

    // Close mobile menu if open
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu && mobileMenu.classList.contains('open')) {
        toggleMobileMenu();
    }

    state.currentView = view;
    
    const canvas = document.getElementById('tennis-canvas');
    const glass = document.getElementById('glass-overlay');
    if (view === 'public' && !state.settings.performanceMode) {
        if(canvas) canvas.style.display = 'block';
        if(glass) glass.style.display = 'block';
    } else {
        if(canvas) canvas.style.display = 'none';
        if(glass) glass.style.display = 'none';
    }

    const currentViewEl = document.querySelector('.view:not(.hidden)');
    if (currentViewEl && currentViewEl !== targetView) {
        gsap.to(currentViewEl, { 
            opacity: 0, 
            y: 10,
            duration: 0.2, 
            ease: "power2.in",
            onComplete: () => {
                currentViewEl.classList.add('hidden');
                showNewView(targetView, view);
            }
        });
    } else {
        showNewView(targetView, view);
    }
}

function showNewView(targetView, view) {
    targetView.classList.remove('hidden');
    document.querySelectorAll('.nav-link').forEach(l => {
        l.classList.remove('active', 'text-white');
        l.classList.add('text-gray-400');
    });
    const activeNavLink = document.getElementById(`nav-${view}`);
    if(activeNavLink) activeNavLink.classList.add('active', 'text-white');

    // Sincronizar bottom nav
    updateBottomNav(view);
    
    render();
    
    gsap.fromTo(targetView, 
        { opacity: 0, y: -10 }, 
        { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }
    );
}

function updateBottomNav(activeView) {
    document.querySelectorAll('#mobile-bottom-nav .bottom-nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`bnav-${activeView}`);
    if (activeBtn) activeBtn.classList.add('active');
}

function switchSettingsTab(tabId) {
    // Update buttons
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === tabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update panels
    document.querySelectorAll('.settings-panel').forEach(panel => {
        if (panel.id === `settings-panel-${tabId}`) {
            panel.classList.add('active');
            gsap.fromTo(panel, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3 });
        } else {
            panel.classList.remove('active');
        }
    });
}

let currentBookingMode = 'court';

function updateActivityOptions(prefix = '') {
    const players = [];
    const idPrefix = prefix === 'edit' ? 'edit-p-name-' : 'p-name-';
    const activityId = prefix === 'edit' ? 'edit-activity' : 'field-activity';
    
    for(let i=0; i<4; i++) {
        const el = document.getElementById(`${idPrefix}${i}`);
        const n = el ? el.value : '';
        if(n) players.push(n);
    }
    const count = players.length;
    const select = document.getElementById(activityId);
    if (!select) return;
    const currentValue = select.value;
    let options = '';
    if (count === 1) {
        options = '<option value="Individual">ðŸƒ Individual</option>';
    } else if (count === 2) {
        options = `
            <option value="Simples">ðŸŽ¾ Jogo Simples</option>
            <option value="Ranking infantil">ðŸ† Ranking Infantil</option>
            <option value="Ranking adulto">ðŸ† Ranking Adulto</option>
            <option value="Bate-bola">ðŸ”„ Bate-bola</option>
        `;
    } else if (count === 3) {
        options = '<option value="Bate-bola">ðŸ”„ Bate-bola</option>';
    } else if (count === 4) {
        options = '<option value="Dupla">ðŸŽ¾ Jogo Dupla</option>';
    } else {
        options = `
            <option value="Dupla">ðŸŽ¾ Jogo Dupla</option>
            <option value="Simples">ðŸŽ¾ Jogo Simples</option>
            <option value="Ranking infantil">ðŸ† Ranking Infantil</option>
            <option value="Ranking adulto">ðŸ† Ranking Adulto</option>
            <option value="Bate-bola">ðŸ”„ Bate-bola</option>
            <option value="Individual">ðŸƒ Individual</option>
        `;
    }
    select.innerHTML = options;
    const newOptions = Array.from(select.options).map(o => o.value);
    if (newOptions.includes(currentValue)) select.value = currentValue;
    if (prefix !== 'edit') toggleDuration();
}

function openBookingModal(mode = 'court') {
    currentBookingMode = mode;
    showModal('booking-modal');
    gsap.fromTo("#booking-modal > div:last-child", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out" });
    const titleEl = document.getElementById('booking-modal-title');
    const subtitleEl = document.getElementById('booking-modal-subtitle');
    const courtBox = document.getElementById('court-field-box');
    if(mode === 'queue') {
        titleEl.innerText = "InscriÃ§Ã£o na Fila";
        subtitleEl.innerText = "Entrar na fila de espera global";
        courtBox.classList.add('hidden');
        document.getElementById('field-court').required = false;
    } else {
        titleEl.innerText = "InscriÃ§Ã£o Direta";
        subtitleEl.innerText = "Alocar diretamente em uma quadra livre";
        courtBox.classList.remove('hidden');
        document.getElementById('field-court').required = true;
    }
    document.getElementById('booking-form').reset();
    document.getElementById('field-observation').value = '';
    document.getElementById('field-start').value = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const select = document.getElementById('field-court');
    select.innerHTML = state.courts.map(c => `<option value="${c}">${c}</option>`).join('');
    const container = document.getElementById('player-rows');
    container.innerHTML = '';
    for(let i=0; i<4; i++) {
        container.innerHTML += `
            <div class="grid grid-cols-2 gap-4">
                <input type="text" placeholder="TÃ­tulo" oninput="searchMember(${i}, this.value)" class="input-glass p-4 rounded-2xl text-sm font-bold">
                <select id="p-name-${i}" onchange="updateActivityOptions()" class="input-glass p-4 rounded-2xl text-sm font-bold">
                    <option value="">Nome...</option>
                </select>
            </div>
        `;
    }
    updateActivityOptions();
}

function closeBookingModal() {
    gsap.to("#booking-modal > div:last-child", { scale: 0.8, opacity: 0, duration: 0.3, onComplete: () => {
        hideModal('booking-modal');
    }});
}

function toggleDuration() {
    const act = document.getElementById('field-activity').value;
    document.getElementById('dur-box').classList.toggle('hidden', act !== 'Bate-bola');
}

function searchMember(idx, title, prefix = '') {
    const cleanTitle = title.trim();
    let nameId;
    if (prefix === 'edit') nameId = `edit-p-name-${idx}`;
    else if (prefix === 'we') nameId = `we-p-name-${idx}`;
    else nameId = `p-name-${idx}`;
    if(!cleanTitle) {
        document.getElementById(nameId).innerHTML = '<option value="">Nome...</option>';
        updateActivityOptions(prefix);
        return;
    }
    let names = state.members[cleanTitle];
    if(!names) {
        const foundKey = Object.keys(state.members).find(k => k.trim() === cleanTitle);
        if(foundKey) names = state.members[foundKey];
    }
    if(!names) {
        const searchNum = parseFloat(cleanTitle);
        const foundKey = Object.keys(state.members).find(k => {
            const keyNum = parseFloat(k);
            return (!isNaN(searchNum) && !isNaN(keyNum) && searchNum === keyNum) || String(k).trim() === String(cleanTitle);
        });
        if(foundKey) names = state.members[foundKey];
    }
    const select = document.getElementById(nameId);
    if(names && names.length > 0) {
        select.innerHTML = '<option value="">Selecionar Nome...</option>' + names.map(n => `<option value="${n}">${n}</option>`).join('');
        updateActivityOptions(prefix);
    } else {
        select.innerHTML = '<option value="">TÃ­tulo nÃ£o encontrado</option>';
        updateActivityOptions(prefix);
    }
    select.onchange = () => {
        const selectedName = select.value;
        if (!selectedName) return;
        const alreadyPlayedDupla = state.history.some(h => 
            h.date === getTodayDate() && h.activity === "Dupla" && h.titles && h.titles.includes(cleanTitle) && h.players && h.players.includes(selectedName)
        );
        if(alreadyPlayedDupla) showToast(`O sÃ³cio ${selectedName} (TÃ­tulo ${cleanTitle}) jÃ¡ jogou Dupla hoje! FicarÃ¡ sem preferÃªncia (Regra 6.2).`, 'warning');
        updateActivityOptions(prefix);
    };
}

function openAdminAction(court) {
    state.activeAdminCourt = court;
    document.getElementById('admin-court-title').innerText = court;
    document.getElementById('admin-observation').value = '';
    showModal('admin-modal');
    gsap.fromTo("#admin-modal > div:last-child", { y: 100, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 });
}

function closeAdminModal() { hideModal('admin-modal'); }
function openMemberModal() {
    const sidebar = document.getElementById('members-sidebar');
    const panel = document.getElementById('members-sidebar-panel');
    if (!sidebar || !panel) return;
    sidebar.classList.remove('hidden');
    sidebar.style.display = 'block';
    // ForÃ§a reflow antes de animar
    panel.getBoundingClientRect();
    panel.style.transform = 'translateX(0)';
    renderMembersList();
}
function closeMemberModal() {
    const sidebar = document.getElementById('members-sidebar');
    const panel = document.getElementById('members-sidebar-panel');
    if (!sidebar || !panel) return;
    panel.style.transform = 'translateX(100%)';
    setTimeout(() => {
        sidebar.classList.add('hidden');
        sidebar.style.display = '';
    }, 420);
}

function renderMembersList() {
    const container = document.getElementById('members-list-container');
    const countLabel = document.getElementById('members-count-label');
    const search = (document.getElementById('members-search')?.value || '').toLowerCase();
    if (!container) return;

    const entries = Object.entries(state.members || {});
    const filtered = search
        ? entries.filter(([title, names]) =>
            title.toLowerCase().includes(search) ||
            (Array.isArray(names) ? names.some(n => n.toLowerCase().includes(search)) : String(names).toLowerCase().includes(search))
          )
        : entries;

    if (countLabel) countLabel.textContent = `${entries.length} tÃ­tulo${entries.length !== 1 ? 's' : ''} cadastrado${entries.length !== 1 ? 's' : ''}`;

    if (filtered.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-500 py-10 font-bold text-sm">${search ? 'Nenhum resultado encontrado.' : 'Nenhum sÃ³cio cadastrado.'}</p>`;
        return;
    }

    container.innerHTML = filtered.map(([title, names]) => {
        const nameList = Array.isArray(names) ? names : [names];
        return `
        <div class="glass-card p-4 rounded-2xl border border-white/10">
            <div class="flex justify-between items-start gap-2">
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-black text-indigo-400 uppercase tracking-widest">TÃ­tulo ${title}</p>
                    <div class="mt-2 space-y-1">
                        ${nameList.map((name, idx) => `
                        <div class="flex items-center justify-between gap-2 py-1 border-b border-white/5 last:border-0">
                            <span class="text-sm text-white font-bold truncate">${name}</span>
                            <button onclick="removeMemberName('${title}', ${idx})" class="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all text-[10px]"><i class="fas fa-times"></i></button>
                        </div>`).join('')}
                    </div>
                    <button onclick="addNameToTitle('${title}')" class="mt-2 text-[9px] font-black text-indigo-400 uppercase tracking-widest hover:text-indigo-300 transition-all flex items-center gap-1"><i class="fas fa-plus"></i> Adicionar nome</button>
                </div>
                <button onclick="deleteMemberTitle('${title}')" class="shrink-0 w-7 h-7 flex items-center justify-center rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all text-xs border border-red-500/20"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

function addNewMember() {
    const titleInput = document.getElementById('new-member-title');
    const nameInput = document.getElementById('new-member-name');
    if (!titleInput || !nameInput) return;
    const title = titleInput.value.trim();
    const name = nameInput.value.trim();
    if (!title || !name) { showToast('Preencha o nÃºmero do tÃ­tulo e o nome.', 'warning'); return; }
    if (!state.members) state.members = {};
    if (!state.members[title]) state.members[title] = [];
    if (!Array.isArray(state.members[title])) state.members[title] = [state.members[title]];
    if (state.members[title].includes(name)) { showToast('Este nome jÃ¡ estÃ¡ cadastrado neste tÃ­tulo.', 'warning'); return; }
    state.members[title].push(name);
    save();
    titleInput.value = '';
    nameInput.value = '';
    renderMembersList();
    showToast(`${name} adicionado ao tÃ­tulo ${title}!`, 'success');
}

function deleteMemberTitle(title) {
    if (!confirm(`Excluir o tÃ­tulo ${title} e todos os seus sÃ³cios?`)) return;
    delete state.members[title];
    save();
    renderMembersList();
    showToast(`TÃ­tulo ${title} removido.`, 'success');
}

function removeMemberName(title, idx) {
    if (!state.members[title]) return;
    const names = Array.isArray(state.members[title]) ? state.members[title] : [state.members[title]];
    names.splice(idx, 1);
    if (names.length === 0) {
        delete state.members[title];
    } else {
        state.members[title] = names;
    }
    save();
    renderMembersList();
    showToast('SÃ³cio removido.', 'success');
}

function addNameToTitle(title) {
    const name = prompt(`Adicionar nome ao tÃ­tulo ${title}:`);
    if (!name || !name.trim()) return;
    if (!Array.isArray(state.members[title])) state.members[title] = [state.members[title]].filter(Boolean);
    if (state.members[title].includes(name.trim())) { showToast('Nome jÃ¡ cadastrado neste tÃ­tulo.', 'warning'); return; }
    state.members[title].push(name.trim());
    save();
    renderMembersList();
    showToast(`${name.trim()} adicionado ao tÃ­tulo ${title}!`, 'success');
}


function openMoveModal(id) {
    activeMoveId = id;
    const container = document.getElementById('move-court-options');
    container.innerHTML = state.courts.map(c => {
        const isOccupied = state.bookings.some(b => b.court === c);
        const btnClass = isOccupied ? "bg-white/5 border-white/10 text-gray-500 cursor-not-allowed" : "bg-indigo-500/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-500 hover:text-white";
        return `<button onclick="${isOccupied ? '' : `moveToCourt('${c}')`}" class="w-full py-4 rounded-2xl border font-black uppercase tracking-widest text-xs transition-all flex justify-between items-center px-6 ${btnClass}"><span>${c}</span>${isOccupied ? '<span class="text-[8px] bg-red-500/20 text-red-400 px-2 py-1 rounded-lg">OCUPADA</span>' : '<i class="fas fa-chevron-right"></i>'}</button>`;
    }).join('');
    showModal('move-modal');
    gsap.fromTo("#move-modal > div:last-child", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out" });
}
function closeMoveModal() {
    gsap.to("#move-modal > div:last-child", { scale: 0.8, opacity: 0, duration: 0.3, onComplete: () => {
        hideModal('move-modal');
    }});
}

function moveToCourt(court) {
    const waitIdx = state.waitlist.findIndex(w => String(w.id) === String(activeMoveId));
    if (waitIdx !== -1) {
        const entry = state.waitlist.splice(waitIdx, 1)[0];
        entry.court = court;
        entry.registrationTime = entry.registrationTime || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        entry.startTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        if(entry.activity === "Bate-bola") {
            const [h, m] = entry.startTime.split(':').map(Number);
            const end = new Date();
            end.setHours(h + 1, m);
            entry.endTime = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }
        state.bookings.push(entry);
        save(); render(); closeMoveModal();
        showToast(`${entry.players[0]} movido para a ${court}`, "success");
        confetti({ particleCount: 100, spread: 50, origin: { y: 0.8 } });
    }
}

let activeEditCourt = null;
function openEditModal(court) {
    activeEditCourt = court;
    const b = state.bookings.find(book => book.court === court);
    if(b) {
        const container = document.getElementById('edit-player-rows');
        container.innerHTML = '';
        for(let i=0; i<4; i++) {
            const title = (b.titles && b.titles[i]) || '';
            const player = (b.players && b.players[i]) || '';
            
            container.innerHTML += `
                <div class="grid grid-cols-2 gap-4">
                    <input type="text" id="edit-p-title-${i}" value="${title}" placeholder="TÃ­tulo" oninput="searchMember(${i}, this.value, 'edit')" class="input-glass p-4 rounded-2xl text-sm font-bold">
                    <select id="edit-p-name-${i}" onchange="updateActivityOptions('edit')" class="input-glass p-4 rounded-2xl text-sm font-bold">
                        <option value="">Nome...</option>
                    </select>
                </div>
            `;
            
            if(title) {
                searchMember(i, title, 'edit');
                const select = document.getElementById(`edit-p-name-${i}`);
                if(select) select.value = player;
            }
        }
        updateActivityOptions('edit');
        document.getElementById('edit-activity').value = b.activity;
        document.getElementById('edit-observation').value = b.observation || '';
        document.getElementById('edit-registration').value = b.registrationTime || '';
        document.getElementById('edit-start').value = b.startTime || '';
        showModal('edit-modal');
        gsap.fromTo("#edit-modal > div:last-child", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out" });
    }
}
function closeEditModal() { hideModal('edit-modal'); }
function saveEdit() {
    const b = state.bookings.find(book => book.court === activeEditCourt);
    if(b) {
        const players = [], titles = [];
        const activity = document.getElementById('edit-activity').value;
        for(let i=0; i<4; i++) {
            const t = document.getElementById(`edit-p-title-${i}`).value.trim();
            const n = document.getElementById(`edit-p-name-${i}`).value;
            if(t && n) {
                players.push(n); titles.push(t);
            }
        }

        if(players.length === 0) return showToast("Adicione jogadores!", "error");
        if(activity === "Dupla" && players.length !== 4) return showToast("Reserva de Dupla exige exatamente 4 jogadores!", "error");
        if((activity === "Simples" || activity === "Ranking infantil" || activity === "Ranking adulto") && players.length !== 2) return showToast(`A atividade ${activity} exige exatamente 2 jogadores!`, "error");
        if(activity === "Individual" && players.length !== 1) return showToast("Atividade Individual exige exatamente 1 jogador!", "error");
        if(activity === "Bate-bola" && (players.length < 2 || players.length > 3)) {
            if(players.length === 4) return showToast("Com 4 jogadores, selecione a opÃ§Ã£o Dupla!", "error");
            return showToast("Bate-bola permitido para 2 ou 3 jogadores!", "error");
        }

        b.players = players;
        b.titles = titles;
        b.activity = activity;
        b.observation = document.getElementById('edit-observation').value.trim();
        b.registrationTime = document.getElementById('edit-registration').value;
        b.startTime = document.getElementById('edit-start').value;
        if(b.activity === "Bate-bola" && b.startTime) {
            const [h, m] = b.startTime.split(':').map(Number);
            const end = new Date();
            end.setHours(h + 1, m);
            b.endTime = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }
        save(); render(); closeEditModal();
        showToast("AlteraÃ§Ãµes salvas!", "success");
    }
}

const memberForm = document.getElementById('member-form');
if(memberForm) {
    memberForm.onsubmit = (e) => {
        e.preventDefault();
        const title = document.getElementById('mem-title').value.trim();
        const names = document.getElementById('mem-names').value.split(',').map(n => n.trim()).filter(n => n !== '');
        if(title && names.length > 0) {
            state.members[title] = names;
            save(); showToast(`SÃ³cio ${title} cadastrado com sucesso!`, 'success');
            closeMemberModal(); document.getElementById('member-form').reset();
        }
    };
}

function setCourtStatus(type) {
    const obs = document.getElementById('admin-observation').value.trim();
    if(type === 'free') {
        // Se for liberar, usar a funÃ§Ã£o releaseCourt que adiciona ao histÃ³rico
        releaseCourt(state.activeAdminCourt);
    } else {
        // Para outros status, remover qualquer reserva existente e adicionar o novo status
        state.bookings = state.bookings.filter(b => b.court !== state.activeAdminCourt);
        state.bookings.push({
            id: Date.now(), court: state.activeAdminCourt, type: type,
            activity: type.toUpperCase(),
            players: [type.toUpperCase()], observation: obs, startTime: new Date().toTimeString().slice(0,5)
        });
        save(); render();
        showToast(`Status da quadra atualizado!`, 'success');
    }
    closeAdminModal();
}

const bookingForm = document.getElementById('booking-form');
if(bookingForm) {
    bookingForm.onsubmit = (e) => {
        e.preventDefault();
        const players = [], titles = [];
        let repeat = false;
        const activity = document.getElementById('field-activity').value;
        for(let i=0; i<4; i++) {
            const t = document.querySelector(`#player-rows div:nth-child(${i+1}) input`).value;
            const n = document.getElementById(`p-name-${i}`).value;
            if(t && n) {
                players.push(n); titles.push(t);
                if(activity === "Dupla" && state.history.some(h => h.date === getTodayDate() && h.activity === "Dupla" && h.titles && h.titles.includes(t) && h.players && h.players.includes(n))) repeat = true;
            }
        }
        if(players.length === 0) return showToast("Adicione jogadores!", "error");
        if(activity === "Dupla" && players.length !== 4) return showToast("Reserva de Dupla exige exatamente 4 jogadores!", "error");
        if((activity === "Simples" || activity === "Ranking infantil" || activity === "Ranking adulto") && players.length !== 2) return showToast(`A atividade ${activity} exige exatamente 2 jogadores!`, "error");
        if(activity === "Individual" && players.length !== 1) return showToast("Atividade Individual exige exatamente 1 jogador!", "error");
        if(activity === "Bate-bola" && (players.length < 2 || players.length > 3)) {
            if(players.length === 4) return showToast("Com 4 jogadores, selecione a opÃ§Ã£o Dupla!", "error");
            return showToast("Bate-bola permitido para 2 ou 3 jogadores!", "error");
        }
        const entry = {
            id: Date.now(), court: currentBookingMode === 'queue' ? null : document.getElementById('field-court').value,
            activity, registrationTime: document.getElementById('field-start').value, registrationDate: new Date().toLocaleDateString('pt-BR'),
            startTime: null, endTime: null, observation: document.getElementById('field-observation').value.trim(), players, titles, repeat
        };
        if(currentBookingMode === 'queue') {
            state.waitlist.push(entry); showToast("Adicionado Ã  fila de espera!", "info"); save();
        } else processEntry(entry);
        closeBookingModal(); render();
    };
}

function processEntry(entry) {
    const court = entry.court;
    const occupied = state.bookings.find(b => b.court === court);
    if(occupied || entry.repeat) {
        state.waitlist.push(entry);
        if(entry.repeat) showToast("SÃ³cio jÃ¡ jogou hoje: Fim da fila.", "warning");
        else showToast("Quadra ocupada: Movido para a fila.", "info");
    } else {
        entry.startTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        if(entry.activity === "Bate-bola") {
            const [h, m] = entry.startTime.split(':').map(Number);
            const end = new Date(); end.setHours(h + 1, m);
            entry.endTime = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }
        state.bookings.push(entry);
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    }
    save();
}

function updateSettingsSilent() {
    try {
        // Suporte a ambos os IDs (settings e admin)
        const membersEl = document.getElementById('set-members') || document.getElementById('set-members-admin');
        let input = membersEl ? membersEl.value.trim() : '';
        if(input) {
            let parsed;
            try { parsed = JSON.parse(input); } catch(e) { parsed = JSON.parse(input.replace(/'/g, '"')); }
            if(typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) state.members = parsed;
        }
        saveLocal();
    } catch(e) {}
}

/** Sincroniza o textarea duplicado da aba Admin com o state */
function syncMembersFromAdmin() {
    const adminEl = document.getElementById('set-members-admin');
    const settingsEl = document.getElementById('set-members');
    if (adminEl && settingsEl) settingsEl.value = adminEl.value;
    updateSettingsSilent();
}

function updateSettings() {
    try {
        const membersEl = document.getElementById('set-members');
        if (membersEl) {
            let input = membersEl.value.trim();
            if (input) {
                let parsed;
                try { 
                    parsed = JSON.parse(input); 
                } catch(e) { 
                    parsed = JSON.parse(input.replace(/'/g, '"')); 
                }
                if(typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error("Invalid JSON");
                state.members = parsed;
            }
        }
    } catch(e) { 
        showToast("Erro no formato da Base de Dados! Use JSON vÃ¡lido.", "error"); 
        return; 
    }

    const nameInput = document.getElementById('set-club-name');
    const courtsInput = document.getElementById('set-courts');
    const colorInput = document.getElementById('set-color');

    if (nameInput) state.settings.clubName = nameInput.value;
    if (courtsInput) state.courts = courtsInput.value.split(',').map(c => c.trim()).filter(c => c !== "");
    if (colorInput) {
        state.settings.primaryColor = colorInput.value;
        document.documentElement.style.setProperty('--primary', state.settings.primaryColor);
    }

    // Update Brand Name UI
    const brandEl = document.getElementById('brand-name');
    if (brandEl) {
        const name = state.settings.clubName;
        if (name.toLowerCase().includes('reservaquadras')) {
             brandEl.innerHTML = `Reserva<span class="text-indigo-400">Quadras</span>`;
        } else {
             brandEl.innerText = name;
        }
    }

    save(); 
    showToast("ConfiguraÃ§Ãµes salvas com sucesso!", "success"); 
    render();
}

function exportMembers() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.members, null, 4));
    const link = document.createElement('a');
    link.setAttribute("href", dataStr); link.setAttribute("download", "socios_reservaquadras.json");
    document.body.appendChild(link); link.click(); link.remove();
}

let renderRequested = false;
function render() {
    if (renderRequested) return;
    renderRequested = true;
    requestAnimationFrame(() => {
        if(state.settings.performanceMode) document.body.classList.add('performance-mode');
        else document.body.classList.remove('performance-mode');
        
        renderPublic(); renderAdmin(); renderActivity(); updateDashboard(); updateNavbarStatus();
        const clubNameEl = document.getElementById('set-club-name');
        const courtsEl = document.getElementById('set-courts');
        const colorEl = document.getElementById('set-color');
        const membersEl = document.getElementById('set-members');
        const performanceEl = document.getElementById('set-performance');
        if(clubNameEl) clubNameEl.value = state.settings.clubName;
        if(courtsEl) courtsEl.value = state.courts.join(', ');
        if(colorEl) colorEl.value = state.settings.primaryColor;
        if(membersEl) membersEl.value = JSON.stringify(state.members, null, 4);
        if(performanceEl) performanceEl.checked = state.settings.performanceMode;
        renderRequested = false;
    });
}

function togglePerformanceMode() {
    state.settings.performanceMode = document.getElementById('set-performance').checked;
    save();
    showToast(state.settings.performanceMode ? "Modo Performance Ativado! Recarregue se necessÃ¡rio." : "Modo Visual Ativado!", "info");
    
    const canvas = document.getElementById('tennis-canvas');
    const glass = document.getElementById('glass-overlay');
    
    if (state.settings.performanceMode) {
        document.body.classList.add('performance-mode');
        if (canvas) canvas.style.display = 'none';
        if (glass) glass.style.display = 'none';
    } else {
        document.body.classList.remove('performance-mode');
        if (state.currentView === 'public') {
            if (canvas) canvas.style.display = 'block';
            if (glass) glass.style.display = 'block';
        }
    }
    render();
}

function updateDashboard() {
    const todayStr = getTodayDate();
    const todayHistory = state.history.filter(h => h.date === todayStr);
    const todayWithdrawals = state.withdrawals.filter(w => w.withdrawnDate === todayStr);
    const occupied = state.bookings.filter(b => !b.type || b.type === 'lesson').length;
    const wait = state.waitlist.length;
    const total = todayHistory.length;
    const withdrawals = todayWithdrawals.length;
    
    const avgPlay = todayHistory.length > 0 ? Math.round(todayHistory.reduce((acc, curr) => acc + (curr.playDuration || 0), 0) / todayHistory.length) : 0;
    const avgWait = todayHistory.length > 0 ? Math.round(todayHistory.reduce((acc, curr) => acc + (curr.waitDuration || 0), 0) / todayHistory.length) : 0;
    const totalMinToday = todayHistory.reduce((acc, curr) => acc + (curr.playDuration || 0), 0);
    
    const setElText = (id, text) => { const el = document.getElementById(id); if(el) el.innerText = text; };

    setElText('stat-occupied', occupied);
    setElText('stat-wait', wait);
    setElText('stat-total', total);
    setElText('stat-withdrawals', withdrawals);
    setElText('stat-avg', avgPlay > 0 ? `${avgPlay}m` : "--");
    setElText('stat-total-min', totalMinToday > 0 ? `${totalMinToday}m` : "--");
    setElText('stat-avg-wait', avgWait > 0 ? `${avgWait}m` : "--");
    
    const lessonsToday = todayHistory.filter(h => h.activity && (h.activity.toLowerCase().includes('aula') || h.activity.toLowerCase() === 'aula'));
    const batebolaToday = todayHistory.filter(h => h.activity && h.activity.toLowerCase().includes('bate'));
    const gamesToday = todayHistory.filter(h => h.activity && (h.activity.toLowerCase().includes('simples') || h.activity.toLowerCase().includes('dupla')));
    const rankingToday = todayHistory.filter(h => h.activity && h.activity.toLowerCase().includes('ranking'));
    
    setElText('stat-lessons-today', lessonsToday.length);
    setElText('stat-batebola-today', batebolaToday.length);
    setElText('stat-games-today', gamesToday.length);
    setElText('stat-ranking-today', rankingToday.length);
    
    const lessonsMin = lessonsToday.reduce((acc, curr) => acc + (curr.playDuration || 0), 0);
    const batebolaMin = batebolaToday.reduce((acc, curr) => acc + (curr.playDuration || 0), 0);
    const gamesMin = gamesToday.reduce((acc, curr) => acc + (curr.playDuration || 0), 0);
    const rankingMin = rankingToday.reduce((acc, curr) => acc + (curr.playDuration || 0), 0);
    
    setElText('stat-lessons-min', lessonsMin > 0 ? `${lessonsMin} min` : "-- min");
    setElText('stat-batebola-min', batebolaMin > 0 ? `${batebolaMin} min` : "-- min");
    setElText('stat-games-min', gamesMin > 0 ? `${gamesMin} min` : "-- min");
    setElText('stat-ranking-min', rankingMin > 0 ? `${rankingMin} min` : "-- min");
    
    const playerCounts = {}; todayHistory.forEach(h => h.players.forEach(p => playerCounts[p] = (playerCounts[p] || 0) + 1));
    const topPlayer = Object.entries(playerCounts).sort((a,b) => b[1] - a[1])[0];
    setElText('stat-top-player', topPlayer ? topPlayer[0] : "--");
    
    const courtCounts = {}; todayHistory.forEach(h => courtCounts[h.court] = (courtCounts[h.court] || 0) + (h.playDuration || 0));
    const topCourt = Object.entries(courtCounts).sort((a,b) => b[1] - a[1])[0];
    setElText('stat-top-court', topCourt ? topCourt[0] : "--");
    setElText('stat-top-court-count', topCourt ? `${topCourt[1]} min` : "0 min");
    
    const hourCounts = {}; todayHistory.forEach(h => { const hour = h.startTime ? h.startTime.split(':')[0] : null; if(hour) hourCounts[hour] = (hourCounts[hour] || 0) + 1; });
    const peakHour = Object.entries(hourCounts).sort((a,b) => b[1] - a[1])[0];
    setElText('stat-peak-hour', peakHour ? `${peakHour[0]}:00` : "--");
    setElText('stat-peak-count', peakHour ? `${peakHour[1]} entradas` : "0 entradas");
    
    const activities = {}; todayHistory.forEach(h => activities[h.activity] = (activities[h.activity] || 0) + 1);
    const totalActs = Object.values(activities).reduce((a,b) => a+b, 0);
    const distContainer = document.getElementById('stat-activity-distribution');
    const legendContainer = document.getElementById('stat-activity-legend');
    if(distContainer && legendContainer) {
        distContainer.innerHTML = ''; legendContainer.innerHTML = '';
        const colors = ['bg-indigo-500', 'bg-purple-500', 'bg-emerald-500', 'bg-amber-500', 'bg-blue-500', 'bg-rose-500'];
        Object.entries(activities).forEach(([act, count], i) => {
            const pct = (count / totalActs) * 100; const color = colors[i % colors.length];
            distContainer.innerHTML += `<div class="${color}" style="width: ${pct}%" title="${act}: ${count}"></div>`;
            legendContainer.innerHTML += `<div class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full ${color}"></span><span>${act} (${Math.round(pct)}%)</span></div>`;
        });
    }
    
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 28 * 24 * 60 * 60 * 1000);
    const analytics = calculateOccupancyAnalytics(startDate, endDate);
    
    setElText('occ-avg-rate', analytics.overall.averageOccupancyRate.toFixed(1) + '%');
    setElText('occ-lessons-kpi', analytics.activityData.lessonsRate.toFixed(1) + '%');
    setElText('occ-morning-rate', analytics.overall.averageByPeriod.morning.toFixed(1) + '%');
    setElText('occ-afternoon-rate', analytics.overall.averageByPeriod.afternoon.toFixed(1) + '%');
    setElText('occ-evening-rate', analytics.overall.averageByPeriod.evening.toFixed(1) + '%');
    setElText('occ-lessons-hours', formatHours(analytics.activityData.lessons.totalMinutes));
    setElText('occ-lessons-rate', analytics.activityData.lessonsRate.toFixed(1) + '%');
    setElText('occ-other-hours', formatHours(analytics.activityData.other.totalMinutes));
    setElText('occ-other-rate', analytics.activityData.otherRate.toFixed(1) + '%');
    
    const lessonsOccupancyContainer = document.getElementById('lessons-occupancy-by-court');
    if(lessonsOccupancyContainer) {
        lessonsOccupancyContainer.innerHTML = '';
        const getColor = (rate) => {
            if(rate < 15) return 'bg-emerald-500/50';
            if(rate < 25) return 'bg-emerald-500';
            if(rate < 50) return 'bg-yellow-500';
            if(rate < 75) return 'bg-orange-500';
            return 'bg-red-500';
        };
        
        analytics.courts.forEach(court => {
            if (court.totalLessonMinutes > 0) {
                lessonsOccupancyContainer.innerHTML += `
                    <div class="space-y-2 bg-white/5 p-4 rounded-2xl border border-white/5">
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-white text-sm">${court.courtName}</span>
                            <span class="text-xs text-emerald-400 font-bold">${formatHours(court.totalLessonMinutes)} em aulas</span>
                        </div>
                        <div class="flex gap-2">
                            <div class="flex-1">
                                <div class="flex justify-between text-[10px] text-gray-500 mb-1">
                                    <span>ManhÃ£</span>
                                    <span>${court.lessonPeriods.morning.occupancyRate.toFixed(1)}%</span>
                                </div>
                                <div class="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                    <div class="${getColor(court.lessonPeriods.morning.occupancyRate)} h-full" style="width: ${Math.min(court.lessonPeriods.morning.occupancyRate, 100)}%"></div>
                                </div>
                            </div>
                            <div class="flex-1">
                                <div class="flex justify-between text-[10px] text-gray-500 mb-1">
                                    <span>Tarde</span>
                                    <span>${court.lessonPeriods.afternoon.occupancyRate.toFixed(1)}%</span>
                                </div>
                                <div class="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                    <div class="${getColor(court.lessonPeriods.afternoon.occupancyRate)} h-full" style="width: ${Math.min(court.lessonPeriods.afternoon.occupancyRate, 100)}%"></div>
                                </div>
                            </div>
                            <div class="flex-1">
                                <div class="flex justify-between text-[10px] text-gray-500 mb-1">
                                    <span>Noite</span>
                                    <span>${court.lessonPeriods.evening.occupancyRate.toFixed(1)}%</span>
                                </div>
                                <div class="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                    <div class="${getColor(court.lessonPeriods.evening.occupancyRate)} h-full" style="width: ${Math.min(court.lessonPeriods.evening.occupancyRate, 100)}%"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        });
    }
    
    const occupancyContainer = document.getElementById('occupancy-by-court');
    if(occupancyContainer) {
        occupancyContainer.innerHTML = '';
        const getColor = (rate) => {
            if(rate < 25) return 'bg-emerald-500';
            if(rate < 50) return 'bg-yellow-500';
            if(rate < 75) return 'bg-orange-500';
            return 'bg-red-500';
        };
        
        analytics.courts.forEach(court => {
            occupancyContainer.innerHTML += `
                <div class="space-y-2">
                    <div class="flex items-center justify-between">
                        <span class="font-bold text-white text-sm">${court.courtName}</span>
                        <span class="text-xs text-gray-400">${formatHours(court.totalPlayMinutes)}</span>
                    </div>
                    <div class="flex gap-2">
                        <div class="flex-1">
                            <div class="flex justify-between text-xs text-gray-500 mb-1">
                                <span>ManhÃ£</span>
                                <span>${court.periods.morning.occupancyRate.toFixed(1)}%</span>
                            </div>
                            <div class="h-2 bg-white/5 rounded-full overflow-hidden">
                                <div class="${getColor(court.periods.morning.occupancyRate)} h-full" style="width: ${Math.min(court.periods.morning.occupancyRate, 100)}%"></div>
                            </div>
                        </div>
                        <div class="flex-1">
                            <div class="flex justify-between text-xs text-gray-500 mb-1">
                                <span>Tarde</span>
                                <span>${court.periods.afternoon.occupancyRate.toFixed(1)}%</span>
                            </div>
                            <div class="h-2 bg-white/5 rounded-full overflow-hidden">
                                <div class="${getColor(court.periods.afternoon.occupancyRate)} h-full" style="width: ${Math.min(court.periods.afternoon.occupancyRate, 100)}%"></div>
                            </div>
                        </div>
                        <div class="flex-1">
                            <div class="flex justify-between text-xs text-gray-500 mb-1">
                                <span>Noite</span>
                                <span>${court.periods.evening.occupancyRate.toFixed(1)}%</span>
                            </div>
                            <div class="h-2 bg-white/5 rounded-full overflow-hidden">
                                <div class="${getColor(court.periods.evening.occupancyRate)} h-full" style="width: ${Math.min(court.periods.evening.occupancyRate, 100)}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    
    const activityOccupancyContainer = document.getElementById('occupancy-by-activity');
    if(activityOccupancyContainer) {
        activityOccupancyContainer.innerHTML = '';
        const activityColors = {
            'Aula': 'bg-emerald-500',
            'Bate-bola': 'bg-indigo-500',
            'Simples': 'bg-purple-500',
            'Dupla': 'bg-purple-500',
            'Ranking infantil': 'bg-amber-500',
            'Ranking adulto': 'bg-amber-500'
        };
        
        Object.entries(analytics.activityData.byType)
            .sort((a, b) => b[1].totalMinutes - a[1].totalMinutes)
            .forEach(([activity, data]) => {
                const color = activityColors[activity] || 'bg-blue-500';
                const pct = analytics.overall.totalPlayMinutes > 0 
                    ? (data.totalMinutes / analytics.overall.totalPlayMinutes) * 100 
                    : 0;
                
                activityOccupancyContainer.innerHTML += `
                    <div class="space-y-2">
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-white text-sm">${activity}</span>
                            <div class="flex items-center gap-3">
                                <span class="text-xs text-gray-400">${data.count}x</span>
                                <span class="text-xs text-gray-400">${formatHours(data.totalMinutes)}</span>
                            </div>
                        </div>
                        <div class="h-3 bg-white/5 rounded-full overflow-hidden">
                            <div class="${color} h-full" style="width: ${Math.min(pct, 100)}%"></div>
                        </div>
                    </div>
                `;
            });
    }

    if (typeof updateDashboardExtra === 'function') {
        updateDashboardExtra();
    }
}

// exportDashboardData: versÃ£o aprimorada G.2 declarada abaixo.
// exportWithdrawals: versÃ£o aprimorada G.5 declarada abaixo.

function exportFullSystemData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 4));
    const link = document.createElement('a');
    link.setAttribute("href", dataStr); link.setAttribute("download", `backup_sistema_quadras_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link); link.click(); link.remove();
    showToast("Backup do sistema concluÃ­do!", "success");
}

const PERIODS = {
    morning: { name: "ManhÃ£", startHour: 6, startMinute: 30, endHour: 12, endMinute: 30, totalMinutes: 360 },
    afternoon: { name: "Tarde", startHour: 12, startMinute: 31, endHour: 18, endMinute: 30, totalMinutes: 360 },
    evening: { name: "Noite", startHour: 18, startMinute: 31, endHour: 22, endMinute: 0, totalMinutes: 210 }
};

function calculateOverlapMinutes(start1, end1, start2, end2) {
    const overlapStart = Math.max(start1, start2);
    const overlapEnd = Math.min(end1, end2);
    return overlapStart < overlapEnd ? Math.round((overlapEnd - overlapStart) / 60000) : 0;
}

function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function calculateOccupancyAnalytics(startDate, endDate) {
    const courtData = {};
    const hourlyUsage = {};
    const activityData = {
        lessons: { totalMinutes: 0, count: 0 },
        other: { totalMinutes: 0, count: 0 },
        byType: {}
    };
    
    state.courts.forEach(court => {
        courtData[court] = {
            courtName: court,
            totalPlayMinutes: 0,
            totalLessonMinutes: 0,
            periods: {
                morning: { occupiedMinutes: 0, occupancyRate: 0 },
                afternoon: { occupiedMinutes: 0, occupancyRate: 0 },
                evening: { occupiedMinutes: 0, occupancyRate: 0 }
            },
            lessonPeriods: {
                morning: { occupiedMinutes: 0, occupancyRate: 0 },
                afternoon: { occupiedMinutes: 0, occupancyRate: 0 },
                evening: { occupiedMinutes: 0, occupancyRate: 0 }
            }
        };
    });
    
    for (let hour = 0; hour < 24; hour++) {
        hourlyUsage[hour] = {};
        state.courts.forEach(court => {
            hourlyUsage[hour][court] = 0;
        });
    }
    
    const relevantHistory = state.history.filter(h => {
        if (!h.date) return false;
        const [d, m, y] = h.date.split('/').map(Number);
        const histDate = new Date(y, m - 1, d);
        return histDate >= startDate && histDate <= endDate;
    });
    
    const daysInRange = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    
    relevantHistory.forEach(h => {
        if (!h.court || !courtData[h.court]) return;
        
        const court = h.court;
        const activity = h.activity || 'Outro';
        const startMin = timeToMinutes(h.startTime);
        const endMin = timeToMinutes(h.endTime) || startMin + 60;
        
        if (startMin === 0 && endMin === 0) return;
        
        const totalMinutes = endMin - startMin;
        if (totalMinutes > 0) {
            courtData[court].totalPlayMinutes += totalMinutes;
            const isLesson = activity.toLowerCase().includes('aula') || activity.toLowerCase() === 'aula';
            
            if (isLesson) {
                activityData.lessons.totalMinutes += totalMinutes;
                activityData.lessons.count++;
                courtData[court].totalLessonMinutes += totalMinutes;
            } else {
                activityData.other.totalMinutes += totalMinutes;
                activityData.other.count++;
            }
            
            if (!activityData.byType[activity]) {
                activityData.byType[activity] = { totalMinutes: 0, count: 0 };
            }
            activityData.byType[activity].totalMinutes += totalMinutes;
            activityData.byType[activity].count++;
            
            Object.keys(PERIODS).forEach(period => {
                const p = PERIODS[period];
                const pStart = p.startHour * 60 + p.startMinute;
                const pEnd = p.endHour * 60 + p.endMinute;
                
                const overlapStart = Math.max(startMin, pStart);
                const overlapEnd = Math.min(endMin, pEnd);
                
                if (overlapStart < overlapEnd) {
                    const overlap = (overlapEnd - overlapStart);
                    courtData[court].periods[period].occupiedMinutes += overlap;
                    if (isLesson) {
                        courtData[court].lessonPeriods[period].occupiedMinutes += overlap;
                    }
                }
            });
            
            for (let hour = Math.floor(startMin / 60); hour <= Math.floor((endMin - 1) / 60); hour++) {
                if (hour >= 0 && hour < 24) {
                    const hourStart = hour * 60;
                    const hourEnd = (hour + 1) * 60;
                    const overlap = Math.max(0, Math.min(endMin, hourEnd) - Math.max(startMin, hourStart));
                    if (overlap > 0) {
                        hourlyUsage[hour][court] += overlap;
                    }
                }
            }
        }
    });
    
    Object.values(courtData).forEach(court => {
        Object.keys(PERIODS).forEach(period => {
            const totalPeriodMinutes = PERIODS[period].totalMinutes * daysInRange;
            court.periods[period].occupancyRate = totalPeriodMinutes > 0 
                ? (court.periods[period].occupiedMinutes / totalPeriodMinutes) * 100 
                : 0;
            court.lessonPeriods[period].occupancyRate = totalPeriodMinutes > 0 
                ? (court.lessonPeriods[period].occupiedMinutes / totalPeriodMinutes) * 100 
                : 0;
        });
    });
    
    const courtsArray = Object.values(courtData);
    const totalAllMinutes = courtsArray.reduce((sum, c) => sum + c.totalPlayMinutes, 0);
    
    const averageByPeriod = { morning: 0, afternoon: 0, evening: 0 };
    Object.keys(PERIODS).forEach(period => {
        const sum = courtsArray.reduce((sum, c) => sum + c.periods[period].occupancyRate, 0);
        averageByPeriod[period] = courtsArray.length > 0 ? sum / courtsArray.length : 0;
    });
    
    const overallAverage = courtsArray.length > 0
        ? (averageByPeriod.morning + averageByPeriod.afternoon + averageByPeriod.evening) / 3
        : 0;
    
    const totalAvailableMinutes = state.courts.length * (PERIODS.morning.totalMinutes + PERIODS.afternoon.totalMinutes + PERIODS.evening.totalMinutes) * daysInRange;
    const lessonsRate = totalAvailableMinutes > 0 ? (activityData.lessons.totalMinutes / totalAvailableMinutes) * 100 : 0;
    const otherRate = totalAvailableMinutes > 0 ? (activityData.other.totalMinutes / totalAvailableMinutes) * 100 : 0;
    
    return {
        dateRange: { start: startDate, end: endDate },
        courts: courtsArray,
        overall: {
            averageOccupancyRate: overallAverage,
            averageByPeriod,
            totalPlayMinutes: totalAllMinutes
        },
        hourlyUsage,
        activityData: {
            ...activityData,
            lessonsRate,
            otherRate
        }
    };
}

function formatHours(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
}

function exportOccupancyByCourt() {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const analytics = calculateOccupancyAnalytics(startDate, endDate);
    
    if (analytics.courts.length === 0) return showToast("Nenhum dado de ocupaÃ§Ã£o para exportar!", "warning");
    
    const sep = ";";
    const headers = [
        "Quadra", 
        "Total de Jogo (min)", 
        "Total de Jogo (horas)",
        "OcupaÃ§Ã£o ManhÃ£ (%)", 
        "OcupaÃ§Ã£o Tarde (%)", 
        "OcupaÃ§Ã£o Noite (%)",
        "Minutos ManhÃ£",
        "Minutos Tarde",
        "Minutos Noite"
    ];
    
    const rows = analytics.courts.map(court => [
        court.courtName,
        court.totalPlayMinutes,
        formatHours(court.totalPlayMinutes),
        court.periods.morning.occupancyRate.toFixed(2),
        court.periods.afternoon.occupancyRate.toFixed(2),
        court.periods.evening.occupancyRate.toFixed(2),
        court.periods.morning.occupiedMinutes,
        court.periods.afternoon.occupiedMinutes,
        court.periods.evening.occupiedMinutes
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(sep)).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `ocupacao_por_quadra_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Dados de ocupaÃ§Ã£o por quadra exportados!", "success");
}

function exportOccupancyHourly() {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const analytics = calculateOccupancyAnalytics(startDate, endDate);
    
    if (analytics.courts.length === 0) return showToast("Nenhum dado de ocupaÃ§Ã£o para exportar!", "warning");
    
    const sep = ";";
    const headers = ["Quadra", ...Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, "0")}h`)];
    
    const rows = analytics.courts.map(court => [
        court.courtName,
        ...Array.from({ length: 24 }, (_, hour) => analytics.hourlyUsage[hour]?.[court.courtName] || 0)
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(sep)).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `uso_por_hora_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Dados de uso por hora exportados!", "success");
}

function exportOccupancySummary() {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const analytics = calculateOccupancyAnalytics(startDate, endDate);
    
    if (analytics.courts.length === 0) return showToast("Nenhum dado de ocupaÃ§Ã£o para exportar!", "warning");
    
    const sep = ";";
    const content = [
        ["RELATÃ“RIO DE OCUPAÃ‡ÃƒO DE QUADRAS"],
        [""],
        ["PerÃ­odo Analisado", `${startDate.toLocaleDateString("pt-BR")} - ${endDate.toLocaleDateString("pt-BR")}`],
        [""],
        ["INDICADORES GERAIS"],
        ["Taxa MÃ©dia de OcupaÃ§Ã£o", `${analytics.overall.averageOccupancyRate.toFixed(2)}%`],
        ["Total de Horas de Jogo", formatHours(analytics.overall.totalPlayMinutes)],
        ["Total de Quadras", analytics.courts.length],
        [""],
        ["DADOS POR TIPO DE ATIVIDADE"],
        ["Aulas - Total de Horas", formatHours(analytics.activityData.lessons.totalMinutes)],
        ["Aulas - NÃºmero de SessÃµes", analytics.activityData.lessons.count],
        ["Aulas - Taxa de OcupaÃ§Ã£o", `${analytics.activityData.lessonsRate.toFixed(2)}%`],
        ["Outras Atividades - Total de Horas", formatHours(analytics.activityData.other.totalMinutes)],
        ["Outras Atividades - NÃºmero de SessÃµes", analytics.activityData.other.count],
        ["Outras Atividades - Taxa de OcupaÃ§Ã£o", `${analytics.activityData.otherRate.toFixed(2)}%`],
        [""],
        ["TAXA MÃ‰DIA POR PERÃODO"],
        ["ManhÃ£ (06:30-12:30)", `${analytics.overall.averageByPeriod.morning.toFixed(2)}%`],
        ["Tarde (12:31-18:30)", `${analytics.overall.averageByPeriod.afternoon.toFixed(2)}%`],
        ["Noite (18:31-22:00)", `${analytics.overall.averageByPeriod.evening.toFixed(2)}%`],
        [""],
        ["TOP 5 QUADRAS MAIS UTILIZADAS"],
        ...[...analytics.courts]
            .sort((a, b) => b.totalPlayMinutes - a.totalPlayMinutes)
            .slice(0, 5)
            .map((court, index) => [`${index + 1}. ${court.courtName}`, formatHours(court.totalPlayMinutes)])
    ];
    
    const csvContent = content.map(e => e.join(sep)).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `resumo_ocupacao_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Resumo de ocupaÃ§Ã£o exportado!", "success");
}

function exportOccupancyByActivity() {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const analytics = calculateOccupancyAnalytics(startDate, endDate);
    
    if (analytics.courts.length === 0) return showToast("Nenhum dado de ocupaÃ§Ã£o para exportar!", "warning");
    
    const sep = ";";
    const headers = [
        "Tipo de Atividade", 
        "Total de Horas", 
        "Total de Minutos",
        "NÃºmero de SessÃµes",
        "Percentual do Total (%)"
    ];
    
    const totalMinutes = analytics.overall.totalPlayMinutes;
    const rows = Object.entries(analytics.activityData.byType)
        .sort((a, b) => b[1].totalMinutes - a[1].totalMinutes)
        .map(([activity, data]) => [
            activity,
            formatHours(data.totalMinutes),
            data.totalMinutes,
            data.count,
            totalMinutes > 0 ? ((data.totalMinutes / totalMinutes) * 100).toFixed(2) : "0.00"
        ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(sep)).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `ocupacao_por_atividade_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Dados de ocupaÃ§Ã£o por atividade exportados!", "success");
}

// exportOccupancyComplete: versÃ£o aprimorada G.4 declarada abaixo.

function importFullSystemData(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedState = JSON.parse(e.target.result);
            if (confirm("Isso irÃ¡ substituir TODOS os dados atuais. Deseja continuar?")) {
                state = { ...state, ...importedState }; save(); render();
                showToast("Dados restaurados com sucesso!", "success");
            }
        } catch (err) { showToast("Erro ao importar arquivo!", "error"); }
    };
    reader.readAsText(file);
}

function updateNavbarStatus() {
    const container = document.getElementById('navbar-court-status');
    if(!container) return;
    container.innerHTML = state.courts.map(c => {
        const b = state.bookings.find(book => book.court === c);
        let color = "bg-emerald-500";
        if(b) {
            if(b.type === 'rain') color = "bg-blue-500";
            else if(b.type === 'blocked') color = "bg-red-500";
            else if(b.type === 'lesson' || b.type === 'tournament') color = "bg-amber-500";
            else color = "bg-indigo-500";
        }
        return `<div title="${c}" class="w-2.5 h-2.5 rounded-full ${color} shadow-lg"></div>`;
    }).join('');
}

function renderPublic() {
    const grid = document.getElementById('public-grid');
    if(!grid) return;
    grid.innerHTML = state.courts.map(c => {
        const b = state.bookings.find(book => book.court === c);
        let bgClass = "bg-white/5", statusLabel = "LIVRE", players = "Pronta para uso", statusColor = "bg-emerald-500/10 text-emerald-400";
        
        if(b) {
            if(b.type === 'blocked') { bgClass = "status-blocked"; statusLabel = "BLOQUEADA"; players = "MANUTENÃ‡ÃƒO"; statusColor = "bg-white/20 text-white"; }
            else if(b.type === 'lesson') { bgClass = "status-lesson"; statusLabel = "AULA"; players = "QUADRA EM AULA"; statusColor = "bg-white/20 text-white"; }
            else if(b.type === 'rain') { bgClass = "status-rain"; statusLabel = "CHUVA"; players = "QUADRA MOLHADA"; statusColor = "bg-white/20 text-white"; }
            else if(b.type === 'tournament') { bgClass = "status-tournament"; statusLabel = "TORNEIO"; players = "COMPETIÃ‡ÃƒO ATIVA"; statusColor = "bg-white/20 text-white"; }
            else { bgClass = "bg-indigo-500/10"; statusLabel = "OCUPADA"; players = b.players.map(p => `<div class="truncate border-b border-white/5 pb-1 last:border-0">${p}</div>`).join(''); statusColor = "bg-indigo-500/20 text-indigo-300"; }
        }
        
        return `
            <div class="glass-card p-6 rounded-2xl flex flex-col justify-between relative overflow-hidden ${b ? 'border-indigo-500/20' : 'border-white/5'} ${bgClass} shadow-lg">
                <div class="flex justify-between items-center mb-4">
                    <h4 class="text-xl font-bold text-white">${c}</h4>
                    <span class="px-3 py-1 rounded-lg text-[10px] font-bold tracking-widest uppercase ${statusColor}">${statusLabel}</span>
                </div>
                
                <div class="flex-1 flex flex-col justify-center my-4 overflow-hidden">
                    <div class="mb-4">
                        <span class="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold text-gray-300 uppercase tracking-widest inline-flex items-center">
                            <i class="fas fa-play-circle mr-2 text-indigo-400"></i>
                            ${b && !b.type ? b.activity : 'Status'}
                        </span>
                    </div>
                    <div class="text-lg font-bold text-white leading-tight space-y-1">${players}</div>
                </div>
                
                <div class="mt-auto">
                    ${b && !b.type ? `
                        <div class="flex justify-between items-center border-t border-white/10 pt-4 mt-2">
                            <div class="flex flex-col">
                                <p class="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">InÃ­cio</p>
                                <p class="text-2xl font-bold text-emerald-400 tracking-tight">${b.startTime || '--:--'}</p>
                            </div>
                            ${b.endTime ? `
                                <div class="text-right">
                                    <p class="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">PrevisÃ£o</p>
                                    <p class="text-base font-bold text-purple-400 opacity-90">${b.endTime}</p>
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}
                    ${b && b.observation ? `<p class="text-xs font-medium text-gray-300 border-l-2 border-indigo-400 pl-3 py-1 bg-white/5 rounded-r-lg italic mt-3">${b.observation}</p>` : ''}
                    ${!b ? '<div class="h-1 bg-emerald-500/10 rounded-full overflow-hidden mt-4"><div class="w-full h-full bg-emerald-400/50"></div></div>' : ''}
                </div>
            </div>`;
    }).join('');
    
    const wait = document.getElementById('public-waitlist');
    if(!wait) return;
    wait.className = "responsive-grid"; 
    wait.innerHTML = state.waitlist.map((item, i) => `
        <div class="glass-card p-5 rounded-2xl bg-white/5 border-white/10 flex flex-col justify-between min-h-[160px]">
            <div class="flex justify-between items-start mb-4">
                <span class="px-2 py-1 bg-indigo-500/20 text-indigo-300 text-[10px] font-bold rounded uppercase tracking-widest">Grupo ${i+1}</span>
                <span class="text-[10px] font-medium text-gray-500">${item.registrationTime}</span>
            </div>
            <div class="flex-1 mb-4">
                <p class="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Jogadores</p>
                <div class="text-sm font-bold text-white leading-tight space-y-1">
                    ${item.players.map(p => `<div class="truncate border-b border-white/5 pb-0.5 last:border-0">${p}</div>`).join('')}
                </div>
            </div>
            <div class="pt-3 border-t border-white/5">
                <p class="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">${item.activity}</p>
            </div>
        </div>`).join('') || '<div class="col-span-full"><p class="text-center text-gray-500 font-medium py-12 text-lg uppercase tracking-widest opacity-40">Fila de Espera Vazia</p></div>';
}

// ============================================================
// ABA PÃšBLICO â€” Sub-tabs: Status | AnÃ¡lise
// ============================================================

let currentAnalyticsPeriod = 'rolling';
window.renderPublicAnalytics = renderPublicAnalytics;
window.changeAnalyticsPeriod = changeAnalyticsPeriod;

function switchPublicTab(tab) {
    const panelStatus = document.getElementById('pub-panel-status');
    const panelAnalytics = document.getElementById('pub-panel-analytics');
    const btnStatus = document.getElementById('pub-tab-status');
    const btnAnalytics = document.getElementById('pub-tab-analytics');
    if (!panelStatus || !panelAnalytics) return;

    if (tab === 'status') {
        panelStatus.classList.remove('hidden');
        panelAnalytics.classList.add('hidden');
        if (btnStatus) {
            btnStatus.classList.add('bg-indigo-600','text-white','shadow-lg');
            btnStatus.classList.remove('text-gray-400','hover:text-white','hover:bg-white/5');
        }
        if (btnAnalytics) {
            btnAnalytics.classList.remove('bg-indigo-600','text-white','shadow-lg');
            btnAnalytics.classList.add('text-gray-400','hover:text-white','hover:bg-white/5');
        }
    } else {
        panelStatus.classList.add('hidden');
        panelAnalytics.classList.remove('hidden');
        if (btnAnalytics) {
            btnAnalytics.classList.add('bg-indigo-600','text-white','shadow-lg');
            btnAnalytics.classList.remove('text-gray-400','hover:text-white','hover:bg-white/5');
        }
        if (btnStatus) {
            btnStatus.classList.remove('bg-indigo-600','text-white','shadow-lg');
            btnStatus.classList.add('text-gray-400','hover:text-white','hover:bg-white/5');
        }
        renderPublicAnalytics();
    }
}

function changeAnalyticsPeriod(period) {
    currentAnalyticsPeriod = period;
    
    // Atualizar botÃµes
    const btnDay = document.getElementById('btn-period-day');
    const btnWeek = document.getElementById('btn-period-week');
    const btnRolling = document.getElementById('btn-period-rolling');
    
    [btnDay, btnWeek, btnRolling].forEach(btn => {
        if (btn) {
            btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-lg');
            btn.classList.add('text-gray-400');
        }
    });
    
    const activeBtn = document.getElementById(`btn-period-${period}`);
    if (activeBtn) {
        activeBtn.classList.remove('text-gray-400');
        activeBtn.classList.add('bg-indigo-600', 'text-white', 'shadow-lg');
    }
    
    // Atualizar legenda
    const subtitle = document.getElementById('pub-analytics-subtitle');
    const labelTotal = document.getElementById('pub-label-total');
    const labelHours = document.getElementById('pub-label-hours');
    const labelBusiest = document.getElementById('pub-label-busiest');
    const labelCourtOcc = document.getElementById('pub-court-occ-label');

    if (subtitle) {
        const labels = { 
            'day': 'Hoje', 'week': 'Ãšltimos 7 dias', 'rolling': 'Ãšltimos 28 dias' };
        subtitle.innerText = `Dados: ${labels[period]} â€” transparÃªncia para os sÃ³cios`;
        
        if (labelTotal) labelTotal.innerText = period === 'day' ? 'Jogos Hoje' : (period === 'week' ? 'Jogos na Semana' : 'Jogos nos Ãšltimos 28 dias');
        if (labelHours) labelHours.innerText = period === 'day' ? 'Horas Hoje' : (period === 'week' ? 'Horas na Semana' : 'Horas nos Ãšltimos 28 dias');
        if (labelBusiest) labelBusiest.innerText = period === 'day' ? 'HorÃ¡rio de Pico' : 'Dia Mais Movido';
        if (labelCourtOcc) labelCourtOcc.innerText = labels[period];
    }
    
    renderPublicAnalytics();
}

function renderPublicAnalytics() {
    let analytics;
    let startDate, endDate;
    
    if (currentAnalyticsPeriod === 'rolling') {
        analytics = calculateRollingOccupancyAnalytics();
        startDate = analytics.dateRange.start;
        endDate = analytics.dateRange.end;
    } else {
        endDate = new Date();
        
        if (currentAnalyticsPeriod === 'day') {
            startDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        } else if (currentAnalyticsPeriod === 'week') {
            startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else {
            startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        }
        analytics = calculateOccupancyAnalytics(startDate, endDate);
    }

    // FunÃ§Ã£o de cor de barra
    const barColor = (rate) => {
        if (rate < 25) return 'bg-emerald-500';
        if (rate < 50) return 'bg-yellow-500';
        if (rate < 75) return 'bg-orange-500';
        return 'bg-red-500';
    };
    const barColorHex = (rate) => {
        if (rate < 25) return '#10b981';
        if (rate < 50) return '#eab308';
        if (rate < 75) return '#f97316';
        return '#ef4444';
    };

    // ---- KPIs ----
    const totalGames = state.history.filter(h => {
        if (!h.date) return false;
        const histDate = parseDate(h.date);
        return histDate && histDate >= startDate && histDate <= endDate;
    }).length;

    const totalHours = Math.round(analytics.overall.totalPlayMinutes / 60);
    const avgOcc = analytics.overall.averageOccupancyRate;

    const elGames = document.getElementById('pub-stat-total-month');
    const elHours = document.getElementById('pub-stat-hours-month');
    const elOcc = document.getElementById('pub-stat-occ-rate');
    if (elGames) elGames.innerText = totalGames;
    if (elHours) elHours.innerText = totalHours + 'h';
    if (elOcc) elOcc.innerText = avgOcc.toFixed(1) + '%';

    // Dia mais movido ou HorÃ¡rio de Pico
    const elDay = document.getElementById('pub-stat-busiest-day');
    const elDayCount = document.getElementById('pub-stat-busiest-day-count');

    if (currentAnalyticsPeriod === 'day') {
        const hourlyCounts = Array(24).fill(0);
        state.history.forEach(h => {
            if (!h.date) return;
            const dt = parseDate(h.date);
            const today = new Date();
            if (dt && dt.getDate() === today.getDate() && dt.getMonth() === today.getMonth() && dt.getFullYear() === today.getFullYear()) {
                const startMin = timeToMinutes(h.startTime);
                const hour = Math.floor(startMin / 60);
                if (hour >= 0 && hour < 24) hourlyCounts[hour]++;
            }
        });
        const peakHour = hourlyCounts.indexOf(Math.max(...hourlyCounts));
        const peakCount = Math.max(...hourlyCounts);
        if (elDay) elDay.innerText = peakHour !== -1 && peakCount > 0 ? `${peakHour}:00` : '--';
        if (elDayCount) elDayCount.innerText = peakCount > 0 ? `${peakCount} entradas` : '-- atividades';
    } else {
        const diasNome = ["Domingo","Segunda","TerÃ§a","Quarta","Quinta","Sexta","SÃ¡bado"];
        const byWd = [0,1,2,3,4,5,6].map(wd => ({ name: diasNome[wd], count: 0 }));
        state.history.forEach(h => {
            if (!h.date) return;
            const dt = parseDate(h.date);
            if (dt && dt >= startDate && dt <= endDate) byWd[dt.getDay()].count++;
        });
        const busiest = byWd.reduce((a, b) => b.count > a.count ? b : a, byWd[0]);
        if (elDay) elDay.innerText = busiest.name;
        if (elDayCount) elDayCount.innerText = busiest.count + ' atividades';
    }

    // ---- OcupaÃ§Ã£o por quadra ----
    const courtContainer = document.getElementById('pub-court-occ');
    if (courtContainer) {
        courtContainer.innerHTML = '';
        analytics.courts.forEach(court => {
            const avgRate = (court.periods.morning.occupancyRate + court.periods.afternoon.occupancyRate + court.periods.evening.occupancyRate) / 3;
            const color = barColor(avgRate);
            courtContainer.innerHTML += `
                <div class="space-y-3">
                    <div class="flex items-center justify-between">
                        <span class="font-bold text-white text-sm">${court.courtName}</span>
                        <div class="flex items-center gap-3">
                            <span class="text-xs text-gray-400">${formatHours(court.totalPlayMinutes)} usadas</span>
                            <span class="text-xs font-bold" style="color:${barColorHex(avgRate)}">${avgRate.toFixed(1)}%</span>
                        </div>
                    </div>
                    <div class="h-3 bg-white/5 rounded-full overflow-hidden">
                        <div class="${color} h-full transition-all duration-700 rounded-full" style="width:${Math.min(avgRate,100)}%"></div>
                    </div>
                    <div class="flex gap-4 text-[10px] text-gray-500">
                        <span>ManhÃ£: ${court.periods.morning.occupancyRate.toFixed(0)}%</span>
                        <span>Tarde: ${court.periods.afternoon.occupancyRate.toFixed(0)}%</span>
                        <span>Noite: ${court.periods.evening.occupancyRate.toFixed(0)}%</span>
                    </div>
                </div>
            `;
        });
        if (analytics.courts.length === 0) {
            courtContainer.innerHTML = '<p class="text-center text-gray-500 py-6 text-sm">Nenhum dado disponÃ­vel ainda.</p>';
        }
    }

    // ---- PerÃ­odo (ManhÃ£/Tarde/Noite) ----
    const periodContainer = document.getElementById('pub-period-bars');
    if (periodContainer) {
        const daysInRange = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        const periods = [
            { name: 'ManhÃ£', key: 'morning', icon: 'fa-sun', color: 'text-amber-400', bg: 'bg-amber-500' },
            { name: 'Tarde', key: 'afternoon', icon: 'fa-cloud-sun', color: 'text-orange-400', bg: 'bg-orange-500' },
            { name: 'Noite', key: 'evening', icon: 'fa-moon', color: 'text-indigo-400', bg: 'bg-indigo-500' }
        ];
        periodContainer.innerHTML = '';
        periods.forEach(p => {
            const totalMins = PERIODS[p.key].totalMinutes * daysInRange * analytics.courts.length;
            const occupied = analytics.courts.reduce((sum, c) => sum + c.periods[p.key].occupiedMinutes, 0);
            const rate = totalMins > 0 ? (occupied / totalMins) * 100 : 0;
            periodContainer.innerHTML += `
                <div class="glass-card p-5 rounded-2xl space-y-3 text-center">
                    <i class="fas ${p.icon} ${p.color} text-2xl"></i>
                    <p class="font-bold text-white text-sm">${p.name}</p>
                    <p class="text-[10px] text-gray-500 font-bold">${PERIODS[p.key].name === 'ManhÃ£' ? '06:30-12:30' : PERIODS[p.key].name === 'Tarde' ? '12:31-18:30' : '18:31-22:00'}</p>
                    <div class="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div class="${p.bg} h-full rounded-full" style="width:${Math.min(rate,100)}%"></div>
                    </div>
                    <p class="${p.color} font-bold text-xl">${rate.toFixed(1)}%</p>
                    <p class="text-[10px] text-gray-500">${formatHours(occupied)} utilizadas</p>
                </div>
            `;
        });
    }

    // ---- Mix de Atividades ----
    const actBar = document.getElementById('pub-activity-bar');
    const actBreakdown = document.getElementById('pub-activity-breakdown');
    const actColors = ['#6366f1','#10b981','#f59e0b','#a855f7','#3b82f6','#ef4444'];
    const sortedActivities = Object.entries(analytics.activityData.byType).sort((a,b) => b[1].totalMinutes - a[1].totalMinutes);
    const totalMins = analytics.overall.totalPlayMinutes;
    if (actBar && actBreakdown) {
        if (sortedActivities.length === 0) {
            actBar.innerHTML = '<div class="w-full h-full bg-white/10 rounded-full"></div>';
            actBreakdown.innerHTML = '<p class="text-center text-gray-500 text-sm py-4">Nenhum dado disponÃ­vel.</p>';
        } else {
            actBar.innerHTML = sortedActivities.map(([act, data], i) => {
                const pct = totalMins > 0 ? (data.totalMinutes / totalMins) * 100 : 0;
                const col = actColors[i % actColors.length];
                return `<div title="${act}: ${pct.toFixed(1)}%" style="width:${pct}%;background:${col}" class="h-full first:rounded-l-full last:rounded-r-full"></div>`;
            }).join('');

            actBreakdown.innerHTML = sortedActivities.map(([act, data], i) => {
                const pct = totalMins > 0 ? (data.totalMinutes / totalMins) * 100 : 0;
                const col = actColors[i % actColors.length];
                return `
                    <div class="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                        <div class="flex items-center gap-3">
                            <span class="w-3 h-3 rounded-full shrink-0" style="background:${col}"></span>
                            <span class="font-bold text-white text-sm">${act}</span>
                        </div>
                        <div class="flex items-center gap-4 text-xs text-gray-400">
                            <span>${data.count}x</span>
                            <span>${formatHours(data.totalMinutes)}</span>
                            <span class="font-bold" style="color:${col}">${pct.toFixed(1)}%</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // ---- Barras por dia da semana ou por hora ----
    const wdChart = document.getElementById('pub-weekday-chart');
    const wdTip = document.getElementById('pub-weekday-tip');
    const wdTitle = document.querySelector('#pub-panel-analytics .fa-calendar-week')?.parentElement?.querySelector('h3');
    const wdSubtitle = document.querySelector('#pub-panel-analytics .fa-calendar-week')?.parentElement?.querySelector('p');

    if (wdChart) {
        if (currentAnalyticsPeriod === 'day') {
            if (wdTitle) wdTitle.innerText = 'Atividade por Hora';
            if (wdSubtitle) wdSubtitle.innerText = 'DistribuiÃ§Ã£o de jogos ao longo do dia';
            
            const hourlyCounts = Array(24).fill(0);
            state.history.forEach(h => {
                if (!h.date) return;
                const dt = parseDate(h.date);
                if (dt && dt >= startDate && dt <= endDate) {
                    const startMin = timeToMinutes(h.startTime);
                    const hour = Math.floor(startMin / 60);
                    if (hour >= 0 && hour < 24) hourlyCounts[hour]++;
                }
            });
            
            const maxCount = Math.max(...hourlyCounts, 1);
            wdChart.innerHTML = hourlyCounts.map((count, hour) => {
                if (hour < 6 || hour > 22) return ''; // SÃ³ mostra horÃ¡rio de funcionamento
                const heightPct = (count / maxCount) * 100;
                const col = '#6366f1';
                return `
                    <div class="flex-1 flex flex-col items-center gap-1.5">
                        <span class="text-[8px] font-bold" style="color:${col}">${count > 0 ? count : ''}</span>
                        <div class="w-full bg-white/5 rounded-t-lg overflow-hidden relative" style="height:96px">
                            <div class="absolute bottom-0 left-0 right-0 rounded-t-lg transition-all duration-700" style="height:${heightPct}%;background:${col}40;border-top:2px solid ${col}"></div>
                        </div>
                        <span class="text-[8px] font-bold text-gray-400">${hour}h</span>
                    </div>
                `;
            }).join('');
            
            if (wdTip) {
                const peakHour = hourlyCounts.indexOf(Math.max(...hourlyCounts));
                wdTip.innerText = Math.max(...hourlyCounts) > 0
                    ? `ðŸ“… O horÃ¡rio de pico foi Ã s ${peakHour}:00 com ${Math.max(...hourlyCounts)} atividades.`
                    : 'ðŸ“… Nenhuma atividade registrada no perÃ­odo.';
            }
        } else {
            if (wdTitle) wdTitle.innerText = 'Atividade por Dia da Semana';
            if (wdSubtitle) wdSubtitle.innerText = 'Qual dia tem mais jogos';
            
            const diasNome = ["Domingo","Segunda","TerÃ§a","Quarta","Quinta","Sexta","SÃ¡bado"];
            const byWd = [0,1,2,3,4,5,6].map(wd => ({ name: diasNome[wd], count: 0 }));
            state.history.forEach(h => {
                if (!h.date) return;
                const dt = parseDate(h.date);
                if (dt && dt >= startDate && dt <= endDate) byWd[dt.getDay()].count++;
            });
            const busiest = byWd.reduce((a, b) => b.count > a.count ? b : a, byWd[0]);

            const maxCount = Math.max(...byWd.map(d => d.count), 1);
            const daysShort = ["Dom","Seg","Ter","Qua","Qui","Sex","SÃ¡b"];
            const dayColors = ['#6366f1','#10b981','#10b981','#10b981','#10b981','#f59e0b','#6366f1'];
            wdChart.innerHTML = byWd.map((wd, i) => {
                const heightPct = (wd.count / maxCount) * 100;
                const col = wd.name === busiest.name ? '#f59e0b' : dayColors[i];
                return `
                    <div class="flex-1 flex flex-col items-center gap-1.5">
                        <span class="text-[9px] font-bold" style="color:${col}">${wd.count > 0 ? wd.count : ''}</span>
                        <div class="w-full bg-white/5 rounded-t-lg overflow-hidden relative" style="height:96px">
                            <div class="absolute bottom-0 left-0 right-0 rounded-t-lg transition-all duration-700" style="height:${heightPct}%;background:${col}40;border-top:2px solid ${col}"></div>
                        </div>
                        <span class="text-[10px] font-bold text-gray-400">${daysShort[i]}</span>
                    </div>
                `;
            }).join('');
            if (wdTip) {
                wdTip.innerText = busiest.count > 0
                    ? `ðŸ“… ${busiest.name} Ã© o dia mais ativo do clube com ${busiest.count} atividades no perÃ­odo.`
                    : 'ðŸ“… Nenhuma atividade registrada no perÃ­odo.';
            }
        }
    }
}

// renderAdmin e releaseCourt foram movidos para as seÃ§Ãµes de tarefas abaixo para evitar duplicatas.

function initSortable() {
    let scrollDirection = 0, rafId = null;
    function performScroll() {
        if (scrollDirection !== 0) { window.scrollBy(0, scrollDirection * 25); rafId = requestAnimationFrame(performScroll); }
        else rafId = null;
    }
    function startScrolling(dir) {
        if (scrollDirection !== dir) { scrollDirection = dir; if (!rafId) rafId = requestAnimationFrame(performScroll); }
    }
    function stopScrolling() {
        scrollDirection = 0; if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }
    const handleGlobalMove = (e) => {
        const y = e.clientY || (e.touches ? e.touches[0].clientY : 0);
        const height = window.innerHeight, margin = 160;
        if (y < margin) startScrolling(-1); else if (y > height - margin) startScrolling(1); else stopScrolling();
    };
    const el = document.getElementById('admin-waitlist');
    if (el) {
        new Sortable(el, {
            group: 'shared', animation: 150, ghostClass: 'drag-ghost', chosenClass: 'drag-chosen', scroll: false, forceAutoScroll: false, delay: 0,
            onStart: () => {
                document.body.classList.add('dragging-active');
                document.querySelectorAll('.court-drop-zone').forEach(z => z.classList.add('drag-over'));
                window.addEventListener('mousemove', handleGlobalMove, { passive: false });
                window.addEventListener('touchmove', handleGlobalMove, { passive: false });
            },
            onEnd: () => {
                document.body.classList.remove('dragging-active');
                document.querySelectorAll('.court-drop-zone').forEach(z => z.classList.remove('drag-over'));
                window.removeEventListener('mousemove', handleGlobalMove);
                window.removeEventListener('touchmove', handleGlobalMove);
                stopScrolling();
                const newOrder = Array.from(el.children).map(child => {
                    const id = child.getAttribute('data-id');
                    return state.waitlist.find(w => String(w.id) === id);
                }).filter(Boolean);
                state.waitlist = newOrder; save();
            }
        });
    }
    document.querySelectorAll('.court-drop-zone').forEach(zone => {
        const court = zone.getAttribute('data-court');
        new Sortable(zone, {
            group: 'shared', animation: 150, ghostClass: 'drag-ghost', chosenClass: 'drag-chosen', scroll: false, forceAutoScroll: false,
            onStart: () => {
                document.body.classList.add('dragging-active');
                document.querySelectorAll('.court-drop-zone').forEach(z => z.classList.add('drag-over'));
                window.addEventListener('mousemove', handleGlobalMove, { passive: false });
                window.addEventListener('touchmove', handleGlobalMove, { passive: false });
            },
            onEnd: () => {
                document.body.classList.remove('dragging-active');
                document.querySelectorAll('.court-drop-zone').forEach(z => z.classList.remove('drag-over'));
                window.removeEventListener('mousemove', handleGlobalMove);
                window.removeEventListener('touchmove', handleGlobalMove);
                stopScrolling();
            },
            onAdd: (evt) => {
                const id = evt.item.getAttribute('data-id'), courtFrom = evt.from.getAttribute('data-court');
                if (evt.from.id === 'admin-waitlist') {
                    const waitIdx = state.waitlist.findIndex(w => String(w.id) === id);
                    if (waitIdx !== -1) {
                        const entry = state.waitlist.splice(waitIdx, 1)[0];
                        entry.court = court;
                        entry.registrationTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                        entry.startTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                        if(entry.activity === "Bate-bola") {
                            const [h, m] = entry.startTime.split(':').map(Number);
                            const end = new Date(); end.setHours(h + 1, m);
                            entry.endTime = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                        }
                        state.bookings.push(entry); save(); render();
                        showToast(`${entry.players[0]} movido para a ${court}`, "success");
                    }
                } else if (courtFrom) {
                    const bookingA = state.bookings.find(b => b.court === courtFrom);
                    const bookingB = state.bookings.find(b => b.court === court);
                    if (bookingA) {
                        bookingA.court = court;
                        if (bookingB) { bookingB.court = courtFrom; showToast(`Jogos trocados entre ${courtFrom} e ${court}`, "info"); }
                        else showToast(`Jogo movido para a ${court}`, "info");
                        save(); render();
                    }
                }
            }
        });
    });
}

function renderActivity() {
    const container = document.getElementById('home-recent-activity');
    if(!container) return;
    const recent = state.history.slice().reverse().slice(0, 5);
    container.innerHTML = recent.map(r => `
        <div class="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
            <div class="w-10 h-10 ${r.type ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'} rounded-xl flex items-center justify-center">
                <i class="fas ${r.type ? 'fa-history' : 'fa-check-circle'}"></i>
            </div>
            <div class="flex-1">
                <p class="text-sm font-bold text-white">${r.players[0]}${r.players.length > 1 ? ' + ' + (r.players.length - 1) : ''}</p>
                <p class="text-[10px] text-gray-500 uppercase font-black">${r.court} â€¢ ${r.startTime} - ${r.endTime}</p>
            </div>
            <div class="text-right">
                <p class="text-[9px] font-black text-gray-600 uppercase tracking-tighter">${r.date}</p>
            </div>
        </div>
    `).join('') || '<p class="text-center text-gray-600 font-bold py-10">Nenhum histÃ³rico disponÃ­vel.</p>';
}

// releaseCourt original removido para usar a versÃ£o aprimorada abaixo.

function startMatch(court) {
    const booking = state.bookings.find(b => b.court === court);
    if(booking) {
        booking.startTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        if(booking.activity === "Bate-bola") {
            const [h, m] = booking.startTime.split(':').map(Number);
            const end = new Date(); end.setHours(h + 1, m);
            booking.endTime = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }
        save(); render(); showToast("Partida iniciada!", "success");
    }
}

function removeFromWaitlist(id) {
    if(confirm("Deseja remover este grupo da fila de espera?")) {
        const idx = state.waitlist.findIndex(w => String(w.id) === String(id));
        if(idx !== -1) {
            const withdrawnEntry = state.waitlist.splice(idx, 1)[0];
            state.withdrawals.push({ ...withdrawnEntry, withdrawnAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), withdrawnDate: new Date().toLocaleDateString('pt-BR') });
            save(); render(); showToast("Grupo removido da fila!", "info");
        }
    }
}

function clearAllData() {
    if(confirm("Deseja apagar TODOS os dados do sistema?")) {
        state.bookings = []; state.waitlist = []; state.history = []; state.withdrawals = [];
        save(); render(); showToast("Sistema reiniciado!", "info");
    }
}

function showToast(msg, type='info') {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const toast = document.createElement('div');
    const bg = type === 'error' ? 'bg-red-600' : (type === 'warning' ? 'bg-orange-500' : 'bg-indigo-600');
    toast.className = `${bg} text-white px-8 py-4 rounded-2xl shadow-2xl font-black text-xs uppercase tracking-widest flex items-center gap-3 mb-3`;
    toast.innerHTML = `<i class="fas fa-bell"></i> ${msg}`;
    container.appendChild(toast);
    gsap.from(toast, { x: 100, opacity: 0, duration: 0.5 });
    setTimeout(() => { gsap.to(toast, { x: 100, opacity: 0, duration: 0.5, onComplete: () => toast.remove() }); }, 4000);
}

// ============================================================
// HORÃRIO VIA INTERNET (timeapi.io â€” fuso America/Sao_Paulo)
// ============================================================
let _timeOffset = 0; // diferenÃ§a em ms entre servidor e Date.now()
let _timeSynced = false;
const _clockEl = () => document.getElementById('public-clock');
const _syncIndicatorEl = () => document.getElementById('clock-sync-indicator');

async function fetchWithTimeout(url, options = {}) {
    const timeout = options.timeout ?? 5000;
    const controller = new AbortController();
    const signal = controller.signal;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal });
        return response;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function syncInternetTime() {
    try {
        // Tenta timeapi.io primeiro (sem CORS issues)
        const res = await fetchWithTimeout('https://timeapi.io/api/time/current/zone?timeZone=America%2FSao_Paulo', {
            cache: 'no-store',
            timeout: 5000,
        });
        if (!res.ok) throw new Error('timeapi falhou');
        const data = await res.json();
        // data.dateTime ex: "2025-06-02T14:35:22.123"
        const serverMs = new Date(data.dateTime).getTime();
        _timeOffset = serverMs - Date.now();
        _timeSynced = true;
        if (_syncIndicatorEl()) {
            _syncIndicatorEl().title = 'HorÃ¡rio sincronizado com a internet';
            _syncIndicatorEl().classList.replace('text-gray-500','text-emerald-400');
        }
        console.log(`[Clock] Sincronizado: offset=${_timeOffset}ms`);
    } catch(e) {
        // Fallback: worldtimeapi
        try {
            const res2 = await fetchWithTimeout('https://worldtimeapi.org/api/timezone/America/Sao_Paulo', {
                cache: 'no-store',
                timeout: 5000,
            });
            if (!res2.ok) throw new Error('worldtimeapi falhou');
            const data2 = await res2.json();
            const serverMs2 = new Date(data2.datetime).getTime();
            _timeOffset = serverMs2 - Date.now();
            _timeSynced = true;
            if (_syncIndicatorEl()) {
                _syncIndicatorEl().title = 'HorÃ¡rio sincronizado (fallback)';
                _syncIndicatorEl().classList.replace('text-gray-500','text-emerald-400');
            }
        } catch(e2) {
            _timeSynced = false;
            if (_syncIndicatorEl()) {
                _syncIndicatorEl().title = 'Sem sincronizaÃ§Ã£o â€” usando relÃ³gio local';
                _syncIndicatorEl().classList.replace('text-emerald-400','text-gray-500');
            }
            console.warn('[Clock] Falha ao sincronizar horÃ¡rio pela internet. Usando relÃ³gio local.');
        }
    }
}

function getAccurateNow() {
    return new Date(Date.now() + _timeOffset);
}

// Sincronizar imediatamente e depois a cada 10 minutos
syncInternetTime();
setInterval(syncInternetTime, 10 * 60 * 1000);

setInterval(() => {
    const now = getAccurateNow();
    const clock = _clockEl();
    if(clock) clock.innerText = now.toLocaleTimeString('pt-BR');
    const dateEl = document.getElementById('public-date');
    const weekdayEl = document.getElementById('public-weekday');
    if(dateEl) dateEl.innerText = now.toLocaleDateString('pt-BR');
    if(weekdayEl) weekdayEl.innerText = now.toLocaleDateString('pt-BR', { weekday: 'long' });
    if(state.settings.theme === 'auto') applyTheme();
}, 1000);

// Executar verificaÃ§Ãµes pesadas com menos frequÃªncia (a cada 30 segundos)
setInterval(() => {
    applyFixedSchedules();
    closeAllActivities();
    render();
}, 30000);

applyFixedSchedules();
// Recuperar sessÃ£o do usuÃ¡rio
const savedUser = storage.get('rq_pro_user');
if (savedUser && USER_ROLES[savedUser]) {
    loginAs(savedUser);
} else {
    // Sem sessÃ£o: garante que tela de login estÃ¡ visÃ­vel e todas as views ocultas
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) {
        loginScreen.style.display = 'flex';
        gsap.fromTo(loginScreen, { opacity: 0 }, { opacity: 1, duration: 0.4 });
    }
}
if (state.settings.firebaseConfig) connectFirebase();

window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const modals = [{ id: 'booking-modal', btn: 'booking-submit-btn' }, { id: 'admin-modal', btn: 'admin-free-btn' }, { id: 'edit-modal', btn: 'edit-save-btn' }];
        for (const m of modals) {
            const el = document.getElementById(m.id);
            if (el && !el.classList.contains('hidden')) {
                if (m.id === 'admin-modal' && document.activeElement.id === 'admin-observation') return;
                const btn = document.getElementById(m.btn);
                if (btn) { btn.click(); e.preventDefault(); }
                break;
            }
        }
    }
    if (e.key === 'Escape') { closeBookingModal(); closeAdminModal(); closeEditModal(); closeMemberModal(); closeMoveModal(); }
});

window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith('rq_pro_')) {
        state.courts = storage.get('rq_pro_courts') || state.courts;
        state.bookings = storage.get('rq_pro_bookings') || [];
        state.waitlist = storage.get('rq_pro_waitlist') || [];
        state.withdrawals = storage.get('rq_pro_withdrawals') || [];
        state.history = Array.isArray(storage.get('rq_pro_history')) ? storage.get('rq_pro_history') : [];
        state.members = storage.get('rq_pro_members') || state.members;
        state.settings = storage.get('rq_pro_settings') || state.settings;
        state.manuallyReleasedLessons = storage.get('rq_pro_manually_released') || [];
        applyTheme(); render();
    }
});

function initTennis3D() {
    const canvas = document.getElementById('tennis-canvas');
    if (!canvas) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const tennisElements = [];
    const ballCount = state.settings.performanceMode ? 5 : 15;
    const racketCount = state.settings.performanceMode ? 2 : 5;
    const trophyCount = state.settings.performanceMode ? 1 : 3;
    const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xccff00, roughness: 0.8, metalness: 0.1 });
    const racketFrameMaterial = new THREE.MeshStandardMaterial({ color: 0x2d3436, metalness: 0.9, roughness: 0.2 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x6366f1, metalness: 0.8, roughness: 0.3, emissive: 0x6366f1, emissiveIntensity: 0.4 });
    const gripMaterial = new THREE.MeshStandardMaterial({ color: 0x1e272e, roughness: 0.9 });
    const stringMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, shininess: 100 });
    const logoMaterial = new THREE.MeshBasicMaterial({ color: 0x6366f1, side: THREE.DoubleSide });
    const trophyMaterial = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1.0, roughness: 0.1 });

    // Shared Geometries (Optimized)
    const geoBall = new THREE.SphereGeometry(1.2, state.settings.performanceMode ? 8 : 24, state.settings.performanceMode ? 8 : 24);
    const geoLine = new THREE.TorusGeometry(1.21, 0.04, 12, 60, Math.PI * 1.5);
    const geoRacketFrame = new THREE.TorusGeometry(3, 0.22, state.settings.performanceMode ? 8 : 16, state.settings.performanceMode ? 16 : 80);
    const geoCylinderLow = new THREE.CylinderGeometry(0.3, 0.3, 1.3, 8);
    const geoCylinderMid = new THREE.CylinderGeometry(0.2, 0.2, 1.8, 8);
    const geoHandle = new THREE.CylinderGeometry(0.25, 0.28, 3.5, 8);
    const geoGrip = new THREE.CylinderGeometry(0.38, 0.38, 3.2, 8);
    const geoButt = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 8);
    const geoString = new THREE.CylinderGeometry(0.012, 0.012, 1, 6);
    const geoLogo = new THREE.BoxGeometry(1.5, 0.05, 0.05);
    const geoCupBody = new THREE.CylinderGeometry(1.8, 0.8, 3.5, state.settings.performanceMode ? 8 : 24);
    const geoCupBase = new THREE.BoxGeometry(2.2, 0.6, 2.2);
    const geoCupStem = new THREE.CylinderGeometry(0.5, 1.2, 1, 12);
    const geoCupHandle = new THREE.TorusGeometry(1, 0.15, 8, 40, Math.PI);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2); mainLight.position.set(10, 20, 10); scene.add(mainLight);
    const fillLight = new THREE.PointLight(0x6366f1, 0.5); fillLight.position.set(-15, -10, 5); scene.add(fillLight);
    
    function createBall() {
        const group = new THREE.Group();
        const ball = new THREE.Mesh(geoBall, ballMaterial);
        group.add(ball);
        if (!state.settings.performanceMode) {
            const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const s1 = new THREE.Mesh(geoLine, lineMat); s1.rotation.set(Math.PI/4, 0, 0); group.add(s1);
            const s2 = new THREE.Mesh(geoLine, lineMat); s2.rotation.set(-Math.PI/4, Math.PI, 0); group.add(s2);
        }
        resetElement(group); scene.add(group); tennisElements.push(group);
    }

    function createRacket() {
        const group = new THREE.Group();
        const racketColors = [0x6366f1, 0xef4444, 0x10b981, 0xf59e0b];
        const selectedColor = racketColors[Math.floor(Math.random() * racketColors.length)];
        const currentAccentMaterial = accentMaterial.clone(); currentAccentMaterial.color.setHex(selectedColor); currentAccentMaterial.emissive.setHex(selectedColor);
        const currentLogoMaterial = logoMaterial.clone(); currentLogoMaterial.color.setHex(selectedColor);
        
        const frame = new THREE.Mesh(geoRacketFrame, racketFrameMaterial); frame.scale.set(0.85, 1.15, 1); group.add(frame);
        
        const bridge = new THREE.Mesh(geoCylinderLow, racketFrameMaterial); bridge.rotation.z = Math.PI / 2; bridge.position.y = -2.8; group.add(bridge);
        const throatL = new THREE.Mesh(geoCylinderMid, racketFrameMaterial); throatL.position.set(-0.45, -3.6, 0); throatL.rotation.z = 0.25; group.add(throatL);
        const throatR = throatL.clone(); throatR.position.x = 0.45; throatR.rotation.z = -0.25; group.add(throatR);
        const handle = new THREE.Mesh(geoHandle, racketFrameMaterial); handle.position.y = -5.5; group.add(handle);
        const grip = new THREE.Mesh(geoGrip, gripMaterial); grip.position.y = -6.6; group.add(grip);
        const buttCap = new THREE.Mesh(geoButt, currentAccentMaterial); buttCap.position.y = -8.2; group.add(buttCap);

        const stringCount = state.settings.performanceMode ? 4 : 14;
        const stringGroup = new THREE.Group();
        for(let i = -stringCount/2; i <= stringCount/2; i++) {
            const pos = (i / (stringCount/2)) * 2.2;
            if (Math.abs(pos) < 2.3) {
                const vLen = Math.sqrt(1 - Math.pow(pos/2.6, 2)) * 6.8;
                const vStr = new THREE.Mesh(geoString, stringMaterial); vStr.scale.y = vLen; vStr.position.x = pos; vStr.position.z = (i % 2 === 0 ? 0.01 : -0.01); stringGroup.add(vStr);
            }
            const hPos = (i / (stringCount/2)) * 3.2;
            if (Math.abs(hPos) < 3.3) {
                const hLen = Math.sqrt(1 - Math.pow(hPos/3.6, 2)) * 5.4;
                const hStr = new THREE.Mesh(geoString, stringMaterial); hStr.scale.y = hLen; hStr.rotation.z = Math.PI / 2; hStr.position.y = hPos; hStr.position.z = (i % 2 === 0 ? -0.01 : 0.01); stringGroup.add(hStr);
            }
        }
        group.add(stringGroup);

        if (!state.settings.performanceMode) {
            const logoL = new THREE.Mesh(geoLogo, currentLogoMaterial); logoL.rotation.z = Math.PI / 3; logoL.position.set(-0.4, 0.5, 0.03); group.add(logoL);
            const logoR = logoL.clone(); logoR.rotation.z = -Math.PI / 3; logoR.position.x = 0.4; group.add(logoR);
        }
        resetElement(group); scene.add(group); tennisElements.push(group);
    }

    function createTrophy() {
        const group = new THREE.Group();
        const cupBody = new THREE.Mesh(geoCupBody, trophyMaterial); group.add(cupBody);
        const base = new THREE.Mesh(geoCupBase, gripMaterial); base.position.y = -2.1; group.add(base);
        const stem = new THREE.Mesh(geoCupStem, trophyMaterial); stem.position.y = -1.5; group.add(stem);
        const h1 = new THREE.Mesh(geoCupHandle, trophyMaterial); h1.position.set(1.8, 0.8, 0); h1.rotation.z = -Math.PI / 2.5; group.add(h1);
        const h2 = h1.clone(); h2.position.x = -1.8; h2.rotation.z = Math.PI / 2.5; group.add(h2);
        resetElement(group); scene.add(group); tennisElements.push(group);
    }
    function resetElement(el) {
        el.position.x = (Math.random() - 0.5) * 100; el.position.y = (Math.random() - 0.5) * 60; el.position.z = -180 - Math.random() * 200;
        el.userData.vx = (Math.random() - 0.5) * 0.08; el.userData.vy = (Math.random() - 0.5) * 0.08; el.userData.speed = 0.15 + Math.random() * 0.25;
        el.userData.rotationSpeedX = (Math.random() - 0.5) * 0.04; el.userData.rotationSpeedY = (Math.random() - 0.5) * 0.04;
    }
    for(let i = 0; i < ballCount; i++) createBall();
    for(let i = 0; i < racketCount; i++) createRacket();
    for(let i = 0; i < trophyCount; i++) createTrophy();
    camera.position.z = 20;
    let lastTime = 0;
    const fpsLimit = 60;

    function animate(time) {
        if (canvas.style.display === 'none' || (state.settings.performanceMode && state.currentView !== 'public')) {
            requestAnimationFrame(animate); return;
        }

        const delta = time - lastTime;
        if (delta < 1000 / fpsLimit) {
            requestAnimationFrame(animate);
            return;
        }
        lastTime = time;

        requestAnimationFrame(animate);
        tennisElements.forEach(el => {
            el.position.z += el.userData.speed; el.position.x += el.userData.vx; el.position.y += el.userData.vy;
            el.rotation.x += el.userData.rotationSpeedX; el.rotation.y += el.userData.rotationSpeedY;
            if (el.position.z > 30 || Math.abs(el.position.x) > 80 || Math.abs(el.position.y) > 50) resetElement(el);
        });
        renderer.render(scene, camera);
    }
    window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
    animate();
}

try { console.log("ReservaQuadras Pro Iniciado."); initTennis3D(); } catch (e) { console.error("Erro na inicializaÃ§Ã£o:", e); }

// ============================================================
// TAREFA F â€” ReversÃ£o de atividade encerrada
// ============================================================

/** @param {string} historyId - ID da entrada em state.history a reverter */
function revertHistoryEntry(historyId) {
    const idx = state.history.findIndex(h => String(h.id) === String(historyId));
    if (idx === -1) return showToast("Entrada nÃ£o encontrada!", "error");

    const entry = state.history[idx];
    const targetCourt = entry.court;
    const courtOccupied = state.bookings.some(b => b.court === targetCourt);

    if (courtOccupied) {
        if (!confirm(`A ${targetCourt} estÃ¡ ocupada. Deseja mover para a fila de espera?`)) return;
        state.history.splice(idx, 1);
        const { date, weekday, endTime, playDuration, waitDuration, activity, encerradoPor, ...waitEntry } = entry;
        waitEntry.registrationTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        delete waitEntry.startTime;
        state.waitlist.unshift(waitEntry);
        showToast(`${entry.players[0]} movido para a fila!`, "info");
    } else {
        state.history.splice(idx, 1);
        const { date, weekday, endTime, playDuration, waitDuration, activity, encerradoPor, ...restoredBooking } = entry;
        // Restaurar como booking ativo com dados originais
        state.bookings.push(restoredBooking);
        // Se era aula manual, remover de manuallyReleasedLessons para agenda voltar a controlar
        if (entry.type === 'lesson' || entry.activity === 'AULA') {
            state.manuallyReleasedLessons = state.manuallyReleasedLessons.filter(
                m => !(m.court === targetCourt && m.date === getTodayDate())
            );
        }
        showToast(`Atividade revertida para a ${targetCourt}!`, "success");
    }

    closeUndoModal();
    save();
    render();
}

/** Abre o modal de reversÃ£o listando atividades encerradas hoje (mÃ¡x 15, mais recentes primeiro) 
 * @param {string} courtName - Opcional: filtrar por quadra especÃ­fica
 */
function openUndoModal(courtName = null) {
    const todayDate = getTodayDate();
    let todayHistory = state.history.filter(h => h.date === todayDate);
    
    if (courtName) {
        todayHistory = todayHistory.filter(h => h.court === courtName);
    }

    todayHistory = todayHistory.slice().reverse().slice(0, 15);

    const list = document.getElementById('undo-list');
    if (!list) return;

    if (todayHistory.length === 0) {
        list.innerHTML = `<p class="text-center text-gray-500 py-8 font-bold">Nenhuma atividade encerrada hoje${courtName ? ' para ' + courtName : ''}.</p>`;
    } else {
        list.innerHTML = todayHistory.map(h => {
            const diffMs = new Date() - new Date(`${h.date.split('/').reverse().join('-')}T${h.endTime}`);
            const diffHours = diffMs / (1000 * 60 * 60);
            const warning = diffHours > 3 ? '<span class="text-[8px] text-red-400 font-black ml-2">âš  Encerrado hÃ¡ >3h</span>' : '';
            
            return `
                <div class="glass-card p-4 rounded-2xl border border-white/10 flex justify-between items-center gap-4">
                    <div class="flex-1 min-w-0">
                        <p class="text-xs font-black text-white truncate">${(h.players || []).join(', ')} ${warning}</p>
                        <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">${h.court} Â· ${h.activity || 'JOGO'} Â· ${h.startTime || '--:--'} â†’ ${h.endTime || '--:--'}</p>
                    </div>
                    <button onclick="revertHistoryEntry('${h.id}')" class="shrink-0 px-4 py-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 font-black text-[9px] uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all">
                        <i class="fas fa-rotate-left mr-1"></i>Reverter
                    </button>
                </div>
            `;
        }).join('');
    }

    showModal('undo-modal');
}

/** Fecha o modal de reversÃ£o */
function closeUndoModal() {
    hideModal('undo-modal');
}

// ============================================================
// TAREFA G â€” Analytics e ExportaÃ§Ãµes aprimoradas
// ============================================================

/**
 * Retorna o nome do perÃ­odo (ManhÃ£/Tarde/Noite/--) de acordo com um horÃ¡rio HH:MM
 * @param {string} timeStr - HorÃ¡rio no formato HH:MM
 * @returns {string}
 */
function getPeriodoStr(timeStr) {
    if (!timeStr) return '--';
    const mins = timeToMinutes(timeStr);
    if (mins >= PERIODS.morning.startHour * 60 + PERIODS.morning.startMinute && mins <= PERIODS.morning.endHour * 60 + PERIODS.morning.endMinute) return 'ManhÃ£';
    if (mins >= PERIODS.afternoon.startHour * 60 + PERIODS.afternoon.startMinute && mins <= PERIODS.afternoon.endHour * 60 + PERIODS.afternoon.endMinute) return 'Tarde';
    if (mins >= PERIODS.evening.startHour * 60 + PERIODS.evening.startMinute && mins <= PERIODS.evening.endHour * 60 + PERIODS.evening.endMinute) return 'Noite';
    return '--';
}

/** G.3: Novos KPIs no Dashboard Home (versÃ£o Ãºnica) */

/** G.1: releaseCourt aprimorado â€” encerradoPor e applyFixedSchedules jÃ¡ integrados na versÃ£o final abaixo */

/** G.2: exportDashboardData com novas colunas */
function exportDashboardData() {
    if (state.history.length === 0) return showToast("Nenhum dado para exportar!", "warning");
    const sep = ";";
    const headers = [
        "ID", "Data do Jogo", "Dia da Semana", "Quadra", "Jogadores", "TÃ­tulos",
        "Atividade", "Data da InscriÃ§Ã£o", "Hora da InscriÃ§Ã£o", "Hora de InÃ­cio", "Hora de Fim",
        "Tempo de Espera (min)", "Tempo de Jogo (min)", "ObservaÃ§Ã£o", "Repetido",
        // Novas colunas G.2
        "Encerrado Por", "PerÃ­odo do Dia", "Total de Jogadores", "Tempo na Quadra (hh:mm)"
    ];
    const rows = state.history.map(h => {
        const totalMins = h.playDuration || 0;
        const hh = String(Math.floor(totalMins / 60)).padStart(2, '0');
        const mm = String(totalMins % 60).padStart(2, '0');
        return [
            h.id || "", h.date || "", h.weekday || "", h.court || "",
            (h.players || []).join(' | '), (h.titles || []).join(' | '),
            h.activity || "", h.registrationDate || "", h.registrationTime || "",
            h.startTime || "--", h.endTime || "--",
            h.waitDuration || 0, h.playDuration || 0,
            h.observation || "", h.repeat ? "Sim" : "NÃ£o",
            h.encerradoPor || "admin",
            getPeriodoStr(h.startTime),
            (h.players || []).length,
            `${hh}:${mm}`
        ];
    });
    const csvContent = [headers, ...rows].map(e => e.join(sep)).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `historico_completo_quadras_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    showToast("HistÃ³rico completo exportado com sucesso!", "success");
}

/** G.5: exportWithdrawals com novas colunas */
function exportWithdrawals() {
    if (state.withdrawals.length === 0) return showToast("Nenhuma desistÃªncia para exportar!", "warning");
    const sep = ";";
    const headers = ["Data InscriÃ§Ã£o", "Hora InscriÃ§Ã£o", "Data DesistÃªncia", "Hora DesistÃªncia", "Jogadores", "Atividade", "ObservaÃ§Ã£o",
        "Tempo na Fila (min)", "NÃºmero de Jogadores"]; // Novas colunas G.5
    const rows = state.withdrawals.map(w => {
        let tempoFila = 0;
        if (w.registrationTime && w.withdrawnAt) {
            try {
                const [h1, m1] = w.registrationTime.split(':').map(Number);
                const [h2, m2] = w.withdrawnAt.split(':').map(Number);
                tempoFila = (h2 * 60 + m2) - (h1 * 60 + m1);
                if (tempoFila < 0) tempoFila = 0;
            } catch(e) {}
        }
        return [
            w.registrationDate || w.withdrawnDate, w.registrationTime, w.withdrawnDate, w.withdrawnAt,
            w.players.join(' | '), w.activity, w.observation || "",
            tempoFila, (w.players || []).length
        ];
    });
    const csvContent = [headers, ...rows].map(e => e.join(sep)).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `desistencias_fila_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    showToast("RelatÃ³rio de desistÃªncias exportado!", "success");
}

/** G.3: Atualiza KPIs de perÃ­odo, quadra ociosa e pico de espera no dashboard */
function updateDashboardExtra() {
    const todayDate = getTodayDate();
    const todayHistory = state.history.filter(h => h.date === todayDate);

    // MÃ©dia por perÃ­odo
    const periods = { morning: [], afternoon: [], evening: [] };
    todayHistory.forEach(h => {
        const p = getPeriodoStr(h.startTime);
        if (p === 'ManhÃ£') periods.morning.push(h.playDuration || 0);
        else if (p === 'Tarde') periods.afternoon.push(h.playDuration || 0);
        else if (p === 'Noite') periods.evening.push(h.playDuration || 0);
    });
    const avg = arr => arr.length > 0 ? Math.round(arr.reduce((a,b) => a+b, 0) / arr.length) : null;
    const fmtAvg = v => v !== null ? `${v}m` : '--';
    const el = id => document.getElementById(id);
    if (el('stat-avg-morning')) el('stat-avg-morning').innerText = fmtAvg(avg(periods.morning));
    if (el('stat-avg-afternoon')) el('stat-avg-afternoon').innerText = fmtAvg(avg(periods.afternoon));
    if (el('stat-avg-evening')) el('stat-avg-evening').innerText = fmtAvg(avg(periods.evening));

    // Quadra mais ociosa (menor totalPlayMinutes entre as que tiveram ao menos 1 atividade)
    const courtMins = {};
    todayHistory.forEach(h => { courtMins[h.court] = (courtMins[h.court] || 0) + (h.playDuration || 0); });
    const courtEntries = Object.entries(courtMins).filter(([,v]) => v > 0);
    if (courtEntries.length > 0) {
        const laziest = courtEntries.sort((a, b) => a[1] - b[1])[0];
        if (el('stat-laziest-court')) el('stat-laziest-court').innerText = laziest[0];
        if (el('stat-laziest-court-min')) el('stat-laziest-court-min').innerText = `${laziest[1]} min`;
    } else {
        if (el('stat-laziest-court')) el('stat-laziest-court').innerText = '--';
        if (el('stat-laziest-court-min')) el('stat-laziest-court-min').innerText = '-- min';
    }

    // Pico de espera (maior waitDuration registrado hoje)
    const withWait = todayHistory.filter(h => (h.waitDuration || 0) > 0);
    if (withWait.length > 0) {
        const peak = withWait.sort((a, b) => (b.waitDuration || 0) - (a.waitDuration || 0))[0];
        if (el('stat-peak-wait')) el('stat-peak-wait').innerText = `${peak.waitDuration}m`;
        if (el('stat-peak-wait-name')) el('stat-peak-wait-name').innerText = (peak.players || ['--'])[0];
    } else {
        if (el('stat-peak-wait')) el('stat-peak-wait').innerText = '--';
        if (el('stat-peak-wait-name')) el('stat-peak-wait-name').innerText = '--';
    }
}

// ============================================================
// TAREFA H â€” FIXED_SCHEDULES melhorias
// ============================================================

// H.2: Fins de semana jÃ¡ incluÃ­dos na constante FIXED_SCHEDULES.

// H.3: VariÃ¡vel para quadra sendo liberada via modal
let _releaseLessonCourtPending = null;

/**
 * Abre o modal granular de liberaÃ§Ã£o de aula (H.3) 
 * @param {string} court - Nome da quadra
 */
function openReleaseLessonModal(court) {
    _releaseLessonCourtPending = court;
    const nameEl = document.getElementById('release-lesson-court-name');
    if (nameEl) nameEl.innerText = `Quadra: ${court}`;
    const timeInput = document.getElementById('release-lesson-until');
    if (timeInput) timeInput.value = '';
    showModal('release-lesson-modal');
}

function closeReleaseLessonModal() {
    hideModal('release-lesson-modal');
    _releaseLessonCourtPending = null;
}

/** Libera atÃ© o fim do perÃ­odo atual (comportamento padrÃ£o antigo) */
function releaseLessonUntilPeriodEnd() {
    if (!_releaseLessonCourtPending) return;
    _doReleaseCourt(_releaseLessonCourtPending, null);
    closeReleaseLessonModal();
}

/** Libera atÃ© o horÃ¡rio digitado pelo admin */
function releaseLessonUntilTime() {
    if (!_releaseLessonCourtPending) return;
    const timeInput = document.getElementById('release-lesson-until');
    const until = timeInput ? timeInput.value : null;
    if (!until) return showToast("Informe um horÃ¡rio vÃ¡lido!", "warning");
    _doReleaseCourt(_releaseLessonCourtPending, until);
    closeReleaseLessonModal();
}

/**
 * Executa o encerramento da reserva e marca manuallyReleasedLessons com suporte a `until`
 * @param {string} court - Nome da quadra
 * @param {string|null} until - HH:MM ou null para fim de perÃ­odo
 */
function _doReleaseCourt(court, until) {
    const booking = state.bookings.find(b => b.court === court);
    if (!booking) return;
    const now = new Date(), endTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const todayDate = now.toLocaleDateString('pt-BR');

    let playDuration = 0;
    if (booking.startTime) {
        try {
            const [h1, m1] = booking.startTime.split(':').map(Number);
            const [h2, m2] = endTime.split(':').map(Number);
            playDuration = (h2 * 60 + m2) - (h1 * 60 + m1);
            if (playDuration < 0) playDuration += 24 * 60;
        } catch(e) {}
    }
    let waitDuration = 0;
    if (booking.registrationTime && booking.startTime && !booking.type) {
        try {
            const [h1, m1] = booking.registrationTime.split(':').map(Number);
            const [h2, m2] = booking.startTime.split(':').map(Number);
            waitDuration = (h2 * 60 + m2) - (h1 * 60 + m1);
        } catch(e) {}
    }

    state.history.push({
        ...booking,
        date: getTodayDate(),
        weekday: getWeekdayName(),
        endTime,
        playDuration: playDuration > 0 ? playDuration : 0,
        waitDuration: waitDuration > 0 ? waitDuration : 0,
        tempoEsperaMin: waitDuration > 0 ? waitDuration : 0, // Alias G.1
        totalJogadores: (booking.players || []).length, // G.1
        periodoStr: getPeriodoStr(booking.startTime), // G.1
        activity: booking.type === 'lesson' ? "AULA" : (booking.activity || "OUTRO"),
        encerradoPor: "admin" // G.1
    });
    state.bookings = state.bookings.filter(b => b.court !== court);

    // H.3: suporte a `until` em manuallyReleasedLessons
    if (booking.type === 'lesson') {
        const entry = { court, date: todayDate };
        if (until) entry.until = until;
        state.manuallyReleasedLessons.push(entry);
    }

    // H.1: re-aplicar agendas imediatamente apÃ³s liberar
    save();
    applyFixedSchedules();
    render();
    showToast(`Quadra ${court} liberada!`, "success");

    // Tarefa A: PromoÃ§Ã£o automÃ¡tica da fila
    if (state.waitlist.length > 0) {
        const nextGroup = state.waitlist[0];
        showToastWithAction(
            `${nextGroup.players[0]} estÃ¡ na fila. Mover para ${court}?`,
            "Mover",
            () => {
                const idx = state.waitlist.findIndex(w => w.id === nextGroup.id);
                if (idx !== -1 && !state.bookings.some(b => b.court === court)) {
                    const entry = state.waitlist.splice(idx, 1)[0];
                    entry.court = court;
                    entry.startTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                    if (entry.activity === "Bate-bola") {
                        const [h, m] = entry.startTime.split(':').map(Number);
                        const end = new Date(); end.setHours(h + 1, m);
                        entry.endTime = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                    }
                    entry.promotedFrom = 'waitlist'; // G.1
                    state.bookings.push(entry);
                    save(); render();
                    showToast(`${entry.players[0]} movido para ${court}!`, "success");
                }
            }
        );
    }
}

/**
 * Exibe um toast com botÃ£o de aÃ§Ã£o inline (sem modal bloqueante)
 * @param {string} msg - Mensagem
 * @param {string} actionLabel - RÃ³tulo do botÃ£o
 * @param {Function} onAction - Callback ao clicar
 */
function showToastWithAction(msg, actionLabel, onAction) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const id = 'toast-action-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'glass-card px-5 py-4 rounded-2xl shadow-xl border border-white/10 flex items-center gap-4 max-w-sm w-full bg-indigo-500/10';
    div.innerHTML = `
        <span class="flex-1 text-sm font-bold text-white">${msg}</span>
        <button onclick="(${onAction.toString()})(); document.getElementById('${id}')?.remove();" 
            class="shrink-0 px-4 py-2 rounded-xl bg-indigo-500 text-white font-black text-[10px] uppercase tracking-widest hover:brightness-110 transition-all">
            ${actionLabel}
        </button>
        <button onclick="document.getElementById('${id}')?.remove();" class="shrink-0 text-gray-500 hover:text-white text-lg leading-none">&times;</button>
    `;
    container.appendChild(div);
    setTimeout(() => div.remove(), 12000);
}

// Substituir releaseCourt pelo novo fluxo com modal de opÃ§Ã£o para aulas
function releaseCourt(court) {
    const booking = state.bookings.find(b => b.court === court);
    if (!booking) return;
    // H.3: Se for aula automÃ¡tica, perguntar sobre horÃ¡rio de retorno via modal
    if (booking.type === 'lesson' && booking.observation === 'Agenda Fixa') {
        openReleaseLessonModal(court);
    } else {
        // Para nÃ£o-aulas ou aulas manuais, liberar direto sem modal extra
        _doReleaseCourt(court, null);
    }
}

// H.1: VersÃ£o melhorada de applyFixedSchedules com suporte a `until` e badge de aula ignorada
function applyFixedSchedules() {
    const todayDate = getTodayDate();
    const weekdayName = getWeekdayName();

    const lastDateForReset = storage.get('last_reset_date') || '';
    if (lastDateForReset !== todayDate) {
        state.manuallyReleasedLessons = [];
        storage.set('last_reset_date', todayDate);
    }

    const now = new Date();
    const dayOfWeek = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (const courtName of state.courts) {
        const fixedStatus = getFixedStatus(courtName);
        if (!fixedStatus) continue;

        const existingBooking = state.bookings.find(b => b.court === courtName);

        // Preservar status manuais
        if (existingBooking && ['blocked', 'rain', 'tournament'].includes(existingBooking.type)) {
            // H.1: Badge de aula ignorada
            if (fixedStatus === 'lesson') {
                const logMsg = `Aula ignorada em "${courtName}" â€” quadra com status manual: ${existingBooking.type}`;
                if (!window._lastLogTime || Date.now() - window._lastLogTime > 300000) { // 5 min throttle
                    console.warn(`[${new Date().toLocaleTimeString('pt-BR')}] âš  ${logMsg}`);
                    showToast(`Aula ignorada na ${courtName} (bloqueio manual)`, "warning");
                    window._lastLogTime = Date.now();
                }
            }
            continue;
        }

        // H.3: Verificar se liberada atÃ© horÃ¡rio especÃ­fico
        const manualRelease = state.manuallyReleasedLessons.find(m => m.court === courtName && m.date === todayDate);
        if (manualRelease) {
            // Se tem `until`, verificar se jÃ¡ passou o horÃ¡rio
            if (manualRelease.until) {
                const untilMins = timeToMinutes(manualRelease.until);
                if (currentMinutes < untilMins) {
                    continue; // Ainda dentro da liberaÃ§Ã£o manual com horÃ¡rio
                } else {
                    // HorÃ¡rio atingido â€” remover entrada para a agenda voltar a controlar
                    state.manuallyReleasedLessons = state.manuallyReleasedLessons.filter(
                        m => !(m.court === courtName && m.date === todayDate)
                    );
                }
            } else {
                continue; // Liberar atÃ© fim do perÃ­odo (comportamento original)
            }
        }

        if (fixedStatus === "lesson" && (!existingBooking || existingBooking.type !== "lesson")) {
            if (existingBooking) continue;

            let currentPeriod = null;
            if (FIXED_SCHEDULES[courtName]) {
                for (const schedule of FIXED_SCHEDULES[courtName]) {
                    if (schedule.days.includes(dayOfWeek)) {
                        const startMinutes = timeToMinutes(schedule.start);
                        const endMinutes = timeToMinutes(schedule.end);
                        if (endMinutes > startMinutes && currentMinutes >= startMinutes && currentMinutes < endMinutes) {
                            currentPeriod = schedule; break;
                        }
                    }
                }
            }
            state.bookings.push({
                id: Date.now() + Math.random(), court: courtName, type: "lesson",
                players: ["AULA"], startTime: currentPeriod ? currentPeriod.start : "00:00",
                observation: "Agenda Fixa"
            });
        } else if (fixedStatus === "free" && existingBooking && existingBooking.type === "lesson") {
            if (existingBooking.observation !== "Agenda Fixa") continue;
            const endTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            let playDuration = 0;
            if (existingBooking.startTime) {
                try {
                    const [h1, m1] = existingBooking.startTime.split(':').map(Number);
                    const [h2, m2] = endTime.split(':').map(Number);
                    playDuration = (h2 * 60 + m2) - (h1 * 60 + m1);
                    if (playDuration < 0) playDuration += 24 * 60;
                } catch(e) {}
            }
            state.history.push({
                ...existingBooking, date: todayDate, weekday: weekdayName, endTime,
                playDuration: playDuration > 0 ? playDuration : 0, waitDuration: 0,
                activity: "AULA", encerradoPor: "automatico_22h" // G.1
            });
            state.bookings = state.bookings.filter(b => b.court !== courtName);
        }
    }
    saveLocal();
}

// H.4: Calcular prÃ³xima transiÃ§Ã£o de quadra
/**
 * Calcula a prÃ³xima transiÃ§Ã£o de status para a quadra
 * @param {string} courtName
 * @returns {{ label: string, color: string } | null}
 */
function getNextTransition(courtName) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const schedules = FIXED_SCHEDULES[courtName];
    if (!schedules) return null;

    const daySchedules = schedules.filter(s => s.days.includes(dayOfWeek));
    if (daySchedules.length === 0) return null;

    // Encontrar o perÃ­odo atual
    for (const s of daySchedules) {
        const startMins = timeToMinutes(s.start);
        const endMins = timeToMinutes(s.end);
        if (currentMinutes >= startMins && currentMinutes < endMins) {
            // EstÃ¡ neste perÃ­odo â€” prÃ³xima transiÃ§Ã£o Ã© ao final deste
            if (s.status === 'lesson') {
                return { label: `Livre Ã s ${s.end}`, color: 'text-emerald-400' };
            } else {
                // Encontrar o prÃ³ximo perÃ­odo de aula
                const nextLesson = daySchedules.find(nx => nx.status === 'lesson' && timeToMinutes(nx.start) >= endMins);
                if (nextLesson) return { label: `Aula Ã s ${nextLesson.start}`, color: 'text-amber-400' };
            }
        }
    }
    return null;
}

// H.1 + H.4: renderAdmin com badge de aula ignorada e indicador de prÃ³xima transiÃ§Ã£o
function renderAdmin() {
    const grid = document.getElementById('admin-grid');
    if (!grid) return;
    grid.innerHTML = state.courts.map(c => {
        const b = state.bookings.find(book => book.court === c);
        let bgClass = "";
        if (b) {
            if (b.type === 'blocked') bgClass = "status-blocked";
            else if (b.type === 'lesson') bgClass = "status-lesson";
            else if (b.type === 'rain') bgClass = "status-rain";
            else if (b.type === 'tournament') bgClass = "status-tournament";
        }

        // H.1: Badge de aula ignorada
        const fixedStatus = getFixedStatus(c);
        const ignoredBadge = (b && ['blocked','rain','tournament'].includes(b.type) && fixedStatus === 'lesson')
            ? `<p class="text-[9px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-1 mt-2">âš  Aula ignorada â€” quadra bloqueada</p>`
            : '';

        // H.4: PrÃ³xima transiÃ§Ã£o
        const nextTrans = getNextTransition(c);
        const transitionBadge = nextTrans
            ? `<p class="text-[9px] font-bold ${nextTrans.color} mt-2">${nextTrans.label}</p>`
            : '';

        return `
            <div class="glass-card p-5 rounded-[1.5rem] border-white/10 ${bgClass} court-drop-zone" data-court="${c}">
                <div class="flex justify-between items-center mb-3">
                    <span class="text-base font-black text-white">${c}</span>
                    <div class="flex gap-2">
                        ${b ? `<button onclick="openEditModal('${c}')" class="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/20 border border-white/10 transition-all"><i class="fas fa-edit text-indigo-300 text-[10px]"></i></button>` : ''}
                        <button onclick="openAdminAction('${c}')" class="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/20 border border-white/10 transition-all">
                            <i class="fas fa-cog text-indigo-300 text-[10px]"></i>
                        </button>
                    </div>
                </div>
                <div class="py-2 pointer-events-none">
                    ${b ? `
                        <p class="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1 ${bgClass ? 'text-white' : ''}">${b.type === 'rain' ? 'CHUVA' : (b.type ? b.type.toUpperCase() : b.activity)}</p>
                        <div class="text-[11px] font-medium ${bgClass ? 'text-white/90' : 'text-gray-200'} space-y-0.5 mb-2.5">
                            ${b.players.map(p => `<div class="truncate">${p}</div>`).join('')}
                        </div>
                        <div class="text-[9px] text-gray-400 mb-2.5">
                            Insc: ${b.registrationTime || '--:--'} | InÃ­cio: ${b.startTime || '--:--'}
                        </div>
                        ${b.observation ? `<p class="text-[9px] font-bold text-indigo-300 mt-1 border-l-2 border-indigo-400 pl-2 py-0.5 italic">"${b.observation}"</p>` : ''}
                        ${ignoredBadge}
                        ${transitionBadge}
                        <div class="grid grid-cols-2 gap-2 mt-3 pointer-events-auto">
                            ${!b.startTime ? `
                                <button onclick="startMatch('${c}')" class="w-full py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-black text-[9px] uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all">Iniciar</button>
                                <button onclick="releaseCourt('${c}')" class="w-full py-1.5 rounded-xl bg-red-500/20 text-red-300 border border-red-500/30 font-black text-[9px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">Encerrar</button>
                            ` : `
                                <button onclick="releaseCourt('${c}')" class="w-full py-1.5 rounded-xl bg-red-500/20 text-red-300 border border-red-500/30 font-black text-[9px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">Encerrar</button>
                                <button onclick="openUndoModal('${c}')" class="w-full py-1.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 font-black text-[9px] uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all flex items-center justify-center gap-1"><i class="fas fa-rotate-left"></i> Reverter</button>
                            `}
                        </div>
                        ${!b.startTime ? `
                            <button onclick="openUndoModal('${c}')" class="w-full mt-2 py-1.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 font-black text-[9px] uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all flex items-center justify-center gap-1">
                                <i class="fas fa-rotate-left"></i> Reverter
                            </button>
                        ` : ''}
                    ` : `
                        <p class="text-gray-400 italic text-[10px] mb-2.5">DisponÃ­vel para uso</p>
                        ${transitionBadge}
                        <div class="h-8 border border-dashed border-white/20 rounded-xl flex items-center justify-center text-[9px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/5">QUADRA LIVRE</div>
                        <button onclick="openUndoModal('${c}')" class="w-full mt-3 py-1.5 rounded-xl bg-amber-500/5 text-amber-400/60 border border-amber-500/10 font-black text-[9px] uppercase tracking-widest hover:bg-amber-500/20 hover:text-amber-400 transition-all flex items-center justify-center gap-2">
                            <i class="fas fa-rotate-left"></i> Reverter
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('');

    // Manter waitlist render (reaproveitado do original)
    const adminWait = document.getElementById('admin-waitlist');
    if (!adminWait) return;
    adminWait.innerHTML = state.waitlist.map((item, i) => `<div class="glass-card p-5 rounded-[1.5rem] border-white/20 bg-white/5 backdrop-blur-[4px] cursor-move hover:border-indigo-500/50 transition-all waitlist-item flex flex-col justify-between min-h-[120px]" data-id="${item.id}"><div class="flex justify-between items-start mb-3"><div class="flex flex-col gap-1"><span class="px-3 py-1.5 bg-indigo-500/80 text-white text-[9px] font-black rounded-xl uppercase tracking-widest">FILA: GRUPO ${i+1}</span><span class="text-[9px] font-bold text-gray-300">${item.registrationTime}</span></div><div class="flex gap-2"><button onclick="openWaitlistEditModal('${item.id}')" class="w-8 h-8 flex items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500 hover:text-white transition-all border border-amber-500/20" title="Editar Grupo"><i class="fas fa-pen text-xs"></i></button><button onclick="openMoveModal('${item.id}')" class="w-8 h-8 flex items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500 hover:text-white transition-all border border-indigo-500/20" title="Mover para Quadra"><i class="fas fa-right-left text-xs"></i></button><button onclick="removeFromWaitlist('${item.id}')" class="w-8 h-8 flex items-center justify-center rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-all border border-indigo-500/20" title="Remover da Fila"><i class="fas fa-trash-can text-xs"></i></button></div></div><div class="flex-1 flex flex-col justify-center my-1.5 overflow-hidden"><p class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Jogadores</p><div class="text-xs font-black text-white leading-tight space-y-0.5">${item.players.map(p => `<div class="truncate border-b border-white/10 pb-0.5 last:border-0">${p}</div>`).join('')}</div></div><div class="mt-auto pt-2 border-t border-white/10 flex justify-between items-center"><p class="text-[9px] font-black text-indigo-300 uppercase tracking-widest">${item.activity}</p>${item.repeat ? '<span class="px-2 py-0.5 bg-red-500/30 text-red-200 text-[7px] font-black rounded-lg uppercase tracking-tighter border border-red-500/40">SEM PREFERÃŠNCIA</span>' : ''}</div></div>`).join('') || '<div class="col-span-full py-8 text-center text-gray-400 font-bold uppercase tracking-widest text-xs">Nenhum grupo aguardando</div>';
    initSortable();
}

// G.4: exportOccupancyComplete com seÃ§Ã£o "Resumo por Dia da Semana"
function exportOccupancyComplete() {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const analytics = calculateOccupancyAnalytics(startDate, endDate);
    if (analytics.courts.length === 0) return showToast("Nenhum dado de ocupaÃ§Ã£o para exportar!", "warning");

    const sep = ";";
    let allContent = [];

    allContent.push(["RELATÃ“RIO COMPLETO DE OCUPAÃ‡ÃƒO DAS QUADRAS"]);
    allContent.push(["PerÃ­odo Analisado", `${startDate.toLocaleDateString("pt-BR")} - ${endDate.toLocaleDateString("pt-BR")}`]);
    allContent.push(["Data de GeraÃ§Ã£o", new Date().toLocaleString("pt-BR")]);
    allContent.push([""]);

    allContent.push(["=================================================================="]);
    allContent.push(["1. RESUMO GERAL"]);
    allContent.push(["=================================================================="]);
    allContent.push([""]);
    allContent.push(["DescriÃ§Ã£o", "Valor", "ObservaÃ§Ã£o"]);
    allContent.push(["Total de Quadras", analytics.courts.length, ""]);
    allContent.push(["Total de Horas de Jogo", formatHours(analytics.overall.totalPlayMinutes), `Total: ${analytics.overall.totalPlayMinutes} minutos`]);
    allContent.push(["Taxa MÃ©dia de OcupaÃ§Ã£o", `${analytics.overall.averageOccupancyRate.toFixed(2)}%`, "CÃ¡lculo: MÃ©dia das taxas dos 3 perÃ­odos"]);
    allContent.push([""]);

    allContent.push(["=================================================================="]);
    allContent.push(["2. RESUMO POR PERÃODO DO DIA"]);
    allContent.push(["=================================================================="]);
    allContent.push([""]);
    allContent.push(["PerÃ­odo", "HorÃ¡rio", "Minutos Totais DisponÃ­veis", "Minutos Ocupados", "Taxa de OcupaÃ§Ã£o (%)", "FÃ³rmula"]);
    const daysInRange = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const morningTotalMin = PERIODS.morning.totalMinutes * daysInRange * analytics.courts.length;
    const morningOccupiedMin = analytics.courts.reduce((sum, c) => sum + c.periods.morning.occupiedMinutes, 0);
    const morningRate = morningTotalMin > 0 ? (morningOccupiedMin / morningTotalMin) * 100 : 0;
    const afternoonTotalMin = PERIODS.afternoon.totalMinutes * daysInRange * analytics.courts.length;
    const afternoonOccupiedMin = analytics.courts.reduce((sum, c) => sum + c.periods.afternoon.occupiedMinutes, 0);
    const afternoonRate = afternoonTotalMin > 0 ? (afternoonOccupiedMin / afternoonTotalMin) * 100 : 0;
    const eveningTotalMin = PERIODS.evening.totalMinutes * daysInRange * analytics.courts.length;
    const eveningOccupiedMin = analytics.courts.reduce((sum, c) => sum + c.periods.evening.occupiedMinutes, 0);
    const eveningRate = eveningTotalMin > 0 ? (eveningOccupiedMin / eveningTotalMin) * 100 : 0;
    allContent.push(["ManhÃ£", "06:30 - 12:30", morningTotalMin, morningOccupiedMin, morningRate.toFixed(2), "Minutos Ocupados / Minutos Totais * 100"]);
    allContent.push(["Tarde", "12:31 - 18:30", afternoonTotalMin, afternoonOccupiedMin, afternoonRate.toFixed(2), "Minutos Ocupados / Minutos Totais * 100"]);
    allContent.push(["Noite", "18:31 - 22:00", eveningTotalMin, eveningOccupiedMin, eveningRate.toFixed(2), "Minutos Ocupados / Minutos Totais * 100"]);
    allContent.push([""]);

    allContent.push(["=================================================================="]);
    allContent.push(["3. DADOS POR TIPO DE ATIVIDADE"]);
    allContent.push(["=================================================================="]);
    allContent.push([""]);
    allContent.push(["Tipo de Atividade", "Total de Horas", "Total de Minutos", "NÃºmero de SessÃµes", "Percentual do Total (%)", "FÃ³rmula"]);
    const totalMinutesAll = analytics.overall.totalPlayMinutes;
    Object.entries(analytics.activityData.byType)
        .sort((a, b) => b[1].totalMinutes - a[1].totalMinutes)
        .forEach(([activity, data]) => {
            const pct = totalMinutesAll > 0 ? ((data.totalMinutes / totalMinutesAll) * 100) : 0;
            allContent.push([activity, formatHours(data.totalMinutes), data.totalMinutes, data.count, pct.toFixed(2), "Minutos da Atividade / Total Geral * 100"]);
        });
    allContent.push([""]);

    allContent.push(["=================================================================="]);
    allContent.push(["4. DETALHAMENTO POR QUADRA"]);
    allContent.push(["=================================================================="]);
    allContent.push([""]);
    allContent.push(["Quadra", "Total de Minutos", "Total de Horas", "Minutos ManhÃ£", "Minutos Tarde", "Minutos Noite", "OcupaÃ§Ã£o ManhÃ£ (%)", "OcupaÃ§Ã£o Tarde (%)", "OcupaÃ§Ã£o Noite (%)", "Taxa MÃ©dia (%)"]);
    analytics.courts.forEach(court => {
        const avgRate = (court.periods.morning.occupancyRate + court.periods.afternoon.occupancyRate + court.periods.evening.occupancyRate) / 3;
        allContent.push([court.courtName, court.totalPlayMinutes, formatHours(court.totalPlayMinutes), court.periods.morning.occupiedMinutes, court.periods.afternoon.occupiedMinutes, court.periods.evening.occupiedMinutes, court.periods.morning.occupancyRate.toFixed(2), court.periods.afternoon.occupancyRate.toFixed(2), court.periods.evening.occupancyRate.toFixed(2), avgRate.toFixed(2)]);
    });
    allContent.push([""]);

    allContent.push(["=================================================================="]);
    allContent.push(["5. OCUPAÃ‡ÃƒO DE AULAS POR QUADRA"]);
    allContent.push(["=================================================================="]);
    allContent.push([""]);
    allContent.push(["Quadra", "Total de Minutos em Aulas", "Total de Horas em Aulas", "Minutos ManhÃ£ (Aulas)", "Minutos Tarde (Aulas)", "Minutos Noite (Aulas)", "OcupaÃ§Ã£o ManhÃ£ (%)", "OcupaÃ§Ã£o Tarde (%)", "OcupaÃ§Ã£o Noite (%)"]);
    analytics.courts.forEach(court => {
        if (court.totalLessonMinutes > 0) {
            allContent.push([court.courtName, court.totalLessonMinutes, formatHours(court.totalLessonMinutes), court.lessonPeriods.morning.occupiedMinutes, court.lessonPeriods.afternoon.occupiedMinutes, court.lessonPeriods.evening.occupiedMinutes, court.lessonPeriods.morning.occupancyRate.toFixed(2), court.lessonPeriods.afternoon.occupancyRate.toFixed(2), court.lessonPeriods.evening.occupancyRate.toFixed(2)]);
        }
    });
    allContent.push([""]);

    // G.4: Nova seÃ§Ã£o â€” Resumo por Dia da Semana
    allContent.push(["=================================================================="]);
    allContent.push(["6. LEGENDA E MÃ‰TODOS DE CÃLCULO"]);
    allContent.push(["=================================================================="]);
    allContent.push([""]);
    allContent.push(["Conceito", "DefiniÃ§Ã£o"]);
    allContent.push(["Minutos Totais DisponÃ­veis", "NÃºmero de minutos que a quadra estava disponÃ­vel no perÃ­odo analisado"]);
    allContent.push(["Minutos Ocupados", "NÃºmero de minutos efetivamente utilizados por jogadores ou aulas"]);
    allContent.push(["Taxa de OcupaÃ§Ã£o (%)", "(Minutos Ocupados / Minutos Totais DisponÃ­veis) Ã— 100"]);
    allContent.push(["Taxa MÃ©dia", "MÃ©dia aritmÃ©tica das taxas de ocupaÃ§Ã£o dos trÃªs perÃ­odos do dia"]);
    allContent.push([""]);

    allContent.push(["=================================================================="]);
    allContent.push(["7. RESUMO POR DIA DA SEMANA (Ãºltimos 30 dias)"]);
    allContent.push(["=================================================================="]);
    allContent.push([""]);
    allContent.push(["Dia da Semana", "Total de Atividades", "Minutos Totais", "Taxa de OcupaÃ§Ã£o MÃ©dia (%)"]);
    const diasSemana = ["Domingo","Segunda","TerÃ§a","Quarta","Quinta","Sexta","SÃ¡bado"];
    const totalDisp = PERIODS.morning.totalMinutes + PERIODS.afternoon.totalMinutes + PERIODS.evening.totalMinutes;
    const periodoInicio = startDate.toLocaleDateString('pt-BR');
    const periodoFim = endDate.toLocaleDateString('pt-BR');
    const byWeekday = [0,1,2,3,4,5,6].map(wd => ({ name: diasSemana[wd], total: 0, minutes: 0, dayCount: 0 }));
    // Contar quantos de cada dia ocorreram no range
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        byWeekday[d.getDay()].dayCount++;
    }
    state.history.forEach(h => {
        if (!h.date) return;
        const parts = h.date.split('/');
        if (parts.length !== 3) return;
        const entryDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        if (entryDate >= startDate && entryDate <= endDate) {
            const wd = entryDate.getDay();
            byWeekday[wd].total++;
            byWeekday[wd].minutes += (h.playDuration || 0);
        }
    });
    byWeekday.forEach(wd => {
        const availableMins = wd.dayCount * totalDisp * analytics.courts.length;
        const rate = availableMins > 0 ? ((wd.minutes / availableMins) * 100).toFixed(2) : "0.00";
        allContent.push([wd.name, wd.total, wd.minutes, rate]);
    });
    allContent.push([""]);

    const csvContent = allContent.map(e => e.join(sep)).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio_completo_ocupacao_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    showToast("RelatÃ³rio completo exportado com sucesso!", "success");
}
// ============================================================
// EDIÃ‡ÃƒO DE GRUPO NA FILA DE ESPERA
// ============================================================
let activeWaitlistEditId = null;

function openWaitlistEditModal(id) {
    const item = state.waitlist.find(w => String(w.id) === String(id));
    if (!item) return;
    activeWaitlistEditId = id;

    // SubtÃ­tulo
    const idx = state.waitlist.findIndex(w => String(w.id) === String(id));
    document.getElementById('waitlist-edit-subtitle').textContent = `Grupo ${idx + 1} Â· Inscrito Ã s ${item.registrationTime}`;

    // Atividade
    document.getElementById('we-activity').value = item.activity || 'Dupla';

    // HorÃ¡rio de inscriÃ§Ã£o
    document.getElementById('we-registration-time').value = item.registrationTime || '';

    // ObservaÃ§Ã£o
    document.getElementById('we-observation').value = item.observation || '';

    // Renderizar linhas de jogadores
    renderWaitlistEditPlayerRows(item);

    // Mostrar modal
    showModal('waitlist-edit-modal');
    gsap.fromTo("#waitlist-edit-modal > div:last-child", { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out" });
}

function closeWaitlistEditModal() {
    gsap.to("#waitlist-edit-modal > div:last-child", { scale: 0.85, opacity: 0, duration: 0.3, onComplete: () => {
        hideModal('waitlist-edit-modal');
        activeWaitlistEditId = null;
    }});
}

function renderWaitlistEditPlayerRows(item) {
    const activity = document.getElementById('we-activity').value;
    let numPlayers = 4;
    if (activity === 'Simples' || activity === 'Ranking adulto' || activity === 'Ranking infantil') numPlayers = 2;
    else if (activity === 'Individual') numPlayers = 1;
    else if (activity === 'Bate-bola') numPlayers = 3;

    const container = document.getElementById('we-player-rows');
    container.innerHTML = '';
    for (let i = 0; i < numPlayers; i++) {
        const existingPlayer = item && item.players && item.players[i] ? item.players[i] : '';
        const existingTitle = item && item.titles && item.titles[i] ? item.titles[i] : '';
        container.innerHTML += `
            <div class="grid grid-cols-2 gap-3" id="we-row-${i}">
                <input type="text" id="we-title-${i}" placeholder="TÃ­tulo" value="${existingTitle}"
                    oninput="searchMember(${i}, this.value, 'we')"
                    class="input-glass p-3 rounded-xl text-sm font-bold">
                <select id="we-p-name-${i}" class="input-glass p-3 rounded-xl text-sm font-bold">
                    ${existingPlayer
                        ? `<option value="${existingPlayer}" selected>${existingPlayer}</option>`
                        : `<option value="">Nome...</option>`}
                </select>
            </div>`;
    }
}

function updateWaitlistEditPlayerRows() {
    const item = state.waitlist.find(w => String(w.id) === String(activeWaitlistEditId));
    renderWaitlistEditPlayerRows(item || {});
}

function saveWaitlistEdit() {
    const idx = state.waitlist.findIndex(w => String(w.id) === String(activeWaitlistEditId));
    if (idx === -1) return;

    const activity = document.getElementById('we-activity').value;
    const registrationTime = document.getElementById('we-registration-time').value;
    const observation = document.getElementById('we-observation').value.trim();

    // Coletar jogadores e tÃ­tulos
    const players = [], titles = [];
    let numPlayers = 4;
    if (activity === 'Simples' || activity === 'Ranking adulto' || activity === 'Ranking infantil') numPlayers = 2;
    else if (activity === 'Individual') numPlayers = 1;
    else if (activity === 'Bate-bola') numPlayers = 3;

    for (let i = 0; i < numPlayers; i++) {
        const titleInput = document.getElementById(`we-title-${i}`);
        const nameSelect = document.getElementById(`we-p-name-${i}`);
        if (titleInput && nameSelect && titleInput.value && nameSelect.value) {
            titles.push(titleInput.value.trim());
            players.push(nameSelect.value);
        }
    }

    if (players.length === 0) return showToast("Adicione pelo menos um jogador!", "error");

    // Verificar regra de SEM PREFERÃŠNCIA (dupla)
    let repeat = false;
    if (activity === "Dupla") {
        for (let i = 0; i < titles.length; i++) {
            if (state.history.some(h => h.date === getTodayDate() && h.activity === "Dupla" && h.titles && h.titles.includes(titles[i]) && h.players && h.players.includes(players[i]))) {
                repeat = true;
                break;
            }
        }
    }

    // Atualizar entry
    state.waitlist[idx] = {
        ...state.waitlist[idx],
        activity,
        registrationTime: registrationTime || state.waitlist[idx].registrationTime,
        observation,
        players,
        titles,
        repeat
    };

    save();
    render();
    closeWaitlistEditModal();
    showToast("Grupo da fila atualizado!", "success");
}

// ============================================================
// GERENCIAMENTO DE SUB-ABAS DE HORÃRIOS DE AULAS
// ============================================================

/**
 * Alterna entre as sub-abas de horÃ¡rios (Editor / Visualizar Semana)
 */
function switchLessonTab(tabName) {
    // Esconder todas as abas
    document.querySelectorAll('.lesson-tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remover classe active de todos os botÃµes
    document.querySelectorAll('.lesson-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Mostrar a aba selecionada
    const selectedTab = document.getElementById(`lesson-tab-${tabName}`);
    if (selectedTab) selectedTab.classList.add('active');
    
    // Marcar botÃ£o como ativo
    const selectedBtn = document.querySelector(`[data-lesson-tab="${tabName}"]`);
    if (selectedBtn) selectedBtn.classList.add('active');
    
    // Se for a aba de preview, renderizar o calendÃ¡rio
    if (tabName === 'preview') {
        renderLessonWeeklyPreview();
    }
}

/**
 * Renderiza a visualizaÃ§Ã£o semanal de horÃ¡rios de aulas
 */
function renderLessonWeeklyPreview() {
    const container = document.getElementById('lesson-weekly-preview');
    if (!container) return;
    
    const days = ['Segunda', 'TerÃ§a', 'Quarta', 'Quinta', 'Sexta', 'SÃ¡bado', 'Domingo'];
    const dayNumbers = [1, 2, 3, 4, 5, 6, 0];
    
    let html = '';
    
    state.courts.forEach(court => {
        const schedules = FIXED_SCHEDULES[court] || [];
        
        html += `
            <div class="glass-card p-4 rounded-xl space-y-3">
                <div class="flex items-center gap-2 border-b border-white/10 pb-3">
                    <i class="fas fa-table-tennis-paddle-ball text-indigo-400 text-sm"></i>
                    <h4 class="font-bold text-white text-sm">${court}</h4>
                </div>
                <div class="space-y-2">
        `;
        
        days.forEach((day, idx) => {
            const dayNum = dayNumbers[idx];
            const daySchedules = schedules.filter(s => s.days.includes(dayNum));
            
            if (daySchedules.length === 0) {
                html += `<div class="text-[10px] text-gray-500"><strong>${day}:</strong> NÃ£o configurado</div>`;
                return;
            }
            
            const lessons = daySchedules.filter(s => s.status === 'lesson');
            if (lessons.length === 0) {
                html += `<div class="text-[10px] text-gray-500"><strong>${day}:</strong> Sem aulas</div>`;
                return;
            }
            
            const lessonTimes = lessons.map(l => `${l.start} - ${l.end}`).join(', ');
            html += `
                <div class="text-[10px] p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <strong class="text-amber-300">${day}:</strong>
                    <span class="text-amber-200 ml-1">${lessonTimes}</span>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html || '<div class="col-span-full text-center text-gray-500 py-8">Nenhum horÃ¡rio configurado</div>';
}

/**
 * Renderiza o editor de horÃ¡rios de aulas por quadra
 */
function renderLessonScheduleEditor() {
    const container = document.getElementById('lesson-schedule-editor');
    if (!container) return;
    
    let html = '';
    
    state.courts.forEach(court => {
        const schedules = FIXED_SCHEDULES[court] || [];
        const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'SÃ¡b', 'Dom'];
        const dayNumbers = [1, 2, 3, 4, 5, 6, 0];
        const dayMap = {0:'Dom', 1:'Seg', 2:'Ter', 3:'Qua', 4:'Qui', 5:'Sex', 6:'SÃ¡b'};
        
        html += `
            <div class="glass-card p-4 rounded-xl space-y-3">
                <div class="lesson-court-header" onclick="toggleLessonCourtEditor('${court}')">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-table-tennis-paddle-ball text-indigo-400"></i>
                        <span class="font-bold text-white">${court}</span>
                    </div>
                    <i class="fas fa-chevron-down text-gray-400 transition-transform" id="chevron-${court}"></i>
                </div>
                <div id="editor-${court}" class="hidden space-y-2">
        `;
        
        schedules.forEach((schedule, idx) => {
            const daysList = schedule.days.map(d => dayMap[d] || d).join(', ');
            const statusLabel = schedule.status === 'lesson' ? 'AULA' : 'LIVRE';
            const statusColor = schedule.status === 'lesson' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
            
            html += `
                <div class="lesson-schedule-row">
                    <div class="flex-1">
                        <div class="text-[10px] text-gray-500 uppercase font-bold">Dias</div>
                        <div class="text-sm font-bold text-white">${daysList}</div>
                    </div>
                    <div class="flex-1">
                        <div class="text-[10px] text-gray-500 uppercase font-bold">HorÃ¡rio</div>
                        <div class="text-sm font-bold text-white">${schedule.start} - ${schedule.end}</div>
                    </div>
                    <div class="flex-1">
                        <div class="text-[10px] text-gray-500 uppercase font-bold">Status</div>
                        <span class="inline-block px-2 py-1 rounded-lg text-[10px] font-bold border ${statusColor}">${statusLabel}</span>
                    </div>
                    <div class="row-delete">
                        <button onclick="removeLessonSchedule('${court}', ${idx})" class="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all border border-red-500/20">
                            <i class="fas fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        html += `
                    <button onclick="addLessonSchedule('${court}')" class="w-full py-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold text-[10px] uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all">
                        <i class="fas fa-plus mr-2"></i>Adicionar PerÃ­odo
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

/**
 * Alterna a visibilidade do editor de uma quadra
 */
function toggleLessonCourtEditor(court) {
    const editor = document.getElementById(`editor-${court}`);
    const chevron = document.getElementById(`chevron-${court}`);
    
    if (editor) {
        editor.classList.toggle('hidden');
        if (chevron) {
            chevron.style.transform = editor.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
        }
    }
}

/**
 * Remove um perÃ­odo de aula
 */
function removeLessonSchedule(court, index) {
    if (!confirm('Deseja remover este perÃ­odo?')) return;
    
    if (FIXED_SCHEDULES[court] && FIXED_SCHEDULES[court][index]) {
        FIXED_SCHEDULES[court].splice(index, 1);
        renderLessonScheduleEditor();
        showToast('PerÃ­odo removido!', 'success');
    }
}

/**
 * Adiciona um novo perÃ­odo de aula
 */
function addLessonSchedule(court) {
    const newSchedule = {
        days: [1, 2, 3, 4, 5],
        start: '08:00',
        end: '12:00',
        status: 'lesson'
    };
    
    if (!FIXED_SCHEDULES[court]) FIXED_SCHEDULES[court] = [];
    FIXED_SCHEDULES[court].push(newSchedule);
    renderLessonScheduleEditor();
    showToast('PerÃ­odo adicionado! Configure os horÃ¡rios.', 'info');
}

/**
 * Salva as configuraÃ§Ãµes de horÃ¡rios de aulas
 */
function saveFixedSchedules() {
    storage.set('rq_pro_fixed_schedules', JSON.stringify(FIXED_SCHEDULES));
    applyFixedSchedules();
    render();
    showToast('HorÃ¡rios de aulas salvos com sucesso!', 'success');
}

/**
 * Reseta os horÃ¡rios para os padrÃµes
 */
function resetFixedSchedules() {
    if (!confirm('Deseja resetar todos os horÃ¡rios para os padrÃµes?')) return;
    
    storage.remove('rq_pro_fixed_schedules');
    location.reload();
}

// Inicializar o renderizador de horÃ¡rios ao carregar a pÃ¡gina
window.addEventListener('load', () => {
    renderLessonScheduleEditor();
});



