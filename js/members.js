import { state } from './state.js';
import { save } from './firebase.js';
import { render } from './render.js';

export function searchMember(query) {
    const results = document.getElementById('member-search-results');
    if(!results) return;
    results.innerHTML = '';
    if(!query) return;
    
    const lowerQuery = query.toLowerCase();
    for (const [title, names] of Object.entries(state.members)) {
        if (title.includes(query) || names.some(n => n.toLowerCase().includes(lowerQuery))) {
            const div = document.createElement('div');
            div.className = "p-3 bg-white/5 hover:bg-white/10 rounded-xl cursor-pointer transition-all border border-white/5 mb-2";
            div.innerHTML = `<p class="text-xs font-bold text-indigo-400">Título ${title}</p><p class="text-sm text-white">${names.join(', ')}</p>`;
            div.onclick = () => {
                // ... logic to add member to form
            };
            results.appendChild(div);
        }
    }
}

export function updateSettings(formData) {
    state.settings.clubName = formData.get('clubName');
    state.settings.primaryColor = formData.get('primaryColor');
    state.settings.performanceMode = formData.get('performanceMode') === 'on';
    save();
    render();
}
