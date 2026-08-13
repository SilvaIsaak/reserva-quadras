// UI do editor de horários de aula (abas, preview semanal, salvar/resetar)
function switchLessonTab(tabName) {
    // Esconder todas as abas
    document.querySelectorAll('.lesson-tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remover classe active de todos os botões
    document.querySelectorAll('.lesson-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Mostrar a aba selecionada
    const selectedTab = document.getElementById(`lesson-tab-${tabName}`);
    if (selectedTab) selectedTab.classList.add('active');
    
    // Marcar botão como ativo
    const selectedBtn = document.querySelector(`[data-lesson-tab="${tabName}"]`);
    if (selectedBtn) selectedBtn.classList.add('active');
    
    // Se for a aba de preview, renderizar o calendário
    if (tabName === 'preview') {
        renderLessonWeeklyPreview();
    }
}

/**
 * Renderiza a visualização semanal de horários de aulas
 */
function renderLessonWeeklyPreview() {
    const container = document.getElementById('lesson-weekly-preview');
    if (!container) return;
    
    const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
    const dayNumbers = [1, 2, 3, 4, 5, 6, 0];
    
    let html = '';
    
    state.courts.forEach(court => {
        const schedules = FIXED_SCHEDULES[court] || [];
        
        html += `
            <div class="glass-card p-4 rounded-xl space-y-3">
                <div class="flex items-center gap-2 border-b border-white/10 pb-3">
                    <i class="fas fa-table-tennis-paddle-ball text-indigo-400 text-sm"></i>
                    <h4 class="font-bold text-white text-sm">${court}</h4>
                </div>
                <div class="space-y-2">
        `;
        
        days.forEach((day, idx) => {
            const dayNum = dayNumbers[idx];
            const daySchedules = schedules.filter(s => s.days.includes(dayNum));
            
            if (daySchedules.length === 0) {
                html += `<div class="text-[10px] text-gray-500"><strong>${day}:</strong> Não configurado</div>`;
                return;
            }
            
            const lessons = daySchedules.filter(s => s.status === 'lesson');
            if (lessons.length === 0) {
                html += `<div class="text-[10px] text-gray-500"><strong>${day}:</strong> Sem aulas</div>`;
                return;
            }
            
            const lessonTimes = lessons.map(l => `${l.start} - ${l.end}`).join(', ');
            html += `
                <div class="text-[10px] p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <strong class="text-amber-300">${day}:</strong>
                    <span class="text-amber-200 ml-1">${lessonTimes}</span>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html || '<div class="col-span-full text-center text-gray-500 py-8">Nenhum horário configurado</div>';
}

/**
 * Renderiza o editor de horários de aulas por quadra
 */
function renderLessonScheduleEditor() {
    const container = document.getElementById('lesson-schedule-editor');
    if (!container) return;
    
    let html = '';
    
    state.courts.forEach(court => {
        const schedules = FIXED_SCHEDULES[court] || [];
        const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
        const dayNumbers = [1, 2, 3, 4, 5, 6, 0];
        const dayMap = {0:'Dom', 1:'Seg', 2:'Ter', 3:'Qua', 4:'Qui', 5:'Sex', 6:'Sáb'};
        
        html += `
            <div class="glass-card p-4 rounded-xl space-y-3">
                <div class="lesson-court-header" onclick="toggleLessonCourtEditor('${court}')">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-table-tennis-paddle-ball text-indigo-400"></i>
                        <span class="font-bold text-white">${court}</span>
                    </div>
                    <i class="fas fa-chevron-down text-gray-400 transition-transform" id="chevron-${court}"></i>
                </div>
                <div id="editor-${court}" class="hidden space-y-2">
        `;
        
        schedules.forEach((schedule, idx) => {
            const daysList = schedule.days.map(d => dayMap[d] || d).join(', ');
            const statusLabel = schedule.status === 'lesson' ? 'AULA' : 'LIVRE';
            const statusColor = schedule.status === 'lesson' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
            
            html += `
                <div class="lesson-schedule-row">
                    <div class="flex-1">
                        <div class="text-[10px] text-gray-500 uppercase font-bold">Dias</div>
                        <div class="text-sm font-bold text-white">${daysList}</div>
                    </div>
                    <div class="flex-1">
                        <div class="text-[10px] text-gray-500 uppercase font-bold">Horário</div>
                        <div class="text-sm font-bold text-white">${schedule.start} - ${schedule.end}</div>
                    </div>
                    <div class="flex-1">
                        <div class="text-[10px] text-gray-500 uppercase font-bold">Status</div>
                        <span class="inline-block px-2 py-1 rounded-lg text-[10px] font-bold border ${statusColor}">${statusLabel}</span>
                    </div>
                    <div class="row-delete">
                        <button onclick="removeLessonSchedule('${court}', ${idx})" class="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all border border-red-500/20">
                            <i class="fas fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        html += `
                    <button onclick="addLessonSchedule('${court}')" class="w-full py-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold text-[10px] uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all">
                        <i class="fas fa-plus mr-2"></i>Adicionar Período
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

/**
 * Alterna a visibilidade do editor de uma quadra
 */
function toggleLessonCourtEditor(court) {
    const editor = document.getElementById(`editor-${court}`);
    const chevron = document.getElementById(`chevron-${court}`);
    
    if (editor) {
        editor.classList.toggle('hidden');
        if (chevron) {
            chevron.style.transform = editor.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
        }
    }
}

/**
 * Remove um período de aula
 */
function removeLessonSchedule(court, index) {
    if (!confirm('Deseja remover este período?')) return;
    
    if (FIXED_SCHEDULES[court] && FIXED_SCHEDULES[court][index]) {
        FIXED_SCHEDULES[court].splice(index, 1);
        renderLessonScheduleEditor();
        showToast('Período removido!', 'success');
    }
}

/**
 * Adiciona um novo período de aula
 */
function addLessonSchedule(court) {
    const newSchedule = {
        days: [1, 2, 3, 4, 5],
        start: '08:00',
        end: '12:00',
        status: 'lesson'
    };
    
    if (!FIXED_SCHEDULES[court]) FIXED_SCHEDULES[court] = [];
    FIXED_SCHEDULES[court].push(newSchedule);
    renderLessonScheduleEditor();
    showToast('Período adicionado! Configure os horários.', 'info');
}

/**
 * Salva as configurações de horários de aulas
 */
function saveFixedSchedules() {
    storage.set('rq_pro_fixed_schedules', JSON.stringify(FIXED_SCHEDULES));
    applyFixedSchedules();
    render();
    showToast('Horários de aulas salvos com sucesso!', 'success');
}

/**
 * Reseta os horários para os padrões
 */
function resetFixedSchedules() {
    if (!confirm('Deseja resetar todos os horários para os padrões?')) return;
    
    storage.remove('rq_pro_fixed_schedules');
    location.reload();
}

// Inicializar o renderizador de horários ao carregar a página
window.addEventListener('load', () => {
    renderLessonScheduleEditor();
});



