import { state } from './state.js';
import { save } from './firebase.js';
import { render } from './render.js';
import { timeToMinutes } from './schedules.js';

export function openBookingModal(court) {
    state.activeAdminCourt = court;
    const modal = document.getElementById('booking-modal');
    if(!modal) return;
    const title = document.getElementById('booking-modal-title');
    if(title) title.innerText = `Nova Reserva: ${court}`;
    
    // Reset form
    const form = document.getElementById('booking-form');
    if(form) form.reset();
    
    modal.classList.remove('hidden');
    gsap.fromTo(modal.querySelector('.glass-card'), { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3 });
}

export function closeBookingModal() {
    const modal = document.getElementById('booking-modal');
    if(!modal) return;
    gsap.to(modal.querySelector('.glass-card'), { scale: 0.9, opacity: 0, duration: 0.2, onComplete: () => modal.classList.add('hidden') });
}

export function openAdminAction(court) {
    state.activeAdminCourt = court;
    const modal = document.getElementById('admin-action-modal');
    if(!modal) return;
    const title = document.getElementById('admin-action-title');
    if(title) title.innerText = `Gestão: ${court}`;
    modal.classList.remove('hidden');
    gsap.fromTo(modal.querySelector('.glass-card'), { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3 });
}

export function closeAdminAction() {
    const modal = document.getElementById('admin-action-modal');
    if(!modal) return;
    gsap.to(modal.querySelector('.glass-card'), { y: 20, opacity: 0, duration: 0.2, onComplete: () => modal.classList.add('hidden') });
}

export function openUndoModal(court) {
    state.activeAdminCourt = court;
    const modal = document.getElementById('undo-modal');
    if(!modal) return;
    
    const list = document.getElementById('undo-list');
    if(!list) return;
    
    const todayStr = new Date().toLocaleDateString('pt-BR');
    const recentHistory = state.history
        .filter(h => h.date === todayStr && h.court === court)
        .reverse()
        .slice(0, 15);
        
    list.innerHTML = recentHistory.map(h => {
        // ... Render history item for undo
        return `...`;
    }).join('') || '<p class="text-center text-gray-500 py-8 font-bold uppercase tracking-widest opacity-40">Nenhum encerramento hoje nesta quadra.</p>';
    
    modal.classList.remove('hidden');
    gsap.fromTo(modal.querySelector('.glass-card'), { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3 });
}

export function closeUndoModal() {
    const modal = document.getElementById('undo-modal');
    if(!modal) return;
    gsap.to(modal.querySelector('.glass-card'), { scale: 0.9, opacity: 0, duration: 0.2, onComplete: () => modal.classList.add('hidden') });
}

// ... Outras funções de modal
