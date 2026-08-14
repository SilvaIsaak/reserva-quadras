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

// Quadras com o accordion aberto — preservado entre re-renders, já que agora
// cada edição de campo (horário/dia/status) refaz o HTML inteiro do editor.
const _openLessonCourts = new Set();

/**
 * Renderiza o editor de horários de aulas por quadra
 */
function renderLessonScheduleEditor() {
    const container = document.getElementById('lesson-schedule-editor');
    if (!container) return;

    let html = '';

    state.courts.forEach(court => {
        const schedules = FIXED_SCHEDULES[court] || [];
        const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']; // índice = getDay()
        const isOpen = _openLessonCourts.has(court);
        const cAttr = escapeJsAttr(court);

        html += `
            <div class="glass-card p-4 rounded-xl space-y-3">
                <div class="lesson-court-header" onclick="toggleLessonCourtEditor('${cAttr}')">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-table-tennis-paddle-ball text-indigo-400"></i>
                        <span class="font-bold text-white">${escapeHtml(court)}</span>
                    </div>
                    <i class="fas fa-chevron-down text-gray-400 transition-transform" id="chevron-${escapeHtml(court)}" style="transform: rotate(${isOpen ? '180' : '0'}deg)"></i>
                </div>
                <div id="editor-${escapeHtml(court)}" class="${isOpen ? '' : 'hidden'} space-y-2">
        `;

        schedules.forEach((schedule, idx) => {
            const dayToggles = dayLabels.map((label, d) => {
                const active = schedule.days.includes(d);
                return `<button type="button" onclick="toggleLessonScheduleDay('${cAttr}', ${idx}, ${d})"
                    class="w-8 h-8 rounded-lg text-[10px] font-bold border transition-all ${active ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white/5 text-gray-400 border-white/10'}">${label}</button>`;
            }).join('');

            html += `
                <div class="lesson-schedule-row">
                    <div>
                        <div class="text-[10px] text-gray-500 uppercase font-bold mb-1">Dias</div>
                        <div class="flex gap-1 flex-wrap">${dayToggles}</div>
                    </div>
                    <div>
                        <div class="text-[10px] text-gray-500 uppercase font-bold mb-1">Início</div>
                        <input type="time" value="${schedule.start}" onchange="updateLessonScheduleField('${cAttr}', ${idx}, 'start', this.value)" class="input-glass p-2 rounded-lg text-sm font-bold">
                    </div>
                    <div>
                        <div class="text-[10px] text-gray-500 uppercase font-bold mb-1">Fim</div>
                        <input type="time" value="${schedule.end}" onchange="updateLessonScheduleField('${cAttr}', ${idx}, 'end', this.value)" class="input-glass p-2 rounded-lg text-sm font-bold">
                    </div>
                    <div>
                        <div class="text-[10px] text-gray-500 uppercase font-bold mb-1">Status</div>
                        <select onchange="updateLessonScheduleField('${cAttr}', ${idx}, 'status', this.value)" class="input-glass p-2 rounded-lg text-sm font-bold">
                            <option value="lesson" ${schedule.status === 'lesson' ? 'selected' : ''}>AULA</option>
                            <option value="free" ${schedule.status === 'free' ? 'selected' : ''}>LIVRE</option>
                        </select>
                    </div>
                    <div class="row-delete">
                        <button onclick="removeLessonSchedule('${cAttr}', ${idx})" class="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all border border-red-500/20">
                            <i class="fas fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        html += `
                    <button onclick="addLessonSchedule('${cAttr}')" class="w-full py-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold text-[10px] uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all">
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
    if (_openLessonCourts.has(court)) _openLessonCourts.delete(court);
    else _openLessonCourts.add(court);
    renderLessonScheduleEditor();
}

/**
 * Atualiza um campo (start/end/status) de um período existente
 */
function updateLessonScheduleField(court, index, field, value) {
    if (!FIXED_SCHEDULES[court] || !FIXED_SCHEDULES[court][index]) return;
    FIXED_SCHEDULES[court][index][field] = value;
    renderLessonScheduleEditor();
}

/**
 * Liga/desliga um dia da semana (0=Dom...6=Sáb) num período existente
 */
function toggleLessonScheduleDay(court, index, day) {
    const schedule = FIXED_SCHEDULES[court] && FIXED_SCHEDULES[court][index];
    if (!schedule) return;
    const pos = schedule.days.indexOf(day);
    if (pos === -1) schedule.days.push(day); else schedule.days.splice(pos, 1);
    schedule.days.sort((a, b) => a - b);
    renderLessonScheduleEditor();
}

/**
 * Remove um período de aula
 */
function removeLessonSchedule(court, index) {
    if (!confirm('Deseja remover este período?')) return;

    if (FIXED_SCHEDULES[court] && FIXED_SCHEDULES[court][index]) {
        FIXED_SCHEDULES[court].splice(index, 1);
        renderLessonScheduleEditor();
        showToast('Período removido! Clique em Salvar para confirmar.', 'info');
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
    _openLessonCourts.add(court);
    renderLessonScheduleEditor();
    showToast('Período adicionado! Ajuste dias/horário e clique em Salvar.', 'info');
}

/**
 * Salva as configurações de horários de aulas — localStorage (cache
 * imediato deste dispositivo) e Supabase (fonte de verdade multi-dispositivo,
 * lida de volta por loadSettings() em cada reconexão/tempo real).
 */
async function saveFixedSchedules() {
    storage.set('rq_pro_fixed_schedules', FIXED_SCHEDULES);
    const ok = await dbSaveSettings({ fixedSchedules: FIXED_SCHEDULES });
    applyFixedSchedules();
    render();
    if (ok) showToast('Horários de aulas salvos com sucesso!', 'success');
}

/**
 * Reseta os horários para os padrões (embutidos em config.js) neste e em
 * todos os outros dispositivos.
 */
async function resetFixedSchedules() {
    if (!confirm('Deseja resetar todos os horários para os padrões?')) return;

    storage.remove('rq_pro_fixed_schedules');
    await dbSaveSettings({ fixedSchedules: null });
    location.reload();
}

// Inicializar o renderizador de horários ao carregar a página
window.addEventListener('load', () => {
    renderLessonScheduleEditor();
});



