// Configurações gerais do clube (nome, cor, quadras, performance)
function updateSettingsSilent() {
    try {
        // Suporte a ambos os IDs (settings e admin)
        const membersEl = document.getElementById('set-members') || document.getElementById('set-members-admin');
        let input = membersEl ? membersEl.value.trim() : '';
        if(input) {
            let parsed;
            try { parsed = JSON.parse(input); } catch(e) { parsed = JSON.parse(input.replace(/'/g, '"')); }
            if(typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) state.members = parsed;
        }
        saveLocal();
    } catch(e) {}
}

/** Sincroniza o textarea duplicado da aba Admin com o state */
function syncMembersFromAdmin() {
    const adminEl = document.getElementById('set-members-admin');
    const settingsEl = document.getElementById('set-members');
    if (adminEl && settingsEl) settingsEl.value = adminEl.value;
    updateSettingsSilent();
}

function updateSettings() {
    try {
        const membersEl = document.getElementById('set-members');
        if (membersEl) {
            let input = membersEl.value.trim();
            if (input) {
                let parsed;
                try { 
                    parsed = JSON.parse(input); 
                } catch(e) { 
                    parsed = JSON.parse(input.replace(/'/g, '"')); 
                }
                if(typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error("Invalid JSON");
                state.members = parsed;
            }
        }
    } catch(e) { 
        showToast("Erro no formato da Base de Dados! Use JSON válido.", "error"); 
        return; 
    }

    const nameInput = document.getElementById('set-club-name');
    const courtsInput = document.getElementById('set-courts');
    const colorInput = document.getElementById('set-color');

    if (nameInput) state.settings.clubName = nameInput.value;
    if (courtsInput) state.courts = courtsInput.value.split(',').map(c => c.trim()).filter(c => c !== "");
    if (colorInput) {
        state.settings.primaryColor = colorInput.value;
        document.documentElement.style.setProperty('--primary', state.settings.primaryColor);
    }

    // Update Brand Name UI
    const brandEl = document.getElementById('brand-name');
    if (brandEl) {
        const name = state.settings.clubName;
        if (name.toLowerCase().includes('reservaquadras')) {
             brandEl.innerHTML = `Reserva<span class="text-indigo-400">Quadras</span>`;
        } else {
             brandEl.innerText = name;
        }
    }

    saveLocal();
    dbSaveSettings({ clubName: state.settings.clubName, primaryColor: state.settings.primaryColor });
    if (courtsInput) dbSyncCourts(state.courts);
    dbSyncMembersFull(state.members);
    showToast("Configurações salvas com sucesso!", "success");
    render();
}


function togglePerformanceMode() {
    state.settings.performanceMode = document.getElementById('set-performance').checked;
    saveLocal();
    dbSaveSettings({ performanceMode: state.settings.performanceMode });
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

