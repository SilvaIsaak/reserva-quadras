// Motor da agenda fixa de aulas: aplicar status automático e liberar quadra manualmente
// Único ponto que percorre FIXED_SCHEDULES para achar o período ativo agora —
// reaproveitado por getFixedStatus, applyFixedSchedules e releaseLessonUntilPeriodEnd.
// Antes havia uma segunda cópia dessa busca dentro de applyFixedSchedules que não
// tratava períodos que cruzam a meia-noite, fazendo o startTime da aula cair
// incorretamente em "00:00" nesse caso.
function getActiveScheduleFor(courtName) {
    const now = getAccurateNow();
    const dayOfWeek = now.getDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const schedules = FIXED_SCHEDULES[courtName];
    if (!schedules) return null;

    for (const schedule of schedules) {
        if (schedule.days.includes(dayOfWeek)) {
            const startMinutes = timeToMinutes(schedule.start);
            const endMinutes = timeToMinutes(schedule.end);

            if (endMinutes > startMinutes) {
                if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
                    return schedule;
                }
            } else {
                if (currentMinutes >= startMinutes || currentMinutes < endMinutes) {
                    return schedule;
                }
            }
        }
    }

    return null;
}

function getFixedStatus(courtName) {
    if (!FIXED_SCHEDULES[courtName]) return null;
    const schedule = getActiveScheduleFor(courtName);
    return schedule ? schedule.status : "free";
}


let _releaseLessonCourtPending = null;

/**
 * Abre o modal granular de liberação de aula (H.3) 
 * @param {string} court - Nome da quadra
 */
function openReleaseLessonModal(court) {
    _releaseLessonCourtPending = court;
    const nameEl = document.getElementById('release-lesson-court-name');
    if (nameEl) nameEl.innerText = `Quadra: ${court}`;
    const timeInput = document.getElementById('release-lesson-until');
    if (timeInput) timeInput.value = '';
    showModal('release-lesson-modal');
}

function closeReleaseLessonModal() {
    hideModal('release-lesson-modal');
    _releaseLessonCourtPending = null;
}

/** Libera até o fim do período atual (comportamento padrão antigo) */
function releaseLessonUntilPeriodEnd() {
    if (!_releaseLessonCourtPending) return;
    // Sem `until` explícito, applyFixedSchedules nunca reassumia o controle da
    // quadra (a liberação ficava valendo o dia inteiro) — calcular o fim do
    // período ativo agora e gravá-lo como `until` corrige isso.
    const activeSchedule = getActiveScheduleFor(_releaseLessonCourtPending);
    _doReleaseCourt(_releaseLessonCourtPending, activeSchedule ? activeSchedule.end : null);
    closeReleaseLessonModal();
}

/** Libera até o horário digitado pelo admin */
function releaseLessonUntilTime() {
    if (!_releaseLessonCourtPending) return;
    const timeInput = document.getElementById('release-lesson-until');
    const until = timeInput ? timeInput.value : null;
    if (!until) return showToast("Informe um horário válido!", "warning");
    _doReleaseCourt(_releaseLessonCourtPending, until);
    closeReleaseLessonModal();
}

/**
 * Executa o encerramento da reserva e marca manuallyReleasedLessons com suporte a `until`
 * @param {string} court - Nome da quadra
 * @param {string|null} until - HH:MM ou null para fim de período
 */
function _doReleaseCourt(court, until) {
    const booking = state.bookings.find(b => b.court === court);
    if (!booking) return;
    const now = getAccurateNow(), endTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const todayDate = now.toLocaleDateString('pt-BR');

    let playDuration = 0;
    if (booking.startTime) {
        try {
            const [h1, m1] = booking.startTime.split(':').map(Number);
            const [h2, m2] = endTime.split(':').map(Number);
            playDuration = (h2 * 60 + m2) - (h1 * 60 + m1);
            if (playDuration < 0) playDuration += 24 * 60;
        } catch(e) {}
    }
    let waitDuration = 0;
    if (booking.registrationTime && booking.startTime && !booking.type) {
        try {
            const [h1, m1] = booking.registrationTime.split(':').map(Number);
            const [h2, m2] = booking.startTime.split(':').map(Number);
            waitDuration = (h2 * 60 + m2) - (h1 * 60 + m1);
        } catch(e) {}
    }

    state.history.push({
        ...booking,
        date: getTodayDate(),
        weekday: getWeekdayName(),
        endTime,
        playDuration: playDuration > 0 ? playDuration : 0,
        waitDuration: waitDuration > 0 ? waitDuration : 0,
        tempoEsperaMin: waitDuration > 0 ? waitDuration : 0, // Alias G.1
        totalJogadores: (booking.players || []).length, // G.1
        periodoStr: getPeriodoStr(booking.startTime), // G.1
        activity: booking.type === 'lesson' ? "AULA" : (booking.activity || "OUTRO"),
        encerradoPor: "admin" // G.1
    });
    state.bookings = state.bookings.filter(b => b.court !== court);
    dbUpdateSession(booking.id, {
        status: 'history', date: getTodayDate(), weekday: getWeekdayName(), endTime,
        playDuration: playDuration > 0 ? playDuration : 0, waitDuration: waitDuration > 0 ? waitDuration : 0,
        encerradoPor: 'admin'
    });

    // H.3: suporte a `until` em manuallyReleasedLessons
    if (booking.type === 'lesson') {
        const entry = { court, date: todayDate };
        if (until) entry.until = until;
        state.manuallyReleasedLessons.push(entry);
        dbSaveSettings({ manuallyReleasedLessons: state.manuallyReleasedLessons });
    }

    // H.1: re-aplicar agendas imediatamente após liberar
    saveLocal();
    applyFixedSchedules();
    render();
    showToast(`Quadra ${court} liberada!`, "success");

    // Tarefa A: Promoção automática da fila
    if (state.waitlist.length > 0) {
        const nextGroup = state.waitlist[0];
        showToastWithAction(
            `${nextGroup.players[0]} está na fila. Mover para ${court}?`,
            "Mover",
            () => {
                const idx = state.waitlist.findIndex(w => w.id === nextGroup.id);
                if (idx !== -1 && !state.bookings.some(b => b.court === court)) {
                    const entry = state.waitlist.splice(idx, 1)[0];
                    entry.court = court;
                    entry.startTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                    if (entry.activity === "Bate-bola") {
                        const [h, m] = entry.startTime.split(':').map(Number);
                        const end = new Date(); end.setHours(h + 1, m);
                        entry.endTime = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                    }
                    entry.promotedFrom = 'waitlist'; // G.1
                    state.bookings.push(entry);
                    saveLocal();
                    dbUpdateSession(entry.id, { status: 'court', court: entry.court, startTime: entry.startTime, endTime: entry.endTime, promotedFrom: entry.promotedFrom });
                    render();
                    showToast(`${entry.players[0]} movido para ${court}!`, "success");
                }
            }
        );
    }
}

/**
 * Exibe um toast com botão de ação inline (sem modal bloqueante)
 * @param {string} msg - Mensagem
 * @param {string} actionLabel - Rótulo do botão
 * @param {Function} onAction - Callback ao clicar
 */

function releaseCourt(court) {
    const booking = state.bookings.find(b => b.court === court);
    if (!booking) return;
    // H.3: Se for aula automática, perguntar sobre horário de retorno via modal
    if (booking.type === 'lesson' && booking.observation === 'Agenda Fixa') {
        openReleaseLessonModal(court);
    } else {
        // Para não-aulas ou aulas manuais, liberar direto sem modal extra
        _doReleaseCourt(court, null);
    }
}

// H.1: Versão melhorada de applyFixedSchedules com suporte a `until` e badge de aula ignorada
function applyFixedSchedules() {
    // Só esportes tem permissão de escrita no banco (RLS) — publico/diretora
    // rodando essa automação em segundo plano só gerava erro de permissão.
    if (currentUser !== 'esportes') return;
    const todayDate = getTodayDate();
    const weekdayName = getWeekdayName();
    const _stateSignature = () => state.bookings.map(b => `${b.court}:${b.type || ''}:${b.id}`).join('|')
        + '#' + state.history.length + '#' + state.manuallyReleasedLessons.length;
    const _sigBefore = _stateSignature();

    const lastDateForReset = storage.get('last_reset_date') || '';
    if (lastDateForReset !== todayDate) {
        state.manuallyReleasedLessons = [];
        storage.set('last_reset_date', todayDate);
        dbSaveSettings({ manuallyReleasedLessons: state.manuallyReleasedLessons });
    }

    const now = getAccurateNow();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    let manualReleasesChanged = false;

    for (const courtName of state.courts) {
        const fixedStatus = getFixedStatus(courtName);
        if (!fixedStatus) continue;

        const existingBooking = state.bookings.find(b => b.court === courtName);

        // Preservar status manuais
        if (existingBooking && ['blocked', 'rain', 'tournament'].includes(existingBooking.type)) {
            // H.1: Badge de aula ignorada
            if (fixedStatus === 'lesson') {
                const logMsg = `Aula ignorada em "${courtName}" — quadra com status manual: ${existingBooking.type}`;
                if (!window._lastLogTime || Date.now() - window._lastLogTime > 300000) { // 5 min throttle
                    console.warn(`[${new Date().toLocaleTimeString('pt-BR')}] ⚠ ${logMsg}`);
                    showToast(`Aula ignorada na ${courtName} (bloqueio manual)`, "warning");
                    window._lastLogTime = Date.now();
                }
            }
            continue;
        }

        // H.3: Verificar se liberada até horário específico
        const manualRelease = state.manuallyReleasedLessons.find(m => m.court === courtName && m.date === todayDate);
        if (manualRelease) {
            // Se tem `until`, verificar se já passou o horário
            if (manualRelease.until) {
                const untilMins = timeToMinutes(manualRelease.until);
                if (currentMinutes < untilMins) {
                    continue; // Ainda dentro da liberação manual com horário
                } else {
                    // Horário atingido — remover entrada para a agenda voltar a controlar
                    state.manuallyReleasedLessons = state.manuallyReleasedLessons.filter(
                        m => !(m.court === courtName && m.date === todayDate)
                    );
                    manualReleasesChanged = true;
                }
            } else {
                continue; // Liberar até fim do período (comportamento original)
            }
        }

        if (fixedStatus === "lesson" && (!existingBooking || existingBooking.type !== "lesson")) {
            if (existingBooking) continue;

            const currentPeriod = getActiveScheduleFor(courtName);
            const lessonBooking = {
                id: Date.now() + Math.random(), court: courtName, type: "lesson",
                players: ["AULA"], startTime: currentPeriod ? currentPeriod.start : "00:00",
                observation: "Agenda Fixa"
            };
            state.bookings.push(lessonBooking);
            // Outro dispositivo pode ter criado uma reserva manual para essa
            // quadra bem nesse instante — se o banco recusar (sessions_court_active_unique),
            // desfaz a aula automática local em vez de deixá-la "fantasma" só aqui.
            dbInsertSession(lessonBooking, 'court').then(id => {
                if (!id) { state.bookings = state.bookings.filter(b => b !== lessonBooking); saveLocal(); render(); }
            });
        } else if (fixedStatus === "free" && existingBooking && existingBooking.type === "lesson") {
            if (existingBooking.observation !== "Agenda Fixa") continue;
            const endTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            let playDuration = 0;
            if (existingBooking.startTime) {
                try {
                    const [h1, m1] = existingBooking.startTime.split(':').map(Number);
                    const [h2, m2] = endTime.split(':').map(Number);
                    playDuration = (h2 * 60 + m2) - (h1 * 60 + m1);
                    if (playDuration < 0) playDuration += 24 * 60;
                } catch(e) {}
            }
            state.history.push({
                ...existingBooking, date: todayDate, weekday: weekdayName, endTime,
                playDuration: playDuration > 0 ? playDuration : 0, waitDuration: 0,
                activity: "AULA", encerradoPor: "automatico_22h" // G.1
            });
            state.bookings = state.bookings.filter(b => b.court !== courtName);
            dbUpdateSession(existingBooking.id, {
                status: 'history', date: todayDate, weekday: weekdayName, endTime,
                playDuration: playDuration > 0 ? playDuration : 0, waitDuration: 0, encerradoPor: 'automatico_22h'
            });
        }
    }
    if (manualReleasesChanged) dbSaveSettings({ manuallyReleasedLessons: state.manuallyReleasedLessons });
    if (_stateSignature() !== _sigBefore) saveLocal();
}

// H.4: Calcular próxima transição de quadra
/**
 * Calcula a próxima transição de status para a quadra
 * @param {string} courtName
 * @returns {{ label: string, color: string } | null}
 */
function getNextTransition(courtName) {
    const now = getAccurateNow();
    const dayOfWeek = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const schedules = FIXED_SCHEDULES[courtName];
    if (!schedules) return null;

    const daySchedules = schedules.filter(s => s.days.includes(dayOfWeek));
    if (daySchedules.length === 0) return null;

    // Encontrar o período atual
    for (const s of daySchedules) {
        const startMins = timeToMinutes(s.start);
        const endMins = timeToMinutes(s.end);
        if (currentMinutes >= startMins && currentMinutes < endMins) {
            // Está neste período — próxima transição é ao final deste
            if (s.status === 'lesson') {
                return { label: `Livre às ${s.end}`, color: 'text-emerald-400' };
            } else {
                // Encontrar o próximo período de aula
                const nextLesson = daySchedules.find(nx => nx.status === 'lesson' && timeToMinutes(nx.start) >= endMins);
                if (nextLesson) return { label: `Aula às ${nextLesson.start}`, color: 'text-amber-400' };
            }
        }
    }
    return null;
}

// H.1 + H.4: renderAdmin com badge de aula ignorada e indicador de próxima transição
