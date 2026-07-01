export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `glass-card p-4 rounded-xl border-l-4 flex items-center gap-3 mb-3 pointer-events-auto shadow-2xl transition-all duration-500 transform translate-x-10 opacity-0`;
    
    const colors = {
        info: 'border-indigo-500 text-indigo-400',
        success: 'border-emerald-500 text-emerald-400',
        warning: 'border-amber-500 text-amber-400',
        error: 'border-red-500 text-red-400'
    };
    
    toast.classList.add(...colors[type].split(' '));
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i><p class="text-xs font-bold uppercase tracking-widest">${message}</p>`;
    
    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-10', 'opacity-0');
    });
    
    setTimeout(() => {
        toast.classList.add('translate-x-10', 'opacity-0');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

export function getAccurateNow() {
    return new Date();
}

export function getTodayDate() {
    return getAccurateNow().toLocaleDateString('pt-BR');
}

export function getWeekdayName() {
    return getAccurateNow().toLocaleDateString('pt-BR', { weekday: 'long' });
}

export function parseDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return dateStr;
    
    // Tenta DD/MM/YYYY
    if (dateStr.includes('/')) {
        const [d, m, y] = dateStr.split('/').map(Number);
        return new Date(y, m - 1, d);
    }
    
    // Tenta YYYY-MM-DD
    if (dateStr.includes('-')) {
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    
    const dt = new Date(dateStr);
    return isNaN(dt.getTime()) ? null : dt;
}
