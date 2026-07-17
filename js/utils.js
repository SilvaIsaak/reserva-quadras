// NÃO CONECTADO AO index.html — referência para modularização futura, ver prompt-reorganizacao-reservaquadras.md

let _timeOffset = 0;

export function togglePwdVisibility(inputId, btn) {
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

export function checkPwdMatch() {
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

export function getTodayDate() {
    return getAccurateNow().toLocaleDateString('pt-BR');
}

export function getWeekdayName() {
    return getAccurateNow().toLocaleDateString('pt-BR', { weekday: 'long' });
}

export function calculateOverlapMinutes(start1, end1, start2, end2) {
    const overlapStart = Math.max(start1, start2);
    const overlapEnd = Math.min(end1, end2);
    return overlapStart < overlapEnd ? Math.round((overlapEnd - overlapStart) / 60000) : 0;
}

export function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

const PERIODS = {
    morning: { name: "Manhã", startHour: 6, startMinute: 30, endHour: 12, endMinute: 30, totalMinutes: 360 },
    afternoon: { name: "Tarde", startHour: 12, startMinute: 31, endHour: 18, endMinute: 30, totalMinutes: 360 },
    evening: { name: "Noite", startHour: 18, startMinute: 31, endHour: 22, endMinute: 0, totalMinutes: 210 }
};

export function formatHours(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
}

export function getPeriodoStr(timeStr) {
    if (!timeStr) return '--';
    const mins = timeToMinutes(timeStr);
    if (mins >= PERIODS.morning.startHour * 60 + PERIODS.morning.startMinute && mins <= PERIODS.morning.endHour * 60 + PERIODS.morning.endMinute) return 'Manhã';
    if (mins >= PERIODS.afternoon.startHour * 60 + PERIODS.afternoon.startMinute && mins <= PERIODS.afternoon.endHour * 60 + PERIODS.afternoon.endMinute) return 'Tarde';
    if (mins >= PERIODS.evening.startHour * 60 + PERIODS.evening.startMinute && mins <= PERIODS.evening.endHour * 60 + PERIODS.evening.endMinute) return 'Noite';
    return '--';
}

export function showToast(msg, type='info') {
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

export function showToastWithAction(msg, actionLabel, onAction) {
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

export function getAccurateNow() {
    return new Date(Date.now() + _timeOffset);
}
