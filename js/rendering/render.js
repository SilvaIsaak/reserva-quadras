// Renderização das views (público, admin, dashboard) e navegação entre telas
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
    saveLocal();
    dbSaveSettings({ theme: state.settings.theme });

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

if(!state.courts.includes("Quadra Rápida")) {
    state.courts.push("Quadra Rápida");
    storage.set('rq_pro_courts', JSON.stringify(state.courts));
}

// Datas dinâmicas via funções getTodayDate() e getWeekdayName()

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


let renderRequested = false;
function render() {
    if (renderRequested) return;
    renderRequested = true;
    requestAnimationFrame(() => {
        if(state.settings.performanceMode) document.body.classList.add('performance-mode');
        else document.body.classList.remove('performance-mode');
        
        renderPublic(); renderAdmin(); renderActivity(); updateDashboard(); updateNavbarStatus(); renderHomeScoreboard();
        const clubNameEl = document.getElementById('set-club-name');
        const courtsEl = document.getElementById('set-courts');
        const colorEl = document.getElementById('set-color');
        const membersEl = document.getElementById('set-members');
        const performanceEl = document.getElementById('set-performance');
        // render() roda a cada evento de tempo real (ex.: alguém libera uma
        // quadra em outro dispositivo) — sem o check de foco, digitar em
        // Configurações enquanto isso acontece apaga o que já foi digitado.
        if(clubNameEl && document.activeElement !== clubNameEl) clubNameEl.value = state.settings.clubName;
        if(courtsEl && document.activeElement !== courtsEl) courtsEl.value = state.courts.join(', ');
        if(colorEl && document.activeElement !== colorEl) colorEl.value = state.settings.primaryColor;
        if(membersEl && document.activeElement !== membersEl) membersEl.value = JSON.stringify(state.members, null, 4);
        if(performanceEl) performanceEl.checked = state.settings.performanceMode;
        renderRequested = false;
    });
}


function updateDashboard() {
    const todayStr = getTodayDate();
    const todayHistory = state.history.filter(h => h.date === todayStr);
    const todayWithdrawals = state.withdrawals.filter(w => w.withdrawnDate === todayStr);
    // Contar quadras únicas, não reservas — nada impede hoje duas reservas
    // apontarem para a mesma quadra (sync duplicada/corrida entre dispositivos),
    // e nesse caso .length contava as duas, passando do total real de quadras.
    const occupied = new Set(state.bookings.filter(b => !b.type || b.type === 'lesson').map(b => b.court)).size;
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
    
    // Ignorar marcadores automáticos: aulas entram no histórico com players: ["AULA"]
    // e bloqueios com ["BLOCKED"]/["RAIN"], que venciam qualquer sócio real na contagem.
    // O `|| []` também evita quebrar o dashboard num registro sem jogadores.
    const playerCounts = {};
    todayHistory.forEach(h => (h.players || []).forEach(p => {
        const key = String(p).toUpperCase();
        if (key === 'AULA' || NON_PLAY_ACTIVITIES.includes(key)) return;
        playerCounts[p] = (playerCounts[p] || 0) + 1;
    }));
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
    
    const { startDate, endDate } = buildDateRange(30);
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
                                    <span>Manhã</span>
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
                                <span>Manhã</span>
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

// exportDashboardData: versão aprimorada G.2 declarada abaixo.
// exportWithdrawals: versão aprimorada G.5 declarada abaixo.


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
                <p class="text-sm font-bold text-white">${escapeHtml(r.players[0])}${r.players.length > 1 ? ' + ' + (r.players.length - 1) : ''}</p>
                <p class="text-[10px] text-gray-500 uppercase font-black">${escapeHtml(r.court)} • ${r.startTime} - ${r.endTime}</p>
            </div>
            <div class="text-right">
                <p class="text-[9px] font-black text-gray-600 uppercase tracking-tighter">${r.date}</p>
            </div>
        </div>
    `).join('') || '<p class="text-center text-gray-600 font-bold py-10">Nenhum histórico disponível.</p>';
}

// releaseCourt original removido para usar a versão aprimorada abaixo.


function renderAdmin() {
    const grid = document.getElementById('admin-grid');
    if (!grid) return;
    grid.innerHTML = state.courts.map(c => {
        const b = state.bookings.find(book => book.court === c);
        let stateClass = "is-free";
        if (b) {
            if (b.type === 'blocked') stateClass = "is-blocked";
            else if (b.type === 'lesson') stateClass = "is-lesson";
            else if (b.type === 'rain') stateClass = "is-rain";
            else if (b.type === 'tournament') stateClass = "is-tournament";
            else stateClass = "is-busy";
        }

        // H.1: Badge de aula ignorada
        const fixedStatus = getFixedStatus(c);
        const ignoredBadge = (b && ['blocked','rain','tournament'].includes(b.type) && fixedStatus === 'lesson')
            ? `<p class="text-[9px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-1">⚠ Aula ignorada — quadra bloqueada</p>`
            : '';

        // H.4: Próxima transição
        const nextTrans = getNextTransition(c);
        const transitionBadge = nextTrans
            ? `<p class="text-[9px] font-bold ${nextTrans.color}">${nextTrans.label}</p>`
            : '';

        return `
            <div class="court-card ${stateClass} court-drop-zone" data-court="${escapeHtml(c)}">
                <div class="court-card-head">
                    <div>
                        <span class="court-card-eyebrow">Quadra</span>
                        <span class="court-card-name">${escapeHtml(c)}</span>
                    </div>
                    <div class="court-card-actions">
                        ${b ? `<button onclick="openEditModal('${escapeJsAttr(c)}')" class="court-card-icon-btn" title="Editar"><i class="fas fa-pen text-[10px]"></i></button>` : ''}
                        <button onclick="openAdminAction('${escapeJsAttr(c)}')" class="court-card-icon-btn" title="Status manual">
                            <i class="fas fa-cog text-[10px]"></i>
                        </button>
                    </div>
                </div>
                <div class="flex-1 pointer-events-none flex flex-col gap-2">
                    ${b ? `
                        <p class="court-card-activity">${b.type === 'rain' ? 'CHUVA' : b.type === 'lesson' ? 'AULA' : (b.type ? b.type.toUpperCase() : escapeHtml(b.activity))}</p>
                        <div class="court-card-players">
                            ${b.players.map(p => `<div class="truncate">${escapeHtml(p)}</div>`).join('')}
                        </div>
                        <div class="court-card-meta data-mono">
                            <span>Insc <strong>${b.registrationTime || '--:--'}</strong></span>
                            <span>Início <strong>${b.startTime || '--:--'}</strong></span>
                        </div>
                        ${b.observation ? `<p class="text-[10px] font-semibold text-[var(--clay)] border-l-2 border-[var(--clay-border)] pl-2 py-0.5 italic">"${escapeHtml(b.observation)}"</p>` : ''}
                        ${ignoredBadge}
                        ${transitionBadge}
                    ` : `
                        <p class="court-card-empty">Disponível para uso</p>
                        ${transitionBadge}
                    `}
                </div>
                <div class="court-card-actions-row pointer-events-auto">
                    ${b ? (!b.startTime ? `
                        <button onclick="startMatch('${escapeJsAttr(c)}')" class="court-card-btn court-card-btn--start">Iniciar</button>
                        <button onclick="releaseCourt('${escapeJsAttr(c)}')" class="court-card-btn court-card-btn--end">Encerrar</button>
                        <button onclick="openUndoModal('${escapeJsAttr(c)}')" class="court-card-btn court-card-btn--undo"><i class="fas fa-rotate-left"></i> Reverter</button>
                    ` : `
                        <button onclick="releaseCourt('${escapeJsAttr(c)}')" class="court-card-btn court-card-btn--end" style="grid-column: 1 / -1;">Encerrar</button>
                        <button onclick="openUndoModal('${escapeJsAttr(c)}')" class="court-card-btn court-card-btn--undo"><i class="fas fa-rotate-left"></i> Reverter</button>
                    `) : `
                        <button onclick="openUndoModal('${escapeJsAttr(c)}')" class="court-card-btn court-card-btn--undo"><i class="fas fa-rotate-left"></i> Reverter último</button>
                    `}
                </div>
            </div>
        `;
    }).join('');

    // Manter waitlist render (reaproveitado do original)
    const adminWait = document.getElementById('admin-waitlist');
    if (!adminWait) return;
    adminWait.innerHTML = state.waitlist.map((item, i) => `<div class="queue-item" data-id="${item.id}"><span class="queue-position data-mono">${i+1}</span><div class="queue-body"><div class="queue-players">${item.players.map(p => `<div class="truncate">${escapeHtml(p)}</div>`).join('')}</div><div class="queue-meta"><span>${escapeHtml(item.activity)}</span><span class="data-mono">${item.registrationTime}</span>${item.repeat ? '<span class="px-2 py-0.5 bg-red-500/20 text-red-300 rounded-md border border-red-500/30">Sem preferência</span>' : ''}</div></div><div class="queue-actions"><button onclick="openWaitlistEditModal('${item.id}')" class="court-card-icon-btn" title="Editar Grupo"><i class="fas fa-pen text-[10px]"></i></button><button onclick="openMoveModal('${item.id}')" class="court-card-icon-btn" title="Mover para Quadra"><i class="fas fa-right-left text-[10px]"></i></button><button onclick="removeFromWaitlist('${item.id}')" class="court-card-icon-btn" style="color:#f87171" title="Remover da Fila"><i class="fas fa-trash-can text-[10px]"></i></button></div></div>`).join('') || '<div class="col-span-full py-8 text-center text-gray-400 font-bold uppercase tracking-widest text-xs">Nenhum grupo aguardando</div>';
    initSortable();
}

// Faixa de placar do Início — visão rápida de todas as quadras, sem o
// detalhe operacional completo do Admin (que fica em renderAdmin()).
function renderHomeScoreboard() {
    const el = document.getElementById('home-scoreboard');
    if (!el) return;
    el.innerHTML = state.courts.map(c => {
        const b = state.bookings.find(book => book.court === c);
        let stateClass = 'is-free', label = 'Livre', time = '--:--';
        if (b) {
            if (['blocked', 'rain', 'tournament'].includes(b.type)) {
                stateClass = 'is-off';
                label = b.type === 'rain' ? 'Chuva' : b.type === 'tournament' ? 'Torneio' : 'Bloqueada';
                time = b.startTime || '--:--';
            } else if (b.type === 'lesson') {
                stateClass = 'is-lesson'; label = 'Aula'; time = b.startTime || '--:--';
            } else {
                stateClass = 'is-busy'; label = 'Ocupada'; time = b.startTime || '--:--';
            }
        }
        return `<div class="scoreboard-chip ${stateClass}" onclick="switchView('admin')">
            <div class="chip-name">${escapeHtml(c)}</div>
            <div class="chip-time">${time}</div>
            <div class="chip-label">${label}</div>
        </div>`;
    }).join('');
}

// G.4: exportOccupancyComplete com seção "Resumo por Dia da Semana"
