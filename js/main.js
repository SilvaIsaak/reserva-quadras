import { state, saveLocal } from './state.js';
import { connectFirebase, save } from './firebase.js';
import { render, switchView, exportOccupancyByCourt, exportOccupancyHourly, exportOccupancySummary, exportOccupancyByActivity } from './render.js';
import { applyFixedSchedules } from './schedules.js';
import * as modals from './modals.js';
import * as members from './members.js';
import { initTennis3D } from './three-bg.js';
import { showToast, getTodayDate, getWeekdayName, parseDate } from './utils.js';

// --- Global Helpers (Attach to window for HTML access) ---
window.state = state;
window.render = () => render(callbacks);
window.save = save;
window.showToast = showToast;
window.getTodayDate = getTodayDate;
window.getWeekdayName = getWeekdayName;
window.parseDate = parseDate;
window.switchView = (view) => switchView(view, currentUser, USER_ROLES, callbacks);

// Analytics
window.exportOccupancyByCourt = exportOccupancyByCourt;
window.exportOccupancyHourly = exportOccupancyHourly;
window.exportOccupancySummary = exportOccupancySummary;
window.exportOccupancyByActivity = exportOccupancyByActivity;

// Modals
window.openBookingModal = modals.openBookingModal;
window.closeBookingModal = modals.closeBookingModal;
window.openAdminAction = modals.openAdminAction;
window.closeAdminAction = modals.closeAdminAction;
window.openUndoModal = modals.openUndoModal;
window.closeUndoModal = modals.closeUndoModal;

// Members
window.searchMember = members.searchMember;

// ... Attach all other needed functions to window

const USER_ROLES = {
    'publico': { views: ['public'], default: 'public' },
    'esportes': { views: ['home', 'admin', 'public', 'stats', 'settings'], default: 'home' },
    'diretoria': { views: ['home', 'public', 'stats'], default: 'home' }
};

let currentUser = localStorage.getItem('rq_pro_user') || null;

const callbacks = {
    onRender: () => {
        // Post-render logic like SortableJS
    },
    updateBottomNav: (view) => {
        document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(view));
        });
    }
};

function bootstrap() {
    if (!currentUser) {
        document.getElementById('login-screen').classList.remove('hidden');
    } else {
        document.getElementById('login-screen').classList.add('hidden');
        connectFirebase(() => render(callbacks));
        render(callbacks);
    }
    
    if (!state.settings.performanceMode) {
        initTennis3D();
    }
    
    // Intervals
    setInterval(() => {
        applyFixedSchedules(() => new Date().toLocaleDateString('pt-BR'), () => new Date().toLocaleDateString('pt-BR', { weekday: 'long' }));
        render(callbacks);
    }, 30000);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', bootstrap);

// Login Logic
window.selectUser = (role) => {
    // ... logic
};

window.confirmPin = () => {
    // ... logic
};

window.loginAs = (role) => {
    currentUser = role;
    localStorage.setItem('rq_pro_user', role);
    document.getElementById('login-screen').classList.add('hidden');
    bootstrap();
};

window.logout = () => {
    currentUser = null;
    localStorage.removeItem('rq_pro_user');
    location.reload();
};
