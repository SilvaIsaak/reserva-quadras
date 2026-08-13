// Cálculo de ocupação/analytics e exportações (CSV/JSON)
function exportFullSystemData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 4));
    const link = document.createElement('a');
    link.setAttribute("href", dataStr); link.setAttribute("download", `backup_sistema_quadras_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link); link.click(); link.remove();
    showToast("Backup do sistema concluído!", "success");
}

const PERIODS = {
    morning: { name: "Manhã", startHour: 6, startMinute: 30, endHour: 12, endMinute: 30, totalMinutes: 360 },
    afternoon: { name: "Tarde", startHour: 12, startMinute: 31, endHour: 18, endMinute: 30, totalMinutes: 360 },
    evening: { name: "Noite", startHour: 18, startMinute: 31, endHour: 22, endMinute: 0, totalMinutes: 210 }
};

// Status que representam indisponibilidade da quadra, não uso por sócios.
const NON_PLAY_ACTIVITIES = ['BLOCKED', 'RAIN', 'TOURNAMENT'];

// Constrói uma janela de N dias corridos terminando agora, com o início
// normalizado à meia-noite — necessário para o denominador de dias fechar.
function buildDateRange(days) {
    const end = getAccurateNow();
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (Math.max(1, days) - 1));
    return { startDate: start, endDate: end };
}

// Dias de calendário no intervalo, inclusive nas duas pontas.
// A conta anterior (`Math.ceil(diff / 1 dia) + 1`) devolvia 2 para o filtro
// "Hoje" em qualquer horário do dia, dobrando o divisor e cortando a taxa
// de ocupação pela metade.
function countDaysInRange(startDate, endDate) {
    const s = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const e = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

function calculateRollingOccupancyAnalytics() {
    const { startDate, endDate } = buildDateRange(30);
    return calculateOccupancyAnalytics(startDate, endDate);
}

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

function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    const [d, m, y] = parts.map(Number);
    if (!d || !m || !y) return null;
    // Construir no fuso local. `new Date("2026-08-06")` é interpretado como UTC,
    // o que no horário de Brasília cai no dia anterior às 21:00 — deslocando o
    // gráfico por dia da semana em 1 dia e zerando o KPI "Jogos Hoje".
    return new Date(y, m - 1, d);
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
        // Bloqueio e chuva são indisponibilidade, não uso: contá-los como ocupação
        // fazia uma quadra em manutenção aparecer como 100% ocupada.
        if (NON_PLAY_ACTIVITIES.includes(String(h.activity || '').toUpperCase())) return false;
        const [d, m, y] = h.date.split('/').map(Number);
        const histDate = new Date(y, m - 1, d);
        return histDate >= startDate && histDate <= endDate;
    });
    
    const daysInRange = countDaysInRange(startDate, endDate);
    
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
                ? Math.min((court.periods[period].occupiedMinutes / totalPeriodMinutes) * 100, 100) 
                : 0;
            court.lessonPeriods[period].occupancyRate = totalPeriodMinutes > 0 
                ? Math.min((court.lessonPeriods[period].occupiedMinutes / totalPeriodMinutes) * 100, 100) 
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
    const lessonsRate = totalAvailableMinutes > 0 ? Math.min((activityData.lessons.totalMinutes / totalAvailableMinutes) * 100, 100) : 0;
    const otherRate = totalAvailableMinutes > 0 ? Math.min((activityData.other.totalMinutes / totalAvailableMinutes) * 100, 100) : 0;
    
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
    const { startDate, endDate } = buildDateRange(30);
    const analytics = calculateOccupancyAnalytics(startDate, endDate);
    
    if (analytics.courts.length === 0) return showToast("Nenhum dado de ocupação para exportar!", "warning");
    
    const sep = ";";
    const headers = [
        "Quadra", 
        "Total de Jogo (min)", 
        "Total de Jogo (horas)",
        "Ocupação Manhã (%)", 
        "Ocupação Tarde (%)", 
        "Ocupação Noite (%)",
        "Minutos Manhã",
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
    showToast("Dados de ocupação por quadra exportados!", "success");
}

function exportOccupancyHourly() {
    const { startDate, endDate } = buildDateRange(30);
    const analytics = calculateOccupancyAnalytics(startDate, endDate);
    
    if (analytics.courts.length === 0) return showToast("Nenhum dado de ocupação para exportar!", "warning");
    
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
    const { startDate, endDate } = buildDateRange(30);
    const analytics = calculateOccupancyAnalytics(startDate, endDate);
    
    if (analytics.courts.length === 0) return showToast("Nenhum dado de ocupação para exportar!", "warning");
    
    const sep = ";";
    const content = [
        ["RELATÓRIO DE OCUPAÇÃO DE QUADRAS"],
        [""],
        ["Período Analisado", `${startDate.toLocaleDateString("pt-BR")} - ${endDate.toLocaleDateString("pt-BR")}`],
        [""],
        ["INDICADORES GERAIS"],
        ["Taxa Média de Ocupação", `${analytics.overall.averageOccupancyRate.toFixed(2)}%`],
        ["Total de Horas de Jogo", formatHours(analytics.overall.totalPlayMinutes)],
        ["Total de Quadras", analytics.courts.length],
        [""],
        ["DADOS POR TIPO DE ATIVIDADE"],
        ["Aulas - Total de Horas", formatHours(analytics.activityData.lessons.totalMinutes)],
        ["Aulas - Número de Sessões", analytics.activityData.lessons.count],
        ["Aulas - Taxa de Ocupação", `${analytics.activityData.lessonsRate.toFixed(2)}%`],
        ["Outras Atividades - Total de Horas", formatHours(analytics.activityData.other.totalMinutes)],
        ["Outras Atividades - Número de Sessões", analytics.activityData.other.count],
        ["Outras Atividades - Taxa de Ocupação", `${analytics.activityData.otherRate.toFixed(2)}%`],
        [""],
        ["TAXA MÉDIA POR PERÍODO"],
        ["Manhã (06:30-12:30)", `${analytics.overall.averageByPeriod.morning.toFixed(2)}%`],
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
    showToast("Resumo de ocupação exportado!", "success");
}

function exportOccupancyByActivity() {
    const { startDate, endDate } = buildDateRange(30);
    const analytics = calculateOccupancyAnalytics(startDate, endDate);
    
    if (analytics.courts.length === 0) return showToast("Nenhum dado de ocupação para exportar!", "warning");
    
    const sep = ";";
    const headers = [
        "Tipo de Atividade", 
        "Total de Horas", 
        "Total de Minutos",
        "Número de Sessões",
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
    showToast("Dados de ocupação por atividade exportados!", "success");
}

// exportOccupancyComplete: versão aprimorada G.4 declarada abaixo.

function importFullSystemData(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedState = JSON.parse(e.target.result);
            if (confirm("Isso irá substituir TODOS os dados atuais. Deseja continuar?")) {
                state = { ...state, ...importedState };
                saveLocal();
                dbImportFullSystemData(importedState).then(loadStateFromSupabase);
                render();
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
            if(b.type === 'blocked') { bgClass = "status-blocked"; statusLabel = "BLOQUEADA"; players = "MANUTENÇÃO"; statusColor = "bg-white/20 text-white"; }
            else if(b.type === 'lesson') { bgClass = "status-lesson"; statusLabel = "AULA"; players = "QUADRA EM AULA"; statusColor = "bg-white/20 text-white"; }
            else if(b.type === 'rain') { bgClass = "status-rain"; statusLabel = "CHUVA"; players = "QUADRA MOLHADA"; statusColor = "bg-white/20 text-white"; }
            else if(b.type === 'tournament') { bgClass = "status-tournament"; statusLabel = "TORNEIO"; players = "COMPETIÇÃO ATIVA"; statusColor = "bg-white/20 text-white"; }
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
                                <p class="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Início</p>
                                <p class="text-2xl font-bold text-emerald-400 tracking-tight">${b.startTime || '--:--'}</p>
                            </div>
                            ${b.endTime ? `
                                <div class="text-right">
                                    <p class="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Previsão</p>
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
// ABA PÚBLICO — Sub-tabs: Status | Análise
// ============================================================

let currentAnalyticsPeriod = 'rolling';

function switchPublicTab(tab) {
    const panelStatus = document.getElementById('pub-panel-status');
    const panelAnalytics = document.getElementById('pub-panel-analytics');
    const btnStatus = document.getElementById('pub-tab-status');
    const btnAnalytics = document.getElementById('pub-tab-analytics');
    if (!panelStatus || !panelAnalytics) return;

    if (tab === 'status') {
        panelStatus.classList.remove('hidden');
        panelAnalytics.classList.add('hidden');
        btnStatus.classList.add('bg-indigo-600','text-white','shadow-lg');
        btnStatus.classList.remove('text-gray-400','hover:text-white','hover:bg-white/5');
        btnAnalytics.classList.remove('bg-indigo-600','text-white','shadow-lg');
        btnAnalytics.classList.add('text-gray-400','hover:text-white','hover:bg-white/5');
    } else {
        panelStatus.classList.add('hidden');
        panelAnalytics.classList.remove('hidden');
        btnAnalytics.classList.add('bg-indigo-600','text-white','shadow-lg');
        btnAnalytics.classList.remove('text-gray-400','hover:text-white','hover:bg-white/5');
        btnStatus.classList.remove('bg-indigo-600','text-white','shadow-lg');
        btnStatus.classList.add('text-gray-400','hover:text-white','hover:bg-white/5');
        renderPublicAnalytics();
    }
}

function changeAnalyticsPeriod(period) {
    currentAnalyticsPeriod = period;
    
    // Atualizar botões
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
            'day': 'Hoje', 'week': 'Últimos 7 dias', 'rolling': 'Últimos 30 dias' };
        subtitle.innerText = `Dados: ${labels[period]} — transparência para os sócios`;
        
        if (labelTotal) labelTotal.innerText = period === 'day' ? 'Jogos Hoje' : (period === 'week' ? 'Jogos na Semana' : 'Jogos nos Últimos 30 dias');
        if (labelHours) labelHours.innerText = period === 'day' ? 'Horas Hoje' : (period === 'week' ? 'Horas na Semana' : 'Horas nos Últimos 30 dias');
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
        
        // Janelas normalizadas: 1 = apenas hoje, 7 = últimos 7 dias, 30 = últimos 30 dias.
        // O início vai para a meia-noite, senão o primeiro dia entra só pela metade
        // e o divisor de dias não fecha com os dados realmente incluídos.
        const _days = currentAnalyticsPeriod === 'day' ? 1 : (currentAnalyticsPeriod === 'week' ? 7 : 30);
        const _range = buildDateRange(_days);
        startDate = _range.startDate;
        endDate = _range.endDate;
        analytics = calculateOccupancyAnalytics(startDate, endDate);
    }

    // Função de cor de barra
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

    // Dia mais movido ou Horário de Pico
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

    // ---- Ocupação por quadra ----
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

    // ---- Período (Manhã/Tarde/Noite) ----
    const periodContainer = document.getElementById('pub-period-bars');
    if (periodContainer) {
        const daysInRange = countDaysInRange(startDate, endDate);
        const periods = [
            { name: 'Manhã', key: 'morning', icon: 'fa-sun', color: 'text-amber-400', bg: 'bg-amber-500' },
            { name: 'Tarde', key: 'afternoon', icon: 'fa-cloud-sun', color: 'text-orange-400', bg: 'bg-orange-500' },
            { name: 'Noite', key: 'evening', icon: 'fa-moon', color: 'text-indigo-400', bg: 'bg-indigo-500' }
        ];
        periodContainer.innerHTML = '';
        periods.forEach(p => {
            const totalMins = PERIODS[p.key].totalMinutes * daysInRange * analytics.courts.length;
            const occupied = analytics.courts.reduce((sum, c) => sum + c.periods[p.key].occupiedMinutes, 0);
            const rate = totalMins > 0 ? Math.min((occupied / totalMins) * 100, 100) : 0;
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

    // ---- Mix de Atividades ----
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

    // ---- Barras por dia da semana ou por hora ----
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
                if (hour < 6 || hour > 22) return ''; // Só mostra horário de funcionamento
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
                    ? `📅 O horário de pico foi às ${peakHour}:00 com ${Math.max(...hourlyCounts)} atividades.`
                    : '📅 Nenhuma atividade registrada no período.';
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
                    ? `📅 ${busiest.name} é o dia mais ativo do clube com ${busiest.count} atividades no período.`
                    : '📅 Nenhuma atividade registrada no período.';
            }
        }
    }
}

// renderAdmin e releaseCourt foram movidos para as seções de tarefas abaixo para evitar duplicatas.


function exportDashboardData() {
    if (state.history.length === 0) return showToast("Nenhum dado para exportar!", "warning");
    const sep = ";";
    const headers = [
        "ID", "Data do Jogo", "Dia da Semana", "Quadra", "Jogadores", "Títulos",
        "Atividade", "Data da Inscrição", "Hora da Inscrição", "Hora de Início", "Hora de Fim",
        "Tempo de Espera (min)", "Tempo de Jogo (min)", "Observação", "Repetido",
        // Novas colunas G.2
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

/** G.5: exportWithdrawals com novas colunas */
function exportWithdrawals() {
    if (state.withdrawals.length === 0) return showToast("Nenhuma desistência para exportar!", "warning");
    const sep = ";";
    const headers = ["Data Inscrição", "Hora Inscrição", "Data Desistência", "Hora Desistência", "Jogadores", "Atividade", "Observação",
        "Tempo na Fila (min)", "Número de Jogadores"]; // Novas colunas G.5
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

/** G.3: Atualiza KPIs de período, quadra ociosa e pico de espera no dashboard */
function updateDashboardExtra() {
    const todayDate = getTodayDate();
    const todayHistory = state.history.filter(h => h.date === todayDate);

    // Média por período
    const periods = { morning: [], afternoon: [], evening: [] };
    todayHistory.forEach(h => {
        const p = getPeriodoStr(h.startTime);
        if (p === 'Manhã') periods.morning.push(h.playDuration || 0);
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
// TAREFA H — FIXED_SCHEDULES melhorias
// ============================================================

// H.2: Fins de semana já incluídos na constante FIXED_SCHEDULES.

// H.3: Variável para quadra sendo liberada via modal

function exportOccupancyComplete() {
    const { startDate, endDate } = buildDateRange(30);
    const analytics = calculateOccupancyAnalytics(startDate, endDate);
    if (analytics.courts.length === 0) return showToast("Nenhum dado de ocupação para exportar!", "warning");

    const sep = ";";
    let allContent = [];

    allContent.push(["RELATÓRIO COMPLETO DE OCUPAÇÃO DAS QUADRAS"]);
    allContent.push(["Período Analisado", `${startDate.toLocaleDateString("pt-BR")} - ${endDate.toLocaleDateString("pt-BR")}`]);
    allContent.push(["Data de Geração", new Date().toLocaleString("pt-BR")]);
    allContent.push([""]);

    allContent.push(["=================================================================="]);
    allContent.push(["1. RESUMO GERAL"]);
    allContent.push(["=================================================================="]);
    allContent.push([""]);
    allContent.push(["Descrição", "Valor", "Observação"]);
    allContent.push(["Total de Quadras", analytics.courts.length, ""]);
    allContent.push(["Total de Horas de Jogo", formatHours(analytics.overall.totalPlayMinutes), `Total: ${analytics.overall.totalPlayMinutes} minutos`]);
    allContent.push(["Taxa Média de Ocupação", `${analytics.overall.averageOccupancyRate.toFixed(2)}%`, "Cálculo: Média das taxas dos 3 períodos"]);
    allContent.push([""]);

    allContent.push(["=================================================================="]);
    allContent.push(["2. RESUMO POR PERÍODO DO DIA"]);
    allContent.push(["=================================================================="]);
    allContent.push([""]);
    allContent.push(["Período", "Horário", "Minutos Totais Disponíveis", "Minutos Ocupados", "Taxa de Ocupação (%)", "Fórmula"]);
    const daysInRange = countDaysInRange(startDate, endDate);
    const morningTotalMin = PERIODS.morning.totalMinutes * daysInRange * analytics.courts.length;
    const morningOccupiedMin = analytics.courts.reduce((sum, c) => sum + c.periods.morning.occupiedMinutes, 0);
    const morningRate = morningTotalMin > 0 ? Math.min((morningOccupiedMin / morningTotalMin) * 100, 100) : 0;
    const afternoonTotalMin = PERIODS.afternoon.totalMinutes * daysInRange * analytics.courts.length;
    const afternoonOccupiedMin = analytics.courts.reduce((sum, c) => sum + c.periods.afternoon.occupiedMinutes, 0);
    const afternoonRate = afternoonTotalMin > 0 ? Math.min((afternoonOccupiedMin / afternoonTotalMin) * 100, 100) : 0;
    const eveningTotalMin = PERIODS.evening.totalMinutes * daysInRange * analytics.courts.length;
    const eveningOccupiedMin = analytics.courts.reduce((sum, c) => sum + c.periods.evening.occupiedMinutes, 0);
    const eveningRate = eveningTotalMin > 0 ? Math.min((eveningOccupiedMin / eveningTotalMin) * 100, 100) : 0;
    allContent.push(["Manhã", "06:30 - 12:30", morningTotalMin, morningOccupiedMin, morningRate.toFixed(2), "Minutos Ocupados / Minutos Totais * 100"]);
    allContent.push(["Tarde", "12:31 - 18:30", afternoonTotalMin, afternoonOccupiedMin, afternoonRate.toFixed(2), "Minutos Ocupados / Minutos Totais * 100"]);
    allContent.push(["Noite", "18:31 - 22:00", eveningTotalMin, eveningOccupiedMin, eveningRate.toFixed(2), "Minutos Ocupados / Minutos Totais * 100"]);
    allContent.push([""]);

    allContent.push(["=================================================================="]);
    allContent.push(["3. DADOS POR TIPO DE ATIVIDADE"]);
    allContent.push(["=================================================================="]);
    allContent.push([""]);
    allContent.push(["Tipo de Atividade", "Total de Horas", "Total de Minutos", "Número de Sessões", "Percentual do Total (%)", "Fórmula"]);
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
    allContent.push(["Quadra", "Total de Minutos", "Total de Horas", "Minutos Manhã", "Minutos Tarde", "Minutos Noite", "Ocupação Manhã (%)", "Ocupação Tarde (%)", "Ocupação Noite (%)", "Taxa Média (%)"]);
    analytics.courts.forEach(court => {
        const avgRate = (court.periods.morning.occupancyRate + court.periods.afternoon.occupancyRate + court.periods.evening.occupancyRate) / 3;
        allContent.push([court.courtName, court.totalPlayMinutes, formatHours(court.totalPlayMinutes), court.periods.morning.occupiedMinutes, court.periods.afternoon.occupiedMinutes, court.periods.evening.occupiedMinutes, court.periods.morning.occupancyRate.toFixed(2), court.periods.afternoon.occupancyRate.toFixed(2), court.periods.evening.occupancyRate.toFixed(2), avgRate.toFixed(2)]);
    });
    allContent.push([""]);

    allContent.push(["=================================================================="]);
    allContent.push(["5. OCUPAÇÃO DE AULAS POR QUADRA"]);
    allContent.push(["=================================================================="]);
    allContent.push([""]);
    allContent.push(["Quadra", "Total de Minutos em Aulas", "Total de Horas em Aulas", "Minutos Manhã (Aulas)", "Minutos Tarde (Aulas)", "Minutos Noite (Aulas)", "Ocupação Manhã (%)", "Ocupação Tarde (%)", "Ocupação Noite (%)"]);
    analytics.courts.forEach(court => {
        if (court.totalLessonMinutes > 0) {
            allContent.push([court.courtName, court.totalLessonMinutes, formatHours(court.totalLessonMinutes), court.lessonPeriods.morning.occupiedMinutes, court.lessonPeriods.afternoon.occupiedMinutes, court.lessonPeriods.evening.occupiedMinutes, court.lessonPeriods.morning.occupancyRate.toFixed(2), court.lessonPeriods.afternoon.occupancyRate.toFixed(2), court.lessonPeriods.evening.occupancyRate.toFixed(2)]);
        }
    });
    allContent.push([""]);

    // G.4: Nova seção — Resumo por Dia da Semana
    allContent.push(["=================================================================="]);
    allContent.push(["6. LEGENDA E MÉTODOS DE CÁLCULO"]);
    allContent.push(["=================================================================="]);
    allContent.push([""]);
    allContent.push(["Conceito", "Definição"]);
    allContent.push(["Minutos Totais Disponíveis", "Número de minutos que a quadra estava disponível no período analisado"]);
    allContent.push(["Minutos Ocupados", "Número de minutos efetivamente utilizados por jogadores ou aulas"]);
    allContent.push(["Taxa de Ocupação (%)", "(Minutos Ocupados / Minutos Totais Disponíveis) × 100"]);
    allContent.push(["Taxa Média", "Média aritmética das taxas de ocupação dos três períodos do dia"]);
    allContent.push([""]);

    allContent.push(["=================================================================="]);
    allContent.push(["7. RESUMO POR DIA DA SEMANA (últimos 30 dias)"]);
    allContent.push(["=================================================================="]);
    allContent.push([""]);
    allContent.push(["Dia da Semana", "Total de Atividades", "Minutos Totais", "Taxa de Ocupação Média (%)"]);
    const diasSemana = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
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
    showToast("Relatório completo exportado com sucesso!", "success");
}
// ============================================================
// EDIÇÃO DE GRUPO NA FILA DE ESPERA
// ============================================================
