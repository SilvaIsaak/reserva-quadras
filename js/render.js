// NÃO CONECTADO AO index.html — referência para modularização futura, ver prompt-reorganizacao-reservaquadras.md

import { state } from './state.js';
import { getFixedStatus, getNextTransition, timeToMinutes } from './schedules.js';
import { getTodayDate, showToast, parseDate } from './utils.js';

export const PERIODS = {
    morning: { startHour: 6, startMinute: 30, endHour: 12, endMinute: 30, totalMinutes: 360 },
    afternoon: { startHour: 12, startMinute: 31, endHour: 18, endMinute: 30, totalMinutes: 359 },
    evening: { startHour: 18, startMinute: 31, endHour: 22, endMinute: 0, totalMinutes: 209 }
};

export function calculateRollingOccupancyAnalytics() {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 28 * 24 * 60 * 60 * 1000);
    return calculateOccupancyAnalytics(startDate, endDate);
}

export function formatHours(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
}

export function calculateOccupancyAnalytics(startDate, endDate) {
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
        const histDate = parseDate(h.date);
        if (!histDate) return false;
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

export function exportOccupancyByCourt() {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
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

export function exportOccupancyHourly() {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
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

export function exportOccupancySummary() {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
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

export function exportOccupancyByActivity() {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
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

let renderRequested = false;

export function render(callbacks) {
    if (renderRequested) return;
    renderRequested = true;
    requestAnimationFrame(() => {
        if(state.settings.performanceMode) document.body.classList.add('performance-mode');
        else document.body.classList.remove('performance-mode');
        
        renderPublic(); 
        renderAdmin(callbacks); 
        renderActivity(); 
        updateDashboard(); 
        updateNavbarStatus();
        if (window.renderPublicAnalytics) window.renderPublicAnalytics();

        if (callbacks && callbacks.onRender) callbacks.onRender();
        renderRequested = false;
    });
}

export function updateNavbarStatus() {
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

export function renderPublic() {
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
                    <div class="mb-4"><span class="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold text-gray-300 uppercase tracking-widest inline-flex items-center"><i class="fas fa-play-circle mr-2 text-indigo-400"></i>${b && !b.type ? b.activity : 'Status'}</span></div>
                    <div class="text-lg font-bold text-white leading-tight space-y-1">${players}</div>
                </div>
                <div class="mt-auto">
                    ${b && !b.type ? `<div class="flex justify-between items-center border-t border-white/10 pt-4 mt-2"><div class="flex flex-col"><p class="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Início</p><p class="text-2xl font-bold text-emerald-400 tracking-tight">${b.startTime || '--:--'}</p></div>${b.endTime ? `<div class="text-right"><p class="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Previsão</p><p class="text-base font-bold text-purple-400 opacity-90">${b.endTime}</p></div>` : ''}</div>` : ''}
                    ${b && b.observation ? `<p class="text-xs font-medium text-gray-300 border-l-2 border-indigo-400 pl-3 py-1 bg-white/5 rounded-r-lg italic mt-3">${b.observation}</p>` : ''}
                    ${!b ? '<div class="h-1 bg-emerald-500/10 rounded-full overflow-hidden mt-4"><div class="w-full h-full bg-emerald-400/50"></div></div>' : ''}
                </div>
            </div>`;
    }).join('');
    
    const wait = document.getElementById('public-waitlist');
    if(wait) {
        wait.className = "responsive-grid"; 
        wait.innerHTML = state.waitlist.map((item, i) => `
            <div class="glass-card p-5 rounded-2xl bg-white/5 border-white/10 flex flex-col justify-between min-h-[160px]">
                <div class="flex justify-between items-start mb-4">
                    <span class="px-2 py-1 bg-indigo-500/20 text-indigo-300 text-[10px] font-bold rounded uppercase tracking-widest">Grupo ${i+1}</span>
                    <span class="text-[10px] font-medium text-gray-500">${item.registrationTime}</span>
                </div>
                <div class="flex-1 mb-4">
                    <p class="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Jogadores</p>
                    <div class="text-sm font-bold text-white leading-tight space-y-1">${item.players.map(p => `<div class="truncate border-b border-white/5 pb-0.5 last:border-0">${p}</div>`).join('')}</div>
                </div>
                <div class="pt-3 border-t border-white/5"><p class="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">${item.activity}</p></div>
            </div>`).join('') || '<div class="col-span-full"><p class="text-center text-gray-500 font-medium py-12 text-lg uppercase tracking-widest opacity-40">Fila de Espera Vazia</p></div>';
    }
}

export function renderAdmin(callbacks) {
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
        const fixedStatus = getFixedStatus(c);
        const ignoredBadge = (b && ['blocked','rain','tournament'].includes(b.type) && fixedStatus === 'lesson')
            ? `<p class="text-[9px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-1 mt-2">⚠ Aula ignorada — quadra bloqueada</p>` : '';
        const nextTrans = getNextTransition(c);
        const transitionBadge = nextTrans ? `<p class="text-[9px] font-bold ${nextTrans.color} mt-2">${nextTrans.label}</p>` : '';

        return `
            <div class="glass-card p-5 rounded-[1.5rem] border-white/10 ${bgClass} court-drop-zone" data-court="${c}">
                <div class="flex justify-between items-center mb-3">
                    <span class="text-base font-black text-white">${c}</span>
                    <div class="flex gap-2">
                        ${b ? `<button onclick="openEditModal('${c}')" class="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/20 border border-white/10 transition-all"><i class="fas fa-edit text-indigo-300 text-[10px]"></i></button>` : ''}
                        <button onclick="openAdminAction('${c}')" class="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/20 border border-white/10 transition-all"><i class="fas fa-cog text-indigo-300 text-[10px]"></i></button>
                    </div>
                </div>
                <div class="py-2 pointer-events-none">
                    ${b ? `
                        <p class="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1 ${bgClass ? 'text-white' : ''}">${b.type === 'rain' ? 'CHUVA' : (b.type ? b.type.toUpperCase() : b.activity)}</p>
                        <div class="text-[11px] font-medium ${bgClass ? 'text-white/90' : 'text-gray-200'} space-y-0.5 mb-2.5">${b.players.map(p => `<div class="truncate">${p}</div>`).join('')}</div>
                        <div class="text-[9px] text-gray-400 mb-2.5">Insc: ${b.registrationTime || '--:--'} | Início: ${b.startTime || '--:--'}</div>
                        ${b.observation ? `<p class="text-[9px] font-bold text-indigo-300 mt-1 border-l-2 border-indigo-400 pl-2 py-0.5 italic">"${b.observation}"</p>` : ''}
                        ${ignoredBadge} ${transitionBadge}
                        <div class="grid grid-cols-2 gap-2 mt-3 pointer-events-auto">
                            ${!b.startTime ? `
                                <button onclick="startMatch('${c}')" class="w-full py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-black text-[9px] uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all">Iniciar</button>
                                <button onclick="releaseCourt('${c}')" class="w-full py-1.5 rounded-xl bg-red-500/20 text-red-300 border border-red-500/30 font-black text-[9px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">Encerrar</button>
                            ` : `
                                <button onclick="releaseCourt('${c}')" class="w-full py-1.5 rounded-xl bg-red-500/20 text-red-300 border border-red-500/30 font-black text-[9px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">Encerrar</button>
                                <button onclick="openUndoModal('${c}')" class="w-full py-1.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 font-black text-[9px] uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all flex items-center justify-center gap-1"><i class="fas fa-rotate-left"></i> Reverter</button>
                            `}
                        </div>
                        ${!b.startTime ? `<button onclick="openUndoModal('${c}')" class="w-full mt-2 py-1.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 font-black text-[9px] uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all flex items-center justify-center gap-1"><i class="fas fa-rotate-left"></i> Reverter</button>` : ''}
                    ` : `
                        <p class="text-gray-400 italic text-[10px] mb-2.5">Disponível para uso</p>
                        ${transitionBadge}
                        <div class="h-8 border border-dashed border-white/20 rounded-xl flex items-center justify-center text-[9px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/5">QUADRA LIVRE</div>
                        <button onclick="openUndoModal('${c}')" class="w-full mt-3 py-1.5 rounded-xl bg-amber-500/5 text-amber-400/60 border border-amber-500/10 font-black text-[9px] uppercase tracking-widest hover:bg-amber-500/20 hover:text-amber-400 transition-all flex items-center justify-center gap-2"><i class="fas fa-rotate-left"></i> Reverter</button>
                    `}
                </div>
            </div>`;
    }).join('');

    const adminWait = document.getElementById('admin-waitlist');
    if (adminWait) {
        adminWait.innerHTML = state.waitlist.map((item, i) => `<div class="glass-card p-5 rounded-[1.5rem] border-white/20 bg-white/5 backdrop-blur-[4px] cursor-move hover:border-indigo-500/50 transition-all waitlist-item flex flex-col justify-between min-h-[120px]" data-id="${item.id}"><div class="flex justify-between items-start mb-3"><div class="flex flex-col gap-1"><span class="px-3 py-1.5 bg-indigo-500/80 text-white text-[9px] font-black rounded-xl uppercase tracking-widest">FILA: GRUPO ${i+1}</span><span class="text-[9px] font-bold text-gray-300">${item.registrationTime}</span></div><div class="flex gap-2"><button onclick="openWaitlistEditModal('${item.id}')" class="w-8 h-8 flex items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500 hover:text-white transition-all border border-amber-500/20" title="Editar Grupo"><i class="fas fa-pen text-xs"></i></button><button onclick="openMoveModal('${item.id}')" class="w-8 h-8 flex items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500 hover:text-white transition-all border border-indigo-500/20" title="Mover para Quadra"><i class="fas fa-right-left text-xs"></i></button><button onclick="removeFromWaitlist('${item.id}')" class="w-8 h-8 flex items-center justify-center rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-all border border-indigo-500/20" title="Remover da Fila"><i class="fas fa-trash-can text-xs"></i></button></div></div><div class="flex-1 flex flex-col justify-center my-1.5 overflow-hidden"><p class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Jogadores</p><div class="text-xs font-black text-white leading-tight space-y-0.5">${item.players.map(p => `<div class="truncate border-b border-white/10 pb-0.5 last:border-0">${p}</div>`).join('')}</div></div><div class="mt-auto pt-2 border-t border-white/10 flex justify-between items-center"><p class="text-[9px] font-black text-indigo-300 uppercase tracking-widest">${item.activity}</p>${item.repeat ? '<span class="px-2 py-0.5 bg-red-500/20 text-red-400 text-[7px] font-black rounded-lg uppercase border border-red-500/30">SEM PREFERÊNCIA</span>' : ''}</div></div>`).join('') || '<div class="col-span-full py-12 text-center text-gray-500 font-bold text-sm uppercase tracking-widest opacity-30">Fila de Espera Vazia</div>';
        if (callbacks && callbacks.initSortable) callbacks.initSortable();
    }
}

export function renderActivity() {
    const container = document.getElementById('home-recent-activity');
    if(!container) return;
    const recent = state.history.slice().reverse().slice(0, 5);
    container.innerHTML = recent.map(r => `
        <div class="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
            <div class="w-10 h-10 ${r.type ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'} rounded-xl flex items-center justify-center"><i class="fas ${r.type ? 'fa-history' : 'fa-check-circle'}"></i></div>
            <div class="flex-1"><p class="text-sm font-bold text-white">${r.players[0]}${r.players.length > 1 ? ' + ' + (r.players.length - 1) : ''}</p><p class="text-[10px] text-gray-500 uppercase font-black">${r.court} • ${r.startTime} - ${r.endTime}</p></div>
            <div class="text-right"><p class="text-[9px] font-black text-gray-600 uppercase tracking-tighter">${r.date}</p></div>
        </div>`).join('') || '<p class="text-center text-gray-600 font-bold py-10">Nenhum histórico disponível.</p>';
}

export function updateDashboard() {
    const todayStr = getTodayDate();
    const todayHistory = state.history.filter(h => h.date === todayStr);
    
    const setElText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };

    // KPIs Básicos
    setElText('stat-occupied', state.bookings.filter(b => b.type !== 'blocked' && b.type !== 'rain' && b.type !== 'tournament').length);
    setElText('stat-wait', state.waitlist.length);
    setElText('stat-total', todayHistory.length);
    
    // Contagem por atividade hoje
    const lessons = todayHistory.filter(h => h.activity?.toLowerCase().includes('aula'));
    const batebola = todayHistory.filter(h => h.activity === 'Bate-bola');
    const games = todayHistory.filter(h => ['Simples', 'Dupla'].includes(h.activity));
    const ranking = todayHistory.filter(h => h.activity?.toLowerCase().includes('ranking'));

    setElText('stat-lessons-today', lessons.length);
    setElText('stat-batebola-today', batebola.length);
    setElText('stat-games-today', games.length);
    setElText('stat-ranking-today', ranking.length);

    // Minutos por atividade
    const sumMin = (arr) => arr.reduce((sum, h) => sum + (h.playDuration || 0), 0);
    setElText('stat-lessons-min', `${sumMin(lessons)} min`);
    setElText('stat-batebola-min', `${sumMin(batebola)} min`);
    setElText('stat-games-min', `${sumMin(games)} min`);
    setElText('stat-ranking-min', `${sumMin(ranking)} min`);

    // Cálculos de Tempo Médio e Ocupação
    const totalPlayMin = todayHistory.reduce((sum, h) => sum + (h.playDuration || 0), 0);
    const avgPlay = todayHistory.length > 0 ? Math.round(totalPlayMin / todayHistory.length) : 0;
    setElText('stat-avg', `${avgPlay} min`);

    const totalWaitMin = todayHistory.reduce((sum, h) => sum + (h.waitDuration || 0), 0);
    const avgWait = todayHistory.length > 0 ? Math.round(totalWaitMin / todayHistory.length) : 0;
    setElText('stat-avg-wait', `${avgWait} min`);

    // Top Player (Sócio que mais jogou hoje)
    const playerCounts = {};
    todayHistory.forEach(h => {
        if(h.players) h.players.forEach(p => {
            if(p !== "AULA") playerCounts[p] = (playerCounts[p] || 0) + 1;
        });
    });
    const topPlayer = Object.entries(playerCounts).sort((a,b) => b[1] - a[1])[0];
    setElText('stat-top-player', topPlayer ? `${topPlayer[0]} (${topPlayer[1]}x)` : '---');

    // Total de horas jogadas hoje
    setElText('stat-total-min', formatHours(totalPlayMin));

    // Ocupação por período (Hoje)
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const analytics = calculateOccupancyAnalytics(startOfToday, endOfToday);

    setElText('stat-avg-morning', `${analytics.overall.averageByPeriod.morning.toFixed(1)}%`);
    setElText('stat-avg-afternoon', `${analytics.overall.averageByPeriod.afternoon.toFixed(1)}%`);
    setElText('stat-avg-evening', `${analytics.overall.averageByPeriod.evening.toFixed(1)}%`);

    // Quadra mais ociosa hoje
    const sortedCourts = [...analytics.courts].sort((a,b) => a.totalPlayMinutes - b.totalPlayMinutes);
    const laziest = sortedCourts[0];
    setElText('stat-laziest-court', laziest ? laziest.courtName : '---');
    setElText('stat-laziest-court-min', laziest ? `${laziest.totalPlayMinutes} min` : '-- min');

    // Quadra mais usada hoje
    const courtGameCounts = {};
    todayHistory.forEach(h => {
        courtGameCounts[h.court] = (courtGameCounts[h.court] || 0) + 1;
    });
    const topCourtEntry = Object.entries(courtGameCounts).sort((a,b) => b[1] - a[1])[0];
    setElText('stat-top-court', topCourtEntry ? topCourtEntry[0] : '---');
    setElText('stat-top-court-count', topCourtEntry ? `${topCourtEntry[1]} jogos` : '0 jogos');

    // Pico de espera (Máximo de pessoas na fila hoje - simplificado)
    setElText('stat-peak-wait', state.waitlist.length > 0 ? state.waitlist.length : '0');
    setElText('stat-peak-wait-name', state.waitlist.length > 0 ? state.waitlist[0].players[0] : 'Ninguém');

    // Desistências (Histórico hoje com encerradoPor === 'desistencia')
    setElText('stat-withdrawals', todayHistory.filter(h => h.encerradoPor === 'desistencia').length);
    
    // Pico de horário (Simplificado)
    const hourlyCounts = Array(24).fill(0);
    todayHistory.forEach(h => {
        const startMin = timeToMinutes(h.startTime);
        const hour = Math.floor(startMin / 60);
        if (hour >= 0 && hour < 24) hourlyCounts[hour]++;
    });
    const peakHour = hourlyCounts.indexOf(Math.max(...hourlyCounts));
    setElText('stat-peak-hour', peakHour !== -1 && Math.max(...hourlyCounts) > 0 ? `${peakHour}:00` : '--');
    setElText('stat-peak-count', `${Math.max(...hourlyCounts)} entradas`);

    // Distribuição de Atividades
    updateActivityStats(analytics);
}

function updateActivityStats(analytics) {
    const actBar = document.getElementById('stat-activity-distribution');
    const actLegend = document.getElementById('stat-activity-legend');
    if (!actBar || !actLegend) return;

    const sortedActivities = Object.entries(analytics.activityData.byType)
        .sort((a, b) => b[1].totalMinutes - a[1].totalMinutes);
    
    const totalMins = analytics.overall.totalPlayMinutes;
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#a855f7', '#3b82f6', '#ef4444'];

    if (totalMins === 0) {
        actBar.innerHTML = '<div class="w-full h-full bg-white/5"></div>';
        actLegend.innerHTML = 'Nenhuma atividade registrada';
        return;
    }

    actBar.innerHTML = sortedActivities.map(([act, data], i) => {
        const pct = (data.totalMinutes / totalMins) * 100;
        return `<div style="width: ${pct}%; background: ${colors[i % colors.length]}" title="${act}: ${pct.toFixed(1)}%"></div>`;
    }).join('');

    actLegend.innerHTML = sortedActivities.map(([act, data], i) => {
        const pct = (data.totalMinutes / totalMins) * 100;
        return `
            <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full" style="background: ${colors[i % colors.length]}"></span>
                <span>${act} (${pct.toFixed(1)}%)</span>
            </div>
        `;
    }).join('');
}

export function switchView(view, currentUser, USER_ROLES, callbacks) {
    if (currentUser && USER_ROLES[currentUser] && !USER_ROLES[currentUser].views.includes(view)) return;
    state.currentView = view;
    const targetView = document.getElementById(`${view}-view`);
    const currentViewEl = document.querySelector('.view:not(.hidden)');
    if (currentViewEl && currentViewEl !== targetView) {
        gsap.to(currentViewEl, { opacity: 0, y: 10, duration: 0.2, onComplete: () => {
            currentViewEl.classList.add('hidden');
            showNewView(targetView, view, callbacks);
        }});
    } else showNewView(targetView, view, callbacks);
}

function showNewView(targetView, view, callbacks) {
    targetView.classList.remove('hidden');
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active', 'text-white'));
    const activeNavLink = document.getElementById(`nav-${view}`);
    if(activeNavLink) activeNavLink.classList.add('active', 'text-white');
    if (callbacks && callbacks.updateBottomNav) callbacks.updateBottomNav(view);
    render(callbacks);
    gsap.fromTo(targetView, { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.4 });
}
