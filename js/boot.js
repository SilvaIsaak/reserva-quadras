// Sequência de inicialização — roda por último, depois que tudo mais já foi definido
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

// Executar verificações pesadas com menos frequência (a cada 30 segundos)
setInterval(() => {
    closeStaleActivities(); // cobre a virada da meia-noite com a página aberta
    applyFixedSchedules();
    closeAllActivities();
    render();
}, 30000);

// initSupabase() precisa rodar antes de qualquer chamada que possa gravar no
// banco (closeStaleActivities/applyFixedSchedules podem abrir/fechar aulas
// automáticas) — senão supabaseClient ainda é null nessa primeira passada.
initSupabase();
closeStaleActivities();
applyFixedSchedules();
restoreSession();

// Fallback do indicador para quando o Supabase não está configurado
window.addEventListener('online', () => setConnectionState(true));
window.addEventListener('offline', () => setConnectionState(false));
setConnectionState(navigator.onLine);

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

