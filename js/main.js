// NÃO CONECTADO AO index.html — referência para modularização futura, ver prompt-reorganizacao-reservaquadras.md

import { state, storage, saveLocal } from './state.js';
import { connectFirebase, save, firebaseDb } from './firebase.js';
import { render, switchView, exportOccupancyByCourt, exportOccupancyHourly, exportOccupancySummary, exportOccupancyByActivity, renderAdmin, renderPublic, renderActivity, updateDashboard, updateNavbarStatus, calculateOccupancyAnalytics, calculateRollingOccupancyAnalytics, formatHours, PERIODS } from './render.js';
import { applyFixedSchedules, FIXED_SCHEDULES, timeToMinutes, getFixedStatus, getNextTransition } from './schedules.js';
import { showToast, getTodayDate, getWeekdayName, parseDate, getAccurateNow } from './utils.js';
import * as members from './members.js';
import { initTennis3D } from './three-bg.js';

// ============================================================
// STATE-RELATED GLOBALS
// ============================================================
const USER_PASSWORDS = {
    publico: null,
    diretora: 'diretora',
    esportes: 'esportes'
};

const USER_ROLES = {
    publico: { label: 'Público', icon: 'fas fa-users', color: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', views: ['public'] },
    diretora: { label: 'Diretora', icon: 'fas fa-chart-pie', color: 'bg-purple-500/10 border-purple-500/30 text-purple-400', views: ['home'] },
    esportes: { label: 'Esportes', icon: 'fas fa-shield-halved', color: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400', views: ['home', 'public', 'admin', 'settings'] }
};

let currentUser = null;
let selectedUserForLogin = null;
let pwdTargetUser = null;
let currentBookingMode = 'court';
let activeMoveId = null;
let activeEditCourt = null;
let activeWaitlistEditId = null;
let _releaseLessonCourtPending = null;
let _timeOffset = 0;
let _timeSynced = false;

// ============================================================
// HELPER: modais
// ============================================================
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

// ============================================================
// USER AUTH FLOW
// ============================================================
function selectUser(role) {
    selectedUserForLogin = role;
    if (USER_PASSWORDS[role] === null) {
        loginAs(role);
        return;
    }
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
    storage.set('rq_pro_user', role);
    const info = USER_ROLES[role];

    const loginScreen = document.getElementById('login-screen');
    gsap.to(loginScreen, { opacity: 0, duration: 0.4, onComplete: () => loginScreen.style.display = 'none' });

    const badge = document.getElementById('role-badge');
    const roleIcon = document.getElementById('role-icon');
    const roleLabel = document.getElementById('role-label');
    badge.className = `hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${info.color}`;
    roleIcon.className = `${info.icon} text-xs`;
    roleLabel.textContent = info.label;

    applyRoleToNav(role);

    const defaultView = info.views[0];
    setTimeout(() => switchView(defaultView), 50);
}

function applyRoleToNav(role) {
    document.querySelectorAll('[class*="nav-publico"], [class*="nav-diretora"], [class*="nav-esportes"]').forEach(el => {
        el.style.display = 'none';
    });
    document.querySelectorAll(`.nav-${role}`).forEach(el => {
        el.style.display = '';
    });

    document.querySelectorAll('#mobile-bottom-nav .bottom-nav-btn').forEach(btn => {
        const views = (btn.getAttribute('data-views') || '').split(' ');
        const hasRole = views.includes(`nav-${role}`);
        btn.style.display = hasRole ? '' : 'none';
    });
}

function logout() {
    currentUser = null;
    selectedUserForLogin = null;
    storage.remove('rq_pro_user');
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const loginScreen = document.getElementById('login-screen');
    loginScreen.style.display = 'flex';
    document.getElementById('pin-area').classList.add('hidden');
    document.getElementById('user-list').classList.remove('hidden');
    gsap.fromTo(loginScreen, { opacity: 0 }, { opacity: 1, duration: 0.4 });
}

// ============================================================
// PASSWORD MANAGEMENT
// ============================================================
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

function setPwdTarget(role) {
    pwdTargetUser = role;
}

function openPasswordModal(role) {
    if (currentUser !== 'esportes') return;
    pwdTargetUser = role;
    const info = USER_ROLES[role];
    document.getElementById('pwd-modal-title').textContent = `Senha — ${info.label}`;
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
        msg.textContent = 'Mínimo de 4 caracteres.';
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
        msg.textContent = '✓ Senhas coincidem';
        msg.className = 'text-xs font-bold text-emerald-400';
        msg.classList.remove('hidden');
        btn.disabled = false;
        btn.classList.remove('opacity-40');
    } else {
        msg.textContent = '✗ Senhas não coincidem';
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

    const toSave = { esportes: USER_PASSWORDS.esportes, diretora: USER_PASSWORDS.diretora };
    storage.set('rq_user_passwords', JSON.stringify(toSave));

    closePasswordModal();
    showToast(`Senha do perfil ${USER_ROLES[pwdTargetUser].label} atualizada!`, 'success');
}

// ============================================================
// THEME
// ============================================================
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

    const labels = { 'dark': 'Escuro', 'light': 'Claro', 'auto': 'Automático' };
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

// ============================================================
// MOBILE MENU
// ============================================================
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

// ============================================================
// TIME SYNC
// ============================================================
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
        const res = await fetchWithTimeout('https://timeapi.io/api/time/current/zone?timeZone=America%2FSao_Paulo', {
            cache: 'no-store',
            timeout: 5000,
        });
        if (!res.ok) throw new Error('timeapi falhou');
        const data = await res.json();
        const serverMs = new Date(data.dateTime).getTime();
        _timeOffset = serverMs - Date.now();
        _timeSynced = true;
        const syncInd = document.getElementById('clock-sync-indicator');
        if (syncInd) {
            syncInd.title = 'Horário sincronizado com a internet';
            syncInd.classList.replace('text-gray-500','text-emerald-400');
        }
    } catch(e) {
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
            const syncInd = document.getElementById('clock-sync-indicator');
            if (syncInd) {
                syncInd.title = 'Horário sincronizado (fallback)';
                syncInd.classList.replace('text-gray-500','text-emerald-400');
            }
        } catch(e2) {
            _timeSynced = false;
            const syncInd = document.getElementById('clock-sync-indicator');
            if (syncInd) {
                syncInd.title = 'Sem sincronização — usando relógio local';
                syncInd.classList.replace('text-emerald-400','text-gray-500');
            }
        }
    }
}

// ============================================================
// VIEW SWITCHING & PUBLIC TABS
// ============================================================
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

let currentAnalyticsPeriod = 'rolling';

function changeAnalyticsPeriod(period) {
    currentAnalyticsPeriod = period;

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

    const subtitle = document.getElementById('pub-analytics-subtitle');
    const labelTotal = document.getElementById('pub-label-total');
    const labelHours = document.getElementById('pub-label-hours');
    const labelBusiest = document.getElementById('pub-label-busiest');
    const labelCourtOcc = document.getElementById('pub-court-occ-label');

    if (subtitle) {
        const labels = { 'day': 'Hoje', 'week': 'Últimos 7 dias', 'rolling': 'Últimos 28 dias' };
        subtitle.innerText = `Dados: ${labels[period]} — transparência para os sócios`;

        if (labelTotal) labelTotal.innerText = period === 'day' ? 'Jogos Hoje' : (period === 'week' ? 'Jogos na Semana' : 'Jogos nos Últimos 28 dias');
        if (labelHours) labelHours.innerText = period === 'day' ? 'Horas Hoje' : (period === 'week' ? 'Horas na Semana' : 'Horas nos Últimos 28 dias');
        if (labelBusiest) labelBusiest.innerText = period === 'day' ? 'Horário de Pico' : 'Dia Mais Movido';
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
        const diasNome = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
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
                        <span>Manhã: ${court.periods.morning.occupancyRate.toFixed(0)}%</span>
                        <span>Tarde: ${court.periods.afternoon.occupancyRate.toFixed(0)}%</span>
                        <span>Noite: ${court.periods.evening.occupancyRate.toFixed(0)}%</span>
                    </div>
                </div>
            `;
        });
        if (analytics.courts.length === 0) {
            courtContainer.innerHTML = '<p class="text-center text-gray-500 py-6 text-sm">Nenhum dado disponível ainda.</p>';
        }
    }

    const periodContainer = document.getElementById('pub-period-bars');
    if (periodContainer) {
        const daysInRange = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        const periods = [
            { name: 'Manhã', key: 'morning', icon: 'fa-sun', color: 'text-amber-400', bg: 'bg-amber-500' },
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
                    <p class="text-[10px] text-gray-500 font-bold">${PERIODS[p.key].name === 'Manhã' ? '06:30-12:30' : PERIODS[p.key].name === 'Tarde' ? '12:31-18:30' : '18:31-22:00'}</p>
                    <div class="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div class="${p.bg} h-full rounded-full" style="width:${Math.min(rate,100)}%"></div>
                    </div>
                    <p class="${p.color} font-bold text-xl">${rate.toFixed(1)}%</p>
                    <p class="text-[10px] text-gray-500">${formatHours(occupied)} utilizadas</p>
                </div>
            `;
        });
    }

    const actBar = document.getElementById('pub-activity-bar');
    const actBreakdown = document.getElementById('pub-activity-breakdown');
    const actColors = ['#6366f1','#10b981','#f59e0b','#a855f7','#3b82f6','#ef4444'];
    const sortedActivities = Object.entries(analytics.activityData.byType).sort((a,b) => b[1].totalMinutes - a[1].totalMinutes);
    const totalMins = analytics.overall.totalPlayMinutes;
    if (actBar && actBreakdown) {
        if (sortedActivities.length === 0) {
            actBar.innerHTML = '<div class="w-full h-full bg-white/10 rounded-full"></div>';
            actBreakdown.innerHTML = '<p class="text-center text-gray-500 text-sm py-4">Nenhum dado disponível.</p>';
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

    const wdChart = document.getElementById('pub-weekday-chart');
    const wdTip = document.getElementById('pub-weekday-tip');
    const wdTitle = document.querySelector('#pub-panel-analytics .fa-calendar-week')?.parentElement?.querySelector('h3');
    const wdSubtitle = document.querySelector('#pub-panel-analytics .fa-calendar-week')?.parentElement?.querySelector('p');

    if (wdChart) {
        if (currentAnalyticsPeriod === 'day') {
            if (wdTitle) wdTitle.innerText = 'Atividade por Hora';
            if (wdSubtitle) wdSubtitle.innerText = 'Distribuição de jogos ao longo do dia';

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
                if (hour < 6 || hour > 22) return '';
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
                    ? `🔓 O horário de pico foi às ${peakHour}:00 com ${Math.max(...hourlyCounts)} atividades.`
                    : '🔓 Nenhuma atividade registrada no período.';
            }
        } else {
            if (wdTitle) wdTitle.innerText = 'Atividade por Dia da Semana';
            if (wdSubtitle) wdSubtitle.innerText = 'Qual dia tem mais jogos';

            const diasNome = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
            const byWd = [0,1,2,3,4,5,6].map(wd => ({ name: diasNome[wd], count: 0 }));
            state.history.forEach(h => {
                if (!h.date) return;
                const dt = parseDate(h.date);
                if (dt && dt >= startDate && dt <= endDate) byWd[dt.getDay()].count++;
            });
            const busiest = byWd.reduce((a, b) => b.count > a.count ? b : a, byWd[0]);

            const maxCount = Math.max(...byWd.map(d => d.count), 1);
            const daysShort = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
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
                    ? `🔓 ${busiest.name} é o dia mais ativo do clube com ${busiest.count} atividades no período.`
                    : '🔓 Nenhuma atividade registrada no período.';
            }
        }
    }
}

// ============================================================
// SETTINGS TABS
// ============================================================
function switchSettingsTab(tabId) {
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === tabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    document.querySelectorAll('.settings-panel').forEach(panel => {
        if (panel.id === `settings-panel-${tabId}`) {
            panel.classList.add('active');
            gsap.fromTo(panel, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3 });
        } else {
            panel.classList.remove('active');
        }
    });
}

// ============================================================
// BOOKING FORM HELPERS
// ============================================================
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
        options = '<option value="Individual">🏃 Individual</option>';
    } else if (count === 2) {
        options = `
            <option value="Simples">🎾 Jogo Simples</option>
            <option value="Ranking infantil">🏆 Ranking Infantil</option>
            <option value="Ranking adulto">🏆 Ranking Adulto</option>
            <option value="Bate-bola">🔄 Bate-bola</option>
        `;
    } else if (count === 3) {
        options = '<option value="Bate-bola">🔄 Bate-bola</option>';
    } else if (count === 4) {
        options = '<option value="Dupla">🎾 Jogo Dupla</option>';
    } else {
        options = `
            <option value="Dupla">🎾 Jogo Dupla</option>
            <option value="Simples">🎾 Jogo Simples</option>
            <option value="Ranking infantil">🏆 Ranking Infantil</option>
            <option value="Ranking adulto">🏆 Ranking Adulto</option>
            <option value="Bate-bola">🔄 Bate-bola</option>
            <option value="Individual">🏃 Individual</option>
        `;
    }
    select.innerHTML = options;
    const newOptions = Array.from(select.options).map(o => o.value);
    if (newOptions.includes(currentValue)) select.value = currentValue;
    if (prefix !== 'edit') toggleDuration();
}

function toggleDuration() {
    const act = document.getElementById('field-activity').value;
    document.getElementById('dur-box').classList.toggle('hidden', act !== 'Bate-bola');
}

// ============================================================
// OPEN/CLOSE BOOKING MODAL
// ============================================================
function openBookingModal(mode = 'court') {
    currentBookingMode = mode;
    showModal('booking-modal');
    gsap.fromTo("#booking-modal > div:last-child", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out" });
    const titleEl = document.getElementById('booking-modal-title');
    const subtitleEl = document.getElementById('booking-modal-subtitle');
    const courtBox = document.getElementById('court-field-box');
    if(mode === 'queue') {
        titleEl.innerText = "Inscrição na Fila";
        subtitleEl.innerText = "Entrar na fila de espera global";
        courtBox.classList.add('hidden');
        document.getElementById('field-court').required = false;
    } else {
        titleEl.innerText = "Inscrição Direta";
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
                <input type="text" placeholder="Título" oninput="searchMember(${i}, this.value)" class="input-glass p-4 rounded-2xl text-sm font-bold">
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

// ============================================================
// ADMIN ACTION / COURT STATUS
// ============================================================
function openAdminAction(court) {
    state.activeAdminCourt = court;
    document.getElementById('admin-court-title').innerText = court;
    document.getElementById('admin-observation').value = '';
    showModal('admin-modal');
    gsap.fromTo("#admin-modal > div:last-child", { y: 100, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 });
}

function closeAdminModal() { hideModal('admin-modal'); }

function setCourtStatus(type) {
    const obs = document.getElementById('admin-observation').value.trim();
    if(type === 'free') {
        releaseCourt(state.activeAdminCourt);
    } else {
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

function processEntry(entry) {
    const court = entry.court;
    const occupied = state.bookings.find(b => b.court === court);
    if(occupied || entry.repeat) {
        state.waitlist.push(entry);
        if(entry.repeat) showToast("Sócio já jogou hoje: Fim da fila.", "warning");
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

// ============================================================
// EDIT MODAL
// ============================================================
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
                    <input type="text" id="edit-p-title-${i}" value="${title}" placeholder="Título" oninput="searchMember(${i}, this.value, 'edit')" class="input-glass p-4 rounded-2xl text-sm font-bold">
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
            if(players.length === 4) return showToast("Com 4 jogadores, selecione a opção Dupla!", "error");
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
        showToast("Alterações salvas!", "success");
    }
}

// ============================================================
// MOVE MODAL
// ============================================================
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

// ============================================================
// START MATCH / RELEASE COURT
// ============================================================
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

// ============================================================
// RELEASE COURT (com modal granular para aulas)
// ============================================================
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

function releaseLessonUntilPeriodEnd() {
    if (!_releaseLessonCourtPending) return;
    _doReleaseCourt(_releaseLessonCourtPending, null);
    closeReleaseLessonModal();
}

function releaseLessonUntilTime() {
    if (!_releaseLessonCourtPending) return;
    const timeInput = document.getElementById('release-lesson-until');
    const until = timeInput ? timeInput.value : null;
    if (!until) return showToast("Informe um horário válido!", "warning");
    _doReleaseCourt(_releaseLessonCourtPending, until);
    closeReleaseLessonModal();
}

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
        tempoEsperaMin: waitDuration > 0 ? waitDuration : 0,
        totalJogadores: (booking.players || []).length,
        periodoStr: getPeriodoStr(booking.startTime),
        activity: booking.type === 'lesson' ? "AULA" : (booking.activity || "OUTRO"),
        encerradoPor: "admin"
    });
    state.bookings = state.bookings.filter(b => b.court !== court);

    if (booking.type === 'lesson') {
        const entry = { court, date: todayDate };
        if (until) entry.until = until;
        state.manuallyReleasedLessons.push(entry);
    }

    save();
    applyFixedSchedules();
    render();
    showToast(`Quadra ${court} liberada!`, "success");

    if (state.waitlist.length > 0) {
        const nextGroup = state.waitlist[0];
        showToastWithAction(
            `${nextGroup.players[0]} está na fila. Mover para ${court}?`,
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
                    entry.promotedFrom = 'waitlist';
                    state.bookings.push(entry);
                    save(); render();
                    showToast(`${entry.players[0]} movido para ${court}!`, "success");
                }
            }
        );
    }
}

function releaseCourt(court) {
    const booking = state.bookings.find(b => b.court === court);
    if (!booking) return;
    if (booking.type === 'lesson' && booking.observation === 'Agenda Fixa') {
        openReleaseLessonModal(court);
    } else {
        _doReleaseCourt(court, null);
    }
}

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

// ============================================================
// WAITLIST EDIT MODAL
// ============================================================
function openWaitlistEditModal(id) {
    const item = state.waitlist.find(w => String(w.id) === String(id));
    if (!item) return;
    activeWaitlistEditId = id;

    const idx = state.waitlist.findIndex(w => String(w.id) === String(id));
    document.getElementById('waitlist-edit-subtitle').textContent = `Grupo ${idx + 1} · Inscrito às ${item.registrationTime}`;

    document.getElementById('we-activity').value = item.activity || 'Dupla';
    document.getElementById('we-registration-time').value = item.registrationTime || '';
    document.getElementById('we-observation').value = item.observation || '';

    renderWaitlistEditPlayerRows(item);

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
                <input type="text" id="we-title-${i}" placeholder="Título" value="${existingTitle}"
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

    let repeat = false;
    if (activity === "Dupla") {
        for (let i = 0; i < titles.length; i++) {
            if (state.history.some(h => h.date === getTodayDate() && h.activity === "Dupla" && h.titles && h.titles.includes(titles[i]) && h.players && h.players.includes(players[i]))) {
                repeat = true;
                break;
            }
        }
    }

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
// MEMBER MODAL
// ============================================================
function openMemberModal() {
    const sidebar = document.getElementById('members-sidebar');
    const panel = document.getElementById('members-sidebar-panel');
    if (!sidebar || !panel) return;
    sidebar.classList.remove('hidden');
    sidebar.style.display = 'block';
    panel.getBoundingClientRect();
    panel.style.transform = 'translateX(0)';
    if (window.renderMembersList) window.renderMembersList();
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

// ============================================================
// UPDATE SETTINGS
// ============================================================
function updateSettings() {
    try {
        const membersEl = document.getElementById('set-members');
        if (membersEl) {
            let input = membersEl.value.trim();
            if (input) {
                let parsed;
                try { parsed = JSON.parse(input); } catch(e) { parsed = JSON.parse(input.replace(/'/g, '"')); }
                if(typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error("Invalid JSON");
                state.members = parsed;
            }
        }
    } catch(e) { showToast("Erro no formato da Base de Dados! Use JSON válido.", "error"); return; }

    const nameInput = document.getElementById('set-club-name');
    const courtsInput = document.getElementById('set-courts');
    const colorInput = document.getElementById('set-color');

    if (nameInput) state.settings.clubName = nameInput.value;
    if (courtsInput) state.courts = courtsInput.value.split(',').map(c => c.trim()).filter(c => c !== "");
    if (colorInput) {
        state.settings.primaryColor = colorInput.value;
        document.documentElement.style.setProperty('--primary', state.settings.primaryColor);
    }

    const brandEl = document.getElementById('brand-name');
    if (brandEl) {
        const name = state.settings.clubName;
        if (name.toLowerCase().includes('reservaquadras')) {
             brandEl.innerHTML = `Reserva<span class="text-indigo-400">Quadras</span>`;
        } else {
             brandEl.innerText = name;
        }
    }

    save(); showToast("Configurações salvas com sucesso!", "success"); render();
}

// ============================================================
// UNDO / REVERT
// ============================================================
function revertHistoryEntry(historyId) {
    const idx = state.history.findIndex(h => String(h.id) === String(historyId));
    if (idx === -1) return showToast("Entrada não encontrada!", "error");

    const entry = state.history[idx];
    const targetCourt = entry.court;
    const courtOccupied = state.bookings.some(b => b.court === targetCourt);

    if (courtOccupied) {
        if (!confirm(`A ${targetCourt} está ocupada. Deseja mover para a fila de espera?`)) return;
        state.history.splice(idx, 1);
        const { date, weekday, endTime, playDuration, waitDuration, activity, encerradoPor, ...waitEntry } = entry;
        waitEntry.registrationTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        delete waitEntry.startTime;
        state.waitlist.unshift(waitEntry);
        showToast(`${entry.players[0]} movido para a fila!`, "info");
    } else {
        state.history.splice(idx, 1);
        const { date, weekday, endTime, playDuration, waitDuration, activity, encerradoPor, ...restoredBooking } = entry;
        state.bookings.push(restoredBooking);
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
            const warning = diffHours > 3 ? '<span class="text-[8px] text-red-400 font-black ml-2">⚠ Encerrado há >3h</span>' : '';

            return `
                <div class="glass-card p-4 rounded-2xl border border-white/10 flex justify-between items-center gap-4">
                    <div class="flex-1 min-w-0">
                        <p class="text-xs font-black text-white truncate">${(h.players || []).join(', ')} ${warning}</p>
                        <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">${h.court} · ${h.activity || 'JOGO'} · ${h.startTime || '--:--'} → ${h.endTime || '--:--'}</p>
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

function closeUndoModal() {
    hideModal('undo-modal');
}

// ============================================================
// CLOSE ALL ACTIVITIES (22:00)
// ============================================================
let lastClosingDate = storage.get('last_closing_date') || '';

function closeAllActivities() {
    const now = new Date();
    const currentDate = now.toLocaleDateString('pt-BR');

    if (lastClosingDate === currentDate) return;

    const currentHour = now.getHours();
    if (currentHour < 22) return;

    const endTime = "22:00";

    const bookingsToClose = [...state.bookings];
    for (const booking of bookingsToClose) {
        let playDuration = 0;
        if (booking.startTime) {
            try {
                const [h1, m1] = booking.startTime.split(':').map(Number);
                const h2 = 22, m2 = 0;
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

    state.bookings = [];

    const waitlistToClose = [...state.waitlist];
    for (const entry of waitlistToClose) {
        state.withdrawals.push({
            ...entry,
            withdrawnAt: endTime,
            withdrawnDate: currentDate
        });
    }
    state.waitlist = [];

    lastClosingDate = currentDate;
    storage.set('last_closing_date', lastClosingDate);

    save();
    render();

    showToast("Todas as atividades encerradas automaticamente às 22:00!", "info");
}

// ============================================================
// TOGGLE PERFORMANCE MODE
// ============================================================
function togglePerformanceMode() {
    state.settings.performanceMode = document.getElementById('set-performance').checked;
    save();
    showToast(state.settings.performanceMode ? "Modo Performance Ativado! Recarregue se necessário." : "Modo Visual Ativado!", "info");

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

// ============================================================
// EXPORTS
// ============================================================
function exportFullSystemData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 4));
    const link = document.createElement('a');
    link.setAttribute("href", dataStr); link.setAttribute("download", `backup_sistema_quadras_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link); link.click(); link.remove();
    showToast("Backup do sistema concluído!", "success");
}

function exportDashboardData() {
    if (state.history.length === 0) return showToast("Nenhum dado para exportar!", "warning");
    const sep = ";";
    const headers = [
        "ID", "Data do Jogo", "Dia da Semana", "Quadra", "Jogadores", "Títulos",
        "Atividade", "Data da Inscrição", "Hora da Inscrição", "Hora de Início", "Hora de Fim",
        "Tempo de Espera (min)", "Tempo de Jogo (min)", "Observação", "Repetido",
        "Encerrado Por", "Período do Dia", "Total de Jogadores", "Tempo na Quadra (hh:mm)"
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
            h.observation || "", h.repeat ? "Sim" : "Não",
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
    showToast("Histórico completo exportado com sucesso!", "success");
}

function exportWithdrawals() {
    if (state.withdrawals.length === 0) return showToast("Nenhuma desistência para exportar!", "warning");
    const sep = ";";
    const headers = ["Data Inscrição", "Hora Inscrição", "Data Desistência", "Hora Desistência", "Jogadores", "Atividade", "Observação",
        "Tempo na Fila (min)", "Número de Jogadores"];
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
    showToast("Relatório de desistências exportado!", "success");
}

function exportOccupancyComplete() {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const analytics = calculateOccupancyAnalytics(startDate, endDate);
    if (analytics.courts.length === 0) return showToast("Nenhum dado de ocupação para exportar!", "warning");

    const sep = ";";
    let allContent = [];

    allContent.push(["RELATÓRIO COMPLETO DE OCUPAÇÃO DAS QUADRAS"]);
    allContent.push(["Período Analisado", `${startDate.toLocaleDateString("pt-BR")} - ${endDate.toLocaleDateString("pt-BR")}`]);
    allContent.push(["Data de Geração", new Date().toLocaleString("pt-BR")]);
    allContent.push([""]);
    allContent.push(["1. RESUMO GERAL"]);
    allContent.push(["Descrição", "Valor", "Observação"]);
    allContent.push(["Total de Quadras", analytics.courts.length, ""]);
    allContent.push(["Total de Horas de Jogo", formatHours(analytics.overall.totalPlayMinutes), `Total: ${analytics.overall.totalPlayMinutes} minutos`]);
    allContent.push(["Taxa Média de Ocupação", `${analytics.overall.averageOccupancyRate.toFixed(2)}%`, "Média das taxas dos 3 períodos"]);
    allContent.push([""]);
    allContent.push(["2. RESUMO POR PERÍODO DO DIA"]);
    allContent.push(["Período", "Horário", "Minutos Totais Disponíveis", "Minutos Ocupados", "Taxa de Ocupação (%)"]);
    const daysInRange = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const mTotal = PERIODS.morning.totalMinutes * daysInRange * analytics.courts.length;
    const mOcc = analytics.courts.reduce((sum, c) => sum + c.periods.morning.occupiedMinutes, 0);
    allContent.push(["Manhã", "06:30-12:30", mTotal, mOcc, (mOcc/mTotal*100).toFixed(2)]);
    const aTotal = PERIODS.afternoon.totalMinutes * daysInRange * analytics.courts.length;
    const aOcc = analytics.courts.reduce((sum, c) => sum + c.periods.afternoon.occupiedMinutes, 0);
    allContent.push(["Tarde", "12:31-18:30", aTotal, aOcc, (aOcc/aTotal*100).toFixed(2)]);
    const eTotal = PERIODS.evening.totalMinutes * daysInRange * analytics.courts.length;
    const eOcc = analytics.courts.reduce((sum, c) => sum + c.periods.evening.occupiedMinutes, 0);
    allContent.push(["Noite", "18:31-22:00", eTotal, eOcc, (eOcc/eTotal*100).toFixed(2)]);
    allContent.push([""]);
    allContent.push(["3. DADOS POR TIPO DE ATIVIDADE"]);
    allContent.push(["Tipo", "Horas", "Minutos", "Sessões", "%"]);
    const totalMinAll = analytics.overall.totalPlayMinutes;
    Object.entries(analytics.activityData.byType).sort((a,b) => b[1].totalMinutes-a[1].totalMinutes).forEach(([act,data]) => {
        allContent.push([act, formatHours(data.totalMinutes), data.totalMinutes, data.count, ((data.totalMinutes/totalMinAll)*100).toFixed(2)]);
    });

    const csvContent = allContent.map(e => e.join(sep)).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio_completo_ocupacao_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    showToast("Relatório completo exportado com sucesso!", "success");
}

function getPeriodoStr(timeStr) {
    if (!timeStr) return '--';
    const mins = timeToMinutes(timeStr);
    if (mins >= PERIODS.morning.startHour*60+PERIODS.morning.startMinute && mins <= PERIODS.morning.endHour*60+PERIODS.morning.endMinute) return 'Manhã';
    if (mins >= PERIODS.afternoon.startHour*60+PERIODS.afternoon.startMinute && mins <= PERIODS.afternoon.endHour*60+PERIODS.afternoon.endMinute) return 'Tarde';
    if (mins >= PERIODS.evening.startHour*60+PERIODS.evening.startMinute && mins <= PERIODS.evening.endHour*60+PERIODS.evening.endMinute) return 'Noite';
    return '--';
}

function importFullSystemData(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedState = JSON.parse(e.target.result);
            if (confirm("Isso irá substituir TODOS os dados atuais. Deseja continuar?")) {
                state = { ...state, ...importedState }; save(); render();
                showToast("Dados restaurados com sucesso!", "success");
            }
        } catch (err) { showToast("Erro ao importar arquivo!", "error"); }
    };
    reader.readAsText(file);
}

// ============================================================
// LESSON SCHEDULE EDITOR
// ============================================================
function switchLessonTab(tabName) {
    document.querySelectorAll('.lesson-tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.lesson-tab-btn').forEach(btn => btn.classList.remove('active'));
    const selectedTab = document.getElementById(`lesson-tab-${tabName}`);
    if (selectedTab) selectedTab.classList.add('active');
    const selectedBtn = document.querySelector(`[data-lesson-tab="${tabName}"]`);
    if (selectedBtn) selectedBtn.classList.add('active');
    if (tabName === 'preview') renderLessonWeeklyPreview();
}

function renderLessonWeeklyPreview() {
    const container = document.getElementById('lesson-weekly-preview');
    if (!container) return;
    const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
    const dayNumbers = [1, 2, 3, 4, 5, 6, 0];
    let html = '';
    state.courts.forEach(court => {
        const schedules = FIXED_SCHEDULES[court] || [];
        html += `<div class="glass-card p-4 rounded-xl space-y-3"><div class="flex items-center gap-2 border-b border-white/10 pb-3"><i class="fas fa-table-tennis-paddle-ball text-indigo-400 text-sm"></i><h4 class="font-bold text-white text-sm">${court}</h4></div><div class="space-y-2">`;
        days.forEach((day, idx) => {
            const dayNum = dayNumbers[idx];
            const daySchedules = schedules.filter(s => s.days.includes(dayNum));
            if (daySchedules.length === 0) { html += `<div class="text-[10px] text-gray-500"><strong>${day}:</strong> Não configurado</div>`; return; }
            const lessons = daySchedules.filter(s => s.status === 'lesson');
            if (lessons.length === 0) { html += `<div class="text-[10px] text-gray-500"><strong>${day}:</strong> Sem aulas</div>`; return; }
            const lessonTimes = lessons.map(l => `${l.start} - ${l.end}`).join(', ');
            html += `<div class="text-[10px] p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg"><strong class="text-amber-300">${day}:</strong><span class="text-amber-200 ml-1">${lessonTimes}</span></div>`;
        });
        html += `</div></div>`;
    });
    container.innerHTML = html || '<div class="col-span-full text-center text-gray-500 py-8">Nenhum horário configurado</div>';
}

function renderLessonScheduleEditor() {
    const container = document.getElementById('lesson-schedule-editor');
    if (!container) return;
    let html = '';
    state.courts.forEach(court => {
        const schedules = FIXED_SCHEDULES[court] || [];
        const dayMap = {0:'Dom',1:'Seg',2:'Ter',3:'Qua',4:'Qui',5:'Sex',6:'Sáb'};
        html += `<div class="glass-card p-4 rounded-xl space-y-3"><div class="lesson-court-header" onclick="toggleLessonCourtEditor('${court}')"><div class="flex items-center gap-2"><i class="fas fa-table-tennis-paddle-ball text-indigo-400"></i><span class="font-bold text-white">${court}</span></div><i class="fas fa-chevron-down text-gray-400 transition-transform" id="chevron-${court}"></i></div><div id="editor-${court}" class="hidden space-y-2">`;
        schedules.forEach((schedule, idx) => {
            const daysList = schedule.days.map(d => dayMap[d] || d).join(', ');
            const statusLabel = schedule.status === 'lesson' ? 'AULA' : 'LIVRE';
            const statusColor = schedule.status === 'lesson' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
            html += `<div class="lesson-schedule-row"><div class="flex-1"><div class="text-[10px] text-gray-500 uppercase font-bold">Dias</div><div class="text-sm font-bold text-white">${daysList}</div></div><div class="flex-1"><div class="text-[10px] text-gray-500 uppercase font-bold">Horário</div><div class="text-sm font-bold text-white">${schedule.start} - ${schedule.end}</div></div><div class="flex-1"><div class="text-[10px] text-gray-500 uppercase font-bold">Status</div><span class="inline-block px-2 py-1 rounded-lg text-[10px] font-bold border ${statusColor}">${statusLabel}</span></div><div class="row-delete"><button onclick="removeLessonSchedule('${court}', ${idx})" class="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all border border-red-500/20"><i class="fas fa-trash-can text-xs"></i></button></div></div>`;
        });
        html += `<button onclick="addLessonSchedule('${court}')" class="w-full py-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold text-[10px] uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all"><i class="fas fa-plus mr-2"></i>Adicionar Período</button></div></div>`;
    });
    container.innerHTML = html;
}

function toggleLessonCourtEditor(court) {
    const editor = document.getElementById(`editor-${court}`);
    const chevron = document.getElementById(`chevron-${court}`);
    if (editor) {
        editor.classList.toggle('hidden');
        if (chevron) chevron.style.transform = editor.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
    }
}

function removeLessonSchedule(court, index) {
    if (!confirm('Deseja remover este período?')) return;
    if (FIXED_SCHEDULES[court] && FIXED_SCHEDULES[court][index]) {
        FIXED_SCHEDULES[court].splice(index, 1);
        renderLessonScheduleEditor();
        showToast('Período removido!', 'success');
    }
}

function addLessonSchedule(court) {
    const newSchedule = { days: [1, 2, 3, 4, 5], start: '08:00', end: '12:00', status: 'lesson' };
    if (!FIXED_SCHEDULES[court]) FIXED_SCHEDULES[court] = [];
    FIXED_SCHEDULES[court].push(newSchedule);
    renderLessonScheduleEditor();
    showToast('Período adicionado! Configure os horários.', 'info');
}

function saveFixedSchedules() {
    storage.set('rq_pro_fixed_schedules', JSON.stringify(FIXED_SCHEDULES));
    applyFixedSchedules();
    render();
    showToast('Horários de aulas salvos com sucesso!', 'success');
}

function resetFixedSchedules() {
    if (!confirm('Deseja resetar todos os horários para os padrões?')) return;
    storage.remove('rq_pro_fixed_schedules');
    location.reload();
}

// ============================================================
// SORTABLE INIT
// ============================================================
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

// ============================================================
// FORM HANDLERS
// ============================================================
const memberForm = document.getElementById('member-form');
if(memberForm) {
    memberForm.onsubmit = (e) => {
        e.preventDefault();
        const title = document.getElementById('mem-title').value.trim();
        const names = document.getElementById('mem-names').value.split(',').map(n => n.trim()).filter(n => n !== '');
        if(title && names.length > 0) {
            state.members[title] = names;
            save(); showToast(`Sócio ${title} cadastrado com sucesso!`, 'success');
            closeMemberModal(); document.getElementById('member-form').reset();
        }
    };
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
            if(players.length === 4) return showToast("Com 4 jogadores, selecione a opção Dupla!", "error");
            return showToast("Bate-bola permitido para 2 ou 3 jogadores!", "error");
        }
        const entry = {
            id: Date.now(), court: currentBookingMode === 'queue' ? null : document.getElementById('field-court').value,
            activity, registrationTime: document.getElementById('field-start').value, registrationDate: new Date().toLocaleDateString('pt-BR'),
            startTime: null, endTime: null, observation: document.getElementById('field-observation').value.trim(), players, titles, repeat
        };
        if(currentBookingMode === 'queue') {
            state.waitlist.push(entry); showToast("Adicionado à fila de espera!", "info"); save();
        } else processEntry(entry);
        closeBookingModal(); render();
    };
}

// ============================================================
// ATTACH ALL FUNCTIONS TO WINDOW
// ============================================================
window.state = state;
window.currentUser = currentUser;
window.USER_ROLES = USER_ROLES;
window.storage = storage;

window.showToast = showToast;
window.render = render;
window.save = save;
window.switchView = switchView;
window.loginAs = loginAs;
window.selectUser = selectUser;
window.confirmPin = confirmPin;
window.backToUsers = backToUsers;
window.logout = logout;
window.toggleMobileMenu = toggleMobileMenu;
window.openBookingModal = openBookingModal;
window.closeBookingModal = closeBookingModal;
window.openAdminAction = openAdminAction;
window.closeAdminModal = closeAdminModal;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.openUndoModal = openUndoModal;
window.closeUndoModal = closeUndoModal;
window.openMoveModal = openMoveModal;
window.closeMoveModal = closeMoveModal;
window.openWaitlistEditModal = openWaitlistEditModal;
window.closeWaitlistEditModal = closeWaitlistEditModal;
window.saveWaitlistEdit = saveWaitlistEdit;
window.openPasswordModal = openPasswordModal;
window.closePasswordModal = closePasswordModal;
window.savePassword = savePassword;
window.togglePwdVisibility = togglePwdVisibility;
window.checkPwdMatch = checkPwdMatch;
window.openReleaseLessonModal = openReleaseLessonModal;
window.closeReleaseLessonModal = closeReleaseLessonModal;
window.releaseLessonUntilPeriodEnd = releaseLessonUntilPeriodEnd;
window.releaseLessonUntilTime = releaseLessonUntilTime;
window.startMatch = startMatch;
window.releaseCourt = releaseCourt;
window.setCourtStatus = setCourtStatus;
window.processEntry = processEntry;
window.removeFromWaitlist = removeFromWaitlist;
window.moveToCourt = moveToCourt;
window.switchPublicTab = switchPublicTab;
window.changeAnalyticsPeriod = changeAnalyticsPeriod;
window.exportOccupancyByCourt = exportOccupancyByCourt;
window.exportOccupancyHourly = exportOccupancyHourly;
window.exportOccupancySummary = exportOccupancySummary;
window.exportOccupancyByActivity = exportOccupancyByActivity;
window.exportOccupancyComplete = exportOccupancyComplete;
window.renderPublicAnalytics = renderPublicAnalytics;
window.exportFullSystemData = exportFullSystemData;
window.exportDashboardData = exportDashboardData;
window.exportWithdrawals = exportWithdrawals;
window.exportMembers = members.exportMembers;
window.clearAllData = clearAllData;
window.toggleTheme = toggleTheme;
window.switchSettingsTab = switchSettingsTab;
window.switchLessonTab = switchLessonTab;
window.saveFixedSchedules = saveFixedSchedules;
window.resetFixedSchedules = resetFixedSchedules;
window.addLessonSchedule = addLessonSchedule;
window.searchMember = members.searchMember;
window.addNewMember = members.addNewMember;
window.deleteMemberTitle = members.deleteMemberTitle;
window.removeMemberName = members.removeMemberName;
window.addNameToTitle = members.addNameToTitle;
window.openMemberModal = openMemberModal;
window.closeMemberModal = closeMemberModal;
window.syncMembersFromAdmin = members.syncMembersFromAdmin;
window.updateSettings = updateSettings;
window.revertHistoryEntry = revertHistoryEntry;
window.toggleDuration = toggleDuration;
window.saveEdit = saveEdit;
window.closeAllActivities = closeAllActivities;
window.togglePerformanceMode = togglePerformanceMode;
window.toggleLessonCourtEditor = toggleLessonCourtEditor;
window.removeLessonSchedule = removeLessonSchedule;
window.setPwdTarget = setPwdTarget;
window.updateActivityOptions = updateActivityOptions;
window.initSortable = initSortable;
window.renderLessonScheduleEditor = renderLessonScheduleEditor;
window.renderMembersList = members.renderMembersList;

// ============================================================
// BOOTSTRAP
// ============================================================
function bootstrap() {
    const savedUser = storage.get('rq_pro_user');
    if (savedUser && USER_ROLES[savedUser]) {
        loginAs(savedUser);
    } else {
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        const loginScreen = document.getElementById('login-screen');
        if (loginScreen) {
            loginScreen.style.display = 'flex';
            gsap.fromTo(loginScreen, { opacity: 0 }, { opacity: 1, duration: 0.4 });
        }
    }
    if (state.settings.firebaseConfig) connectFirebase();

    if (!state.settings.performanceMode) {
        try { initTennis3D(); } catch (e) { console.error("Erro na inicialização 3D:", e); }
    }

    syncInternetTime();
    setInterval(syncInternetTime, 10 * 60 * 1000);

    setInterval(() => {
        const now = getAccurateNow();
        const clock = document.getElementById('public-clock');
        if(clock) clock.innerText = now.toLocaleTimeString('pt-BR');
        const dateEl = document.getElementById('public-date');
        const weekdayEl = document.getElementById('public-weekday');
        if(dateEl) dateEl.innerText = now.toLocaleDateString('pt-BR');
        if(weekdayEl) weekdayEl.innerText = now.toLocaleDateString('pt-BR', { weekday: 'long' });
        if(state.settings.theme === 'auto') applyTheme();
    }, 1000);

    setInterval(() => {
        applyFixedSchedules();
        closeAllActivities();
        render();
    }, 30000);

    applyTheme();
    applyFixedSchedules();
}

document.addEventListener('DOMContentLoaded', bootstrap);

window.addEventListener('load', () => {
    renderLessonScheduleEditor();
});

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
