// CRUD de reservas e fila de espera: criar, editar, mover, encerrar, desfazer, drag-and-drop
// Função para encerrar todas as atividades às 22:00
function closeAllActivities(options) {
    // Só esportes tem permissão de escrita no banco (RLS) — publico/diretora
    // rodando essa automação em segundo plano só gerava erro de permissão.
    if (currentUser !== 'esportes') return;
    const opts = options || {};
    const now = getAccurateNow();
    // `dateStr` permite encerrar retroativamente um dia anterior (ver closeStaleActivities)
    const currentDate = opts.dateStr || now.toLocaleDateString('pt-BR');
    const weekdayName = (() => {
        const d = parseDate(currentDate);
        return d ? d.toLocaleDateString('pt-BR', { weekday: 'long' })
                 : now.toLocaleDateString('pt-BR', { weekday: 'long' });
    })();
    
    // Verificar se já encerramos hoje
    if (lastClosingDate === currentDate) {
        return;
    }
    
    const currentHour = now.getHours();
    
    // Verificar se é 22:00 ou depois (o fechamento retroativo ignora o horário)
    if (!opts.force && currentHour < 22) {
        return;
    }
    
    // Encerrar todas as atividades
    const endTime = "22:00";

    // No fechamento retroativo (opts.snapshot), usar o retrato capturado em
    // closeStaleActivities — não state.bookings ao vivo, que a essa altura já
    // pode ter sido sobrescrito pela carga do Supabase com as reservas de HOJE
    // (ver comentário em closeStaleActivities). Sem isso, reservas recém-criadas
    // eram arquivadas com a data antiga e desapareciam do quadro.
    const bookingsToClose = opts.snapshot ? opts.snapshot.bookings : [...state.bookings];
    for (const booking of bookingsToClose) {
        let playDuration = 0;
        if (booking.startTime) {
            try {
                const [h1, m1] = booking.startTime.split(':').map(Number);
                const h2 = 22;
                const m2 = 0;
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
        
        // Adicionar ao histórico
        state.history.push({
            ...booking,
            date: currentDate,
            weekday: weekdayName,
            endTime: endTime,
            playDuration: playDuration > 0 ? playDuration : 0,
            waitDuration: waitDuration > 0 ? waitDuration : 0,
            tempoEsperaMin: waitDuration > 0 ? waitDuration : 0,
            totalJogadores: (booking.players || []).length,
            periodoStr: getPeriodoStr(booking.startTime),
            activity: booking.type === 'lesson' ? "AULA" : (booking.activity || "OUTRO"),
            encerradoPor: "automatico_22h"
        });
    }

    // Remover só as reservas que foram de fato arquivadas — com snapshot,
    // isso preserva qualquer reserva nova que tenha entrado em state.bookings
    // depois que o retrato foi capturado (nunca zera o array inteiro nesse caso).
    const closedIds = new Set(bookingsToClose.map(b => b.id));
    state.bookings = state.bookings.filter(b => !closedIds.has(b.id));

    // Mover fila de espera para desistências
    const waitlistToClose = opts.snapshot ? opts.snapshot.waitlist : [...state.waitlist];
    for (const entry of waitlistToClose) {
        state.withdrawals.push({
            ...entry,
            withdrawnAt: endTime,
            withdrawnDate: currentDate
        });
    }
    const closedWaitlistIds = new Set(waitlistToClose.map(w => w.id));
    state.waitlist = state.waitlist.filter(w => !closedWaitlistIds.has(w.id));

    // Atualizar a última data de encerramento
    lastClosingDate = currentDate;
    storage.set('last_closing_date', lastClosingDate);

    saveLocal();
    dbUpsertSessionsBulk([
        ...bookingsToClose.map(b => {
            const h = state.history.find(x => x.id === b.id);
            return { id: b.id, status: 'history', history_date: ptBrDateToISO(currentDate), weekday: weekdayName, end_time: endTime, play_duration_min: h.playDuration, wait_duration_min: h.waitDuration, encerrado_por: 'automatico_22h' };
        }),
        ...waitlistToClose.map(w => ({ id: w.id, status: 'withdrawn', withdrawn_at: endTime, withdrawn_date: ptBrDateToISO(currentDate) }))
    ]);
    render();
    
    // Mostrar notificação
    if (opts.force) {
        showToast(`Atividades pendentes de ${currentDate} foram encerradas e gravadas no histórico.`, "info");
    } else {
        showToast("Todas as atividades encerradas automaticamente às 22:00!", "info");
    }
}

// Grava uma reserva no histórico com as métricas derivadas já calculadas.
function archiveBookingToHistory(booking, reason, endTimeStr) {
    const now = getAccurateNow();
    const endTime = endTimeStr || now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    let playDuration = 0;
    if (booking.startTime) {
        try {
            const [h1, m1] = booking.startTime.split(':').map(Number);
            const [h2, m2] = endTime.split(':').map(Number);
            playDuration = (h2 * 60 + m2) - (h1 * 60 + m1);
            if (playDuration < 0) playDuration += 24 * 60;
        } catch (e) {}
    }

    let waitDuration = 0;
    if (booking.registrationTime && booking.startTime && !booking.type) {
        try {
            const [h1, m1] = booking.registrationTime.split(':').map(Number);
            const [h2, m2] = booking.startTime.split(':').map(Number);
            waitDuration = (h2 * 60 + m2) - (h1 * 60 + m1);
        } catch (e) {}
    }

    state.history.push({
        ...booking,
        date: getTodayDate(),
        weekday: getWeekdayName(),
        endTime,
        playDuration: playDuration > 0 ? playDuration : 0,
        waitDuration: waitDuration > 0 ? waitDuration : 0,
        tempoEsperaMin: waitDuration > 0 ? waitDuration : 0,
        totalJogadores: (booking.players || []).length,
        periodoStr: getPeriodoStr(booking.startTime),
        activity: booking.type === 'lesson' ? "AULA" : (booking.activity || "OUTRO"),
        encerradoPor: reason
    });
    dbUpdateSession(booking.id, {
        status: 'history', date: getTodayDate(), weekday: getWeekdayName(), endTime,
        playDuration: playDuration > 0 ? playDuration : 0, waitDuration: waitDuration > 0 ? waitDuration : 0,
        encerradoPor: reason
    });
}

// Retrato das reservas/fila "de ontem" capturado na primeira detecção de
// virada de dia — antes que restoreSession()/loginAs() completem e a carga do
// Supabase sobrescreva state.bookings com as reservas de HOJE. closeStaleActivities
// tenta de novo a cada 30s até o login confirmar currentUser; sem congelar esse
// retrato, a tentativa que finalmente executa usaria state.bookings já atualizado
// e arquivaria reservas recém-criadas (de hoje) sob a data antiga, apagando-as
// do quadro assim que a recepção começasse a inserir dados.
let _staleActivitiesSnapshot = null;

// Fechamento retroativo. O encerramento das 22:00 só roda com a página aberta —
// se a recepção fechasse o navegador às 21h, na manhã seguinte as quadras
// apareciam ocupadas com os jogadores do dia anterior (e ficavam assim o dia
// inteiro), e o histórico daquele dia nunca era gravado.
function closeStaleActivities() {
    const todayDate = getTodayDate();
    const lastActive = storage.get('last_active_date');

    if (lastActive && lastActive !== todayDate) {
        if (!_staleActivitiesSnapshot) {
            _staleActivitiesSnapshot = { bookings: state.bookings.slice(), waitlist: state.waitlist.slice() };
        }
        if (_staleActivitiesSnapshot.bookings.length > 0 || _staleActivitiesSnapshot.waitlist.length > 0) {
            // No boot, restoreSession() ainda pode não ter restaurado currentUser
            // (é assíncrona) — closeAllActivities já se protege com esse mesmo
            // guard e vira um no-op nesse caso. Sem retornar aqui antes de marcar
            // "last_active_date", esse dia ficava marcado como processado mesmo
            // sem ter fechado nada, e o fechamento retroativo nunca mais era
            // tentado de novo (o setInterval seguinte já vê lastActive === todayDate).
            if (currentUser !== 'esportes') return;
            lastClosingDate = ''; // liberar o guard "já encerramos hoje" para a data anterior
            closeAllActivities({ force: true, dateStr: lastActive, snapshot: _staleActivitiesSnapshot });
        }
        _staleActivitiesSnapshot = null;
    }

    storage.set('last_active_date', todayDate);
}

// Reflete o estado real da conexão no indicador da barra e no painel de nuvem.

let currentBookingMode = 'court';

function updateActivityOptions(prefix = '') {
    const players = [];
    const idPrefix = prefix === 'edit' ? 'edit-p-name-' : 'p-name-';
    const activityId = prefix === 'edit' ? 'edit-activity' : 'field-activity';
    
    for(let i=0; i<4; i++) {
        const el = document.getElementById(`${idPrefix}${i}`);
        const n = el ? el.value : '';
        if(n) players.push(n);
    }
    const count = players.length;
    const select = document.getElementById(activityId);
    if (!select) return;
    const currentValue = select.value;
    let options = '';
    if (count === 1) {
        options = '<option value="Individual">🏃 Individual</option>';
    } else if (count === 2) {
        options = `
            <option value="Simples">🎾 Jogo Simples</option>
            <option value="Ranking infantil">🏆 Ranking Infantil</option>
            <option value="Ranking adulto">🏆 Ranking Adulto</option>
            <option value="Bate-bola">🔄 Bate-bola</option>
        `;
    } else if (count === 3) {
        options = '<option value="Bate-bola">🔄 Bate-bola</option>';
    } else if (count === 4) {
        options = '<option value="Dupla">🎾 Jogo Dupla</option>';
    } else {
        options = `
            <option value="Dupla">🎾 Jogo Dupla</option>
            <option value="Simples">🎾 Jogo Simples</option>
            <option value="Ranking infantil">🏆 Ranking Infantil</option>
            <option value="Ranking adulto">🏆 Ranking Adulto</option>
            <option value="Bate-bola">🔄 Bate-bola</option>
            <option value="Individual">🏃 Individual</option>
        `;
    }
    select.innerHTML = options;
    const newOptions = Array.from(select.options).map(o => o.value);
    if (newOptions.includes(currentValue)) select.value = currentValue;
    if (prefix !== 'edit') toggleDuration();
}

function openBookingModal(mode = 'court') {
    currentBookingMode = mode;
    showModal('booking-modal');
    gsap.fromTo("#booking-modal > div:last-child", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out" });
    const titleEl = document.getElementById('booking-modal-title');
    const subtitleEl = document.getElementById('booking-modal-subtitle');
    const courtBox = document.getElementById('court-field-box');
    if(mode === 'queue') {
        titleEl.innerText = "Inscrição na Fila";
        subtitleEl.innerText = "Entrar na fila de espera global";
        courtBox.classList.add('hidden');
        document.getElementById('field-court').required = false;
    } else {
        titleEl.innerText = "Inscrição Direta";
        subtitleEl.innerText = "Alocar diretamente em uma quadra livre";
        courtBox.classList.remove('hidden');
        document.getElementById('field-court').required = true;
    }
    document.getElementById('booking-form').reset();
    document.getElementById('field-observation').value = '';
    document.getElementById('field-start').value = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const select = document.getElementById('field-court');
    select.innerHTML = state.courts.map(c => `<option value="${c}">${c}</option>`).join('');
    const container = document.getElementById('player-rows');
    container.innerHTML = '';
    for(let i=0; i<4; i++) {
        container.innerHTML += `
            <div class="grid grid-cols-2 gap-4">
                <input type="text" placeholder="Título" oninput="searchMember(${i}, this.value)" class="input-glass p-4 rounded-2xl text-sm font-bold">
                <select id="p-name-${i}" onchange="updateActivityOptions()" class="input-glass p-4 rounded-2xl text-sm font-bold">
                    <option value="">Nome...</option>
                </select>
            </div>
        `;
    }
    updateActivityOptions();
}

function closeBookingModal() {
    gsap.to("#booking-modal > div:last-child", { scale: 0.8, opacity: 0, duration: 0.3, onComplete: () => {
        hideModal('booking-modal');
    }});
}

function toggleDuration() {
    const act = document.getElementById('field-activity').value;
    document.getElementById('dur-box').classList.toggle('hidden', act !== 'Bate-bola');
}

function searchMember(idx, title, prefix = '') {
    const cleanTitle = title.trim();
    let nameId;
    if (prefix === 'edit') nameId = `edit-p-name-${idx}`;
    else if (prefix === 'we') nameId = `we-p-name-${idx}`;
    else nameId = `p-name-${idx}`;
    if(!cleanTitle) {
        document.getElementById(nameId).innerHTML = '<option value="">Nome...</option>';
        updateActivityOptions(prefix);
        return;
    }
    let names = state.members[cleanTitle];
    if(!names) {
        const foundKey = Object.keys(state.members).find(k => k.trim() === cleanTitle);
        if(foundKey) names = state.members[foundKey];
    }
    if(!names) {
        const searchNum = parseFloat(cleanTitle);
        const foundKey = Object.keys(state.members).find(k => {
            const keyNum = parseFloat(k);
            return (!isNaN(searchNum) && !isNaN(keyNum) && searchNum === keyNum) || String(k).trim() === String(cleanTitle);
        });
        if(foundKey) names = state.members[foundKey];
    }
    const select = document.getElementById(nameId);
    if(names && names.length > 0) {
        // Sócios com nome real primeiro, "Convidado N" por último — mantém a
        // ordem original dentro de cada grupo (sort é estável).
        const sortedNames = names.slice().sort((a, b) => (/^convidado/i.test(a) ? 1 : 0) - (/^convidado/i.test(b) ? 1 : 0));
        select.innerHTML = '<option value="">Selecionar Nome...</option>' + sortedNames.map(n => `<option value="${n}">${n}</option>`).join('');
        updateActivityOptions(prefix);
    } else {
        select.innerHTML = '<option value="">Título não encontrado</option>';
        updateActivityOptions(prefix);
    }
    select.onchange = () => {
        const selectedName = select.value;
        if (!selectedName) return;
        const alreadyPlayedDupla = state.history.some(h => 
            h.date === getTodayDate() && h.activity === "Dupla" && h.titles && h.titles.includes(cleanTitle) && h.players && h.players.includes(selectedName)
        );
        if(alreadyPlayedDupla) showToast(`O sócio ${selectedName} (Título ${cleanTitle}) já jogou Dupla hoje! Ficará sem preferência (Regra 6.2).`, 'warning');
        updateActivityOptions(prefix);
    };
}

function openAdminAction(court) {
    state.activeAdminCourt = court;
    document.getElementById('admin-court-title').innerText = court;
    document.getElementById('admin-observation').value = '';
    showModal('admin-modal');
    gsap.fromTo("#admin-modal > div:last-child", { y: 100, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 });
}

function closeAdminModal() { hideModal('admin-modal'); }

function openMoveModal(id) {
    activeMoveId = id;
    const container = document.getElementById('move-court-options');
    container.innerHTML = state.courts.map(c => {
        const isOccupied = state.bookings.some(b => b.court === c);
        const btnClass = isOccupied ? "bg-white/5 border-white/10 text-gray-500 cursor-not-allowed" : "bg-indigo-500/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-500 hover:text-white";
        return `<button onclick="${isOccupied ? '' : `moveToCourt('${c}')`}" class="w-full py-4 rounded-2xl border font-black uppercase tracking-widest text-xs transition-all flex justify-between items-center px-6 ${btnClass}"><span>${c}</span>${isOccupied ? '<span class="text-[8px] bg-red-500/20 text-red-400 px-2 py-1 rounded-lg">OCUPADA</span>' : '<i class="fas fa-chevron-right"></i>'}</button>`;
    }).join('');
    showModal('move-modal');
    gsap.fromTo("#move-modal > div:last-child", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out" });
}
function closeMoveModal() {
    gsap.to("#move-modal > div:last-child", { scale: 0.8, opacity: 0, duration: 0.3, onComplete: () => {
        hideModal('move-modal');
    }});
}

function moveToCourt(court) {
    const waitIdx = state.waitlist.findIndex(w => String(w.id) === String(activeMoveId));
    if (waitIdx !== -1) {
        const entry = state.waitlist.splice(waitIdx, 1)[0];
        entry.court = court;
        entry.registrationTime = entry.registrationTime || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        entry.startTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        if(entry.activity === "Bate-bola") {
            const [h, m] = entry.startTime.split(':').map(Number);
            const end = new Date();
            end.setHours(h + 1, m);
            entry.endTime = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }
        state.bookings.push(entry);
        saveLocal();
        dbUpdateSession(entry.id, { status: 'court', court: entry.court, registrationTime: entry.registrationTime, startTime: entry.startTime, endTime: entry.endTime });
        render(); closeMoveModal();
        showToast(`${entry.players[0]} movido para a ${court}`, "success");
        confetti({ particleCount: 100, spread: 50, origin: { y: 0.8 } });
    }
}

let activeEditCourt = null;
function openEditModal(court) {
    activeEditCourt = court;
    const b = state.bookings.find(book => book.court === court);
    if(b) {
        const container = document.getElementById('edit-player-rows');
        // Montar as 4 linhas numa única atribuição a innerHTML: escrever
        // dentro do loop com `+=` reserializa o container a cada volta, o que
        // apaga o select.value já setado nas linhas anteriores (select.value é
        // uma propriedade do DOM, não um atributo HTML — não sobrevive a essa
        // reserialização). Por isso editar sempre pedia pra reinserir tudo.
        let rowsHtml = '';
        for(let i=0; i<4; i++) {
            const title = (b.titles && b.titles[i]) || '';
            rowsHtml += `
                <div class="grid grid-cols-2 gap-4">
                    <input type="text" id="edit-p-title-${i}" value="${title}" placeholder="Título" oninput="searchMember(${i}, this.value, 'edit')" class="input-glass p-4 rounded-2xl text-sm font-bold">
                    <select id="edit-p-name-${i}" onchange="updateActivityOptions('edit')" class="input-glass p-4 rounded-2xl text-sm font-bold">
                        <option value="">Nome...</option>
                    </select>
                </div>
            `;
        }
        container.innerHTML = rowsHtml;
        for(let i=0; i<4; i++) {
            const title = (b.titles && b.titles[i]) || '';
            const player = (b.players && b.players[i]) || '';
            if(title) {
                searchMember(i, title, 'edit');
                const select = document.getElementById(`edit-p-name-${i}`);
                if(select) select.value = player;
            }
        }
        updateActivityOptions('edit');
        document.getElementById('edit-activity').value = b.activity;
        document.getElementById('edit-observation').value = b.observation || '';
        document.getElementById('edit-registration').value = b.registrationTime || '';
        document.getElementById('edit-start').value = b.startTime || '';
        showModal('edit-modal');
        gsap.fromTo("#edit-modal > div:last-child", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out" });
    }
}
function closeEditModal() { hideModal('edit-modal'); }
function saveEdit() {
    const b = state.bookings.find(book => book.court === activeEditCourt);
    if(b) {
        const players = [], titles = [];
        const activity = document.getElementById('edit-activity').value;
        for(let i=0; i<4; i++) {
            const t = document.getElementById(`edit-p-title-${i}`).value.trim();
            const n = document.getElementById(`edit-p-name-${i}`).value;
            if(t && n) {
                players.push(n); titles.push(t);
            }
        }

        if(players.length === 0) return showToast("Adicione jogadores!", "error");
        if(activity === "Dupla" && players.length !== 4) return showToast("Reserva de Dupla exige exatamente 4 jogadores!", "error");
        if((activity === "Simples" || activity === "Ranking infantil" || activity === "Ranking adulto") && players.length !== 2) return showToast(`A atividade ${activity} exige exatamente 2 jogadores!`, "error");
        if(activity === "Individual" && players.length !== 1) return showToast("Atividade Individual exige exatamente 1 jogador!", "error");
        if(activity === "Bate-bola" && (players.length < 2 || players.length > 3)) {
            if(players.length === 4) return showToast("Com 4 jogadores, selecione a opção Dupla!", "error");
            return showToast("Bate-bola permitido para 2 ou 3 jogadores!", "error");
        }

        b.players = players;
        b.titles = titles;
        b.activity = activity;
        b.observation = document.getElementById('edit-observation').value.trim();
        b.registrationTime = document.getElementById('edit-registration').value;
        b.startTime = document.getElementById('edit-start').value;
        if(b.activity === "Bate-bola" && b.startTime) {
            const [h, m] = b.startTime.split(':').map(Number);
            const end = new Date();
            end.setHours(h + 1, m);
            b.endTime = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }
        saveLocal();
        dbUpdateSession(b.id, { activity: b.activity, observation: b.observation, registrationTime: b.registrationTime, startTime: b.startTime, endTime: b.endTime }, { players: b.players, titles: b.titles });
        render(); closeEditModal();
        showToast("Alterações salvas!", "success");
    }
}

const memberForm = document.getElementById('member-form');
if(memberForm) {
    memberForm.onsubmit = (e) => {
        e.preventDefault();
        const title = document.getElementById('mem-title').value.trim();
        const names = document.getElementById('mem-names').value.split(',').map(n => n.trim()).filter(n => n !== '');
        if(title && names.length > 0) {
            state.members[title] = names;
            saveLocal();
            dbUpsertMember(title, names);
            showToast(`Sócio ${title} cadastrado com sucesso!`, 'success');
            closeMemberModal(); document.getElementById('member-form').reset();
        }
    };
}

function setCourtStatus(type) {
    const obs = document.getElementById('admin-observation').value.trim();
    if(type === 'free') {
        // Se for liberar, usar a função releaseCourt que adiciona ao histórico
        releaseCourt(state.activeAdminCourt);
    } else {
        // Para outros status, remover qualquer reserva existente e adicionar o novo status
        const _court = state.activeAdminCourt;
        const _existing = state.bookings.find(b => b.court === _court);
        // Se havia atividade em andamento, gravar no histórico antes de sobrescrever.
        // Antes o registro era descartado em silêncio, sem confirmação e sem volta.
        if (_existing && !['blocked', 'rain', 'tournament'].includes(_existing.type)) {
            const _label = (_existing.players || []).join(', ') || 'atividade em andamento';
            if (!confirm(`A ${_court} tem uma atividade em andamento (${_label}).\n\nEla será encerrada e registrada no histórico. Continuar?`)) {
                return;
            }
            archiveBookingToHistory(_existing, `encerrado_por_${type}`);
        }
        state.bookings = state.bookings.filter(b => b.court !== state.activeAdminCourt);
        const statusBooking = {
            id: Date.now(), court: state.activeAdminCourt, type: type,
            activity: type.toUpperCase(),
            players: [type.toUpperCase()], observation: obs, startTime: new Date().toTimeString().slice(0,5)
        };
        state.bookings.push(statusBooking);
        saveLocal();
        dbInsertSession(statusBooking, 'court').then(render);
        render();
        showToast(`Status da quadra atualizado!`, 'success');
    }
    closeAdminModal();
}

const bookingForm = document.getElementById('booking-form');
if(bookingForm) {
    bookingForm.onsubmit = (e) => {
        e.preventDefault();
        const players = [], titles = [];
        let repeat = false;
        const activity = document.getElementById('field-activity').value;
        for(let i=0; i<4; i++) {
            const t = document.querySelector(`#player-rows div:nth-child(${i+1}) input`).value;
            const n = document.getElementById(`p-name-${i}`).value;
            if(t && n) {
                players.push(n); titles.push(t);
                if(activity === "Dupla" && state.history.some(h => h.date === getTodayDate() && h.activity === "Dupla" && h.titles && h.titles.includes(t) && h.players && h.players.includes(n))) repeat = true;
            }
        }
        if(players.length === 0) return showToast("Adicione jogadores!", "error");
        if(activity === "Dupla" && players.length !== 4) return showToast("Reserva de Dupla exige exatamente 4 jogadores!", "error");
        if((activity === "Simples" || activity === "Ranking infantil" || activity === "Ranking adulto") && players.length !== 2) return showToast(`A atividade ${activity} exige exatamente 2 jogadores!`, "error");
        if(activity === "Individual" && players.length !== 1) return showToast("Atividade Individual exige exatamente 1 jogador!", "error");
        if(activity === "Bate-bola" && (players.length < 2 || players.length > 3)) {
            if(players.length === 4) return showToast("Com 4 jogadores, selecione a opção Dupla!", "error");
            return showToast("Bate-bola permitido para 2 ou 3 jogadores!", "error");
        }
        const entry = {
            id: Date.now(), court: currentBookingMode === 'queue' ? null : document.getElementById('field-court').value,
            activity, registrationTime: document.getElementById('field-start').value, registrationDate: new Date().toLocaleDateString('pt-BR'),
            startTime: null, endTime: null, observation: document.getElementById('field-observation').value.trim(), players, titles, repeat
        };
        if(currentBookingMode === 'queue') {
            entry.queuePosition = state.waitlist.length;
            state.waitlist.push(entry); showToast("Adicionado à fila de espera!", "info");
            saveLocal(); dbInsertSession(entry, 'waitlist');
        } else processEntry(entry);
        closeBookingModal(); render();
    };
}

async function processEntry(entry) {
    const court = entry.court;
    const occupied = state.bookings.find(b => b.court === court);
    if(occupied || entry.repeat) {
        entry.queuePosition = state.waitlist.length;
        state.waitlist.push(entry);
        if(entry.repeat) showToast("Sócio já jogou hoje: Fim da fila.", "warning");
        else showToast("Quadra ocupada: Movido para a fila.", "info");
        saveLocal();
        const id = await dbInsertSession(entry, 'waitlist');
        if (!id) { state.waitlist = state.waitlist.filter(w => w !== entry); saveLocal(); render(); }
    } else {
        entry.startTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        if(entry.activity === "Bate-bola") {
            const [h, m] = entry.startTime.split(':').map(Number);
            const end = new Date(); end.setHours(h + 1, m);
            entry.endTime = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }
        state.bookings.push(entry);
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        saveLocal();
        const id = await dbInsertSession(entry, 'court');
        if (!id) {
            // Banco recusou (ex.: outro dispositivo ocupou a mesma quadra
            // por uma fração de segundo antes, via sessions_court_active_unique)
            // — desfaz a reserva otimista local e busca o estado real. Sem
            // isso, ela ficava "fantasma" só neste aparelho até o próximo F5
            // apagá-la sem explicação nenhuma.
            state.bookings = state.bookings.filter(b => b !== entry);
            saveLocal();
            showToast(`A ${court} já foi ocupada por outro dispositivo — atualizando...`, "warning");
            await loadStateIncremental('sessions');
        }
    }
}


function initSortable() {
    let scrollDirection = 0, rafId = null;
    function performScroll() {
        if (scrollDirection !== 0) { window.scrollBy(0, scrollDirection * 25); rafId = requestAnimationFrame(performScroll); }
        else rafId = null;
    }
    function startScrolling(dir) {
        if (scrollDirection !== dir) { scrollDirection = dir; if (!rafId) rafId = requestAnimationFrame(performScroll); }
    }
    function stopScrolling() {
        scrollDirection = 0; if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }
    const handleGlobalMove = (e) => {
        const y = e.clientY || (e.touches ? e.touches[0].clientY : 0);
        const height = window.innerHeight, margin = 160;
        if (y < margin) startScrolling(-1); else if (y > height - margin) startScrolling(1); else stopScrolling();
    };
    const el = document.getElementById('admin-waitlist');
    if (el) {
        new Sortable(el, {
            group: 'shared', animation: 150, ghostClass: 'drag-ghost', chosenClass: 'drag-chosen', scroll: false, forceAutoScroll: false, delay: 0,
            onStart: () => {
                document.body.classList.add('dragging-active');
                document.querySelectorAll('.court-drop-zone').forEach(z => z.classList.add('drag-over'));
                window.addEventListener('mousemove', handleGlobalMove, { passive: false });
                window.addEventListener('touchmove', handleGlobalMove, { passive: false });
            },
            onEnd: () => {
                document.body.classList.remove('dragging-active');
                document.querySelectorAll('.court-drop-zone').forEach(z => z.classList.remove('drag-over'));
                window.removeEventListener('mousemove', handleGlobalMove);
                window.removeEventListener('touchmove', handleGlobalMove);
                stopScrolling();
                const newOrder = Array.from(el.children).map(child => {
                    const id = child.getAttribute('data-id');
                    return state.waitlist.find(w => String(w.id) === id);
                }).filter(Boolean);
                state.waitlist = newOrder;
                saveLocal();
                dbUpsertSessionsBulk(newOrder.map((w, i) => { w.queuePosition = i; return { id: w.id, status: 'waitlist', queue_position: i }; }));
            }
        });
    }
    document.querySelectorAll('.court-drop-zone').forEach(zone => {
        const court = zone.getAttribute('data-court');
        new Sortable(zone, {
            group: 'shared', animation: 150, ghostClass: 'drag-ghost', chosenClass: 'drag-chosen', scroll: false, forceAutoScroll: false,
            onStart: () => {
                document.body.classList.add('dragging-active');
                document.querySelectorAll('.court-drop-zone').forEach(z => z.classList.add('drag-over'));
                window.addEventListener('mousemove', handleGlobalMove, { passive: false });
                window.addEventListener('touchmove', handleGlobalMove, { passive: false });
            },
            onEnd: () => {
                document.body.classList.remove('dragging-active');
                document.querySelectorAll('.court-drop-zone').forEach(z => z.classList.remove('drag-over'));
                window.removeEventListener('mousemove', handleGlobalMove);
                window.removeEventListener('touchmove', handleGlobalMove);
                stopScrolling();
            },
            onAdd: (evt) => {
                const id = evt.item.getAttribute('data-id'), courtFrom = evt.from.getAttribute('data-court');
                if (evt.from.id === 'admin-waitlist') {
                    const waitIdx = state.waitlist.findIndex(w => String(w.id) === id);
                    if (waitIdx !== -1) {
                        const entry = state.waitlist.splice(waitIdx, 1)[0];
                        entry.court = court;
                        entry.registrationTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                        entry.startTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                        if(entry.activity === "Bate-bola") {
                            const [h, m] = entry.startTime.split(':').map(Number);
                            const end = new Date(); end.setHours(h + 1, m);
                            entry.endTime = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                        }
                        state.bookings.push(entry);
                        saveLocal();
                        dbUpdateSession(entry.id, { status: 'court', court: entry.court, registrationTime: entry.registrationTime, startTime: entry.startTime, endTime: entry.endTime });
                        render();
                        showToast(`${entry.players[0]} movido para a ${court}`, "success");
                    }
                } else if (courtFrom) {
                    const bookingA = state.bookings.find(b => b.court === courtFrom);
                    const bookingB = state.bookings.find(b => b.court === court);
                    if (bookingA) {
                        bookingA.court = court;
                        saveLocal();
                        if (bookingB) {
                            bookingB.court = courtFrom;
                            showToast(`Jogos trocados entre ${courtFrom} e ${court}`, "info");
                            dbUpsertSessionsBulk([{ id: bookingA.id, status: 'court', court_id: getCourtId(court) }, { id: bookingB.id, status: 'court', court_id: getCourtId(courtFrom) }]);
                        } else {
                            showToast(`Jogo movido para a ${court}`, "info");
                            dbUpdateSession(bookingA.id, { court });
                        }
                        render();
                    }
                }
            }
        });
    });
}


function startMatch(court) {
    const booking = state.bookings.find(b => b.court === court);
    if(booking) {
        booking.startTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        if(booking.activity === "Bate-bola") {
            const [h, m] = booking.startTime.split(':').map(Number);
            const end = new Date(); end.setHours(h + 1, m);
            booking.endTime = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }
        saveLocal();
        dbUpdateSession(booking.id, { startTime: booking.startTime, endTime: booking.endTime });
        render(); showToast("Partida iniciada!", "success");
    }
}

function removeFromWaitlist(id) {
    if(confirm("Deseja remover este grupo da fila de espera?")) {
        const idx = state.waitlist.findIndex(w => String(w.id) === String(id));
        if(idx !== -1) {
            const withdrawnEntry = state.waitlist.splice(idx, 1)[0];
            const withdrawnAt = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const withdrawnDate = new Date().toLocaleDateString('pt-BR');
            state.withdrawals.push({ ...withdrawnEntry, withdrawnAt, withdrawnDate });
            saveLocal();
            dbUpdateSession(withdrawnEntry.id, { status: 'withdrawn', withdrawnAt, withdrawnDate });
            render(); showToast("Grupo removido da fila!", "info");
        }
    }
}

function clearAllData() {
    if(confirm("Deseja apagar TODOS os dados do sistema?")) {
        state.bookings = []; state.waitlist = []; state.history = []; state.withdrawals = [];
        saveLocal();
        dbDeleteAllSessions();
        render(); showToast("Sistema reiniciado!", "info");
    }
}


function revertHistoryEntry(historyId) {
    const idx = state.history.findIndex(h => String(h.id) === String(historyId));
    if (idx === -1) return showToast("Entrada não encontrada!", "error");

    const entry = state.history[idx];
    const targetCourt = entry.court;
    const courtOccupied = state.bookings.some(b => b.court === targetCourt);

    saveLocal();
    if (courtOccupied) {
        if (!confirm(`A ${targetCourt} está ocupada. Deseja mover para a fila de espera?`)) return;
        state.history.splice(idx, 1);
        const { date, weekday, endTime, playDuration, waitDuration, encerradoPor, ...waitEntry } = entry;
        waitEntry.registrationTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        delete waitEntry.startTime;
        state.waitlist.unshift(waitEntry);
        state.waitlist.forEach((w, i) => { w.queuePosition = i; });
        dbUpdateSession(entry.id, { status: 'waitlist', registrationTime: waitEntry.registrationTime, startTime: null, queuePosition: 0 })
            .then(() => dbUpsertSessionsBulk(state.waitlist.slice(1).map(w => ({ id: w.id, status: 'waitlist', queue_position: w.queuePosition }))));
        showToast(`${entry.players[0]} movido para a fila!`, "info");
    } else {
        state.history.splice(idx, 1);
        const { date, weekday, endTime, playDuration, waitDuration, encerradoPor, ...restoredBooking } = entry;
        // Restaurar como booking ativo com dados originais
        state.bookings.push(restoredBooking);
        dbUpdateSession(entry.id, { status: 'court', court: targetCourt });
        // Se era aula manual, remover de manuallyReleasedLessons para agenda voltar a controlar
        if (entry.type === 'lesson' || entry.activity === 'AULA') {
            state.manuallyReleasedLessons = state.manuallyReleasedLessons.filter(
                m => !(m.court === targetCourt && m.date === getTodayDate())
            );
            dbSaveSettings({ manuallyReleasedLessons: state.manuallyReleasedLessons });
        }
        showToast(`Atividade revertida para a ${targetCourt}!`, "success");
    }

    closeUndoModal();
    render();
}

/** Abre o modal de reversão listando atividades encerradas hoje (máx 15, mais recentes primeiro) 
 * @param {string} courtName - Opcional: filtrar por quadra específica
 */
function openUndoModal(courtName = null) {
    const todayDate = getTodayDate();
    let todayHistory = state.history.filter(h => h.date === todayDate);
    
    if (courtName) {
        todayHistory = todayHistory.filter(h => h.court === courtName);
    }

    todayHistory = todayHistory.slice().reverse().slice(0, 15);

    const list = document.getElementById('undo-list');
    if (!list) return;

    if (todayHistory.length === 0) {
        list.innerHTML = `<p class="text-center text-gray-500 py-8 font-bold">Nenhuma atividade encerrada hoje${courtName ? ' para ' + courtName : ''}.</p>`;
    } else {
        list.innerHTML = todayHistory.map(h => {
            const diffMs = new Date() - new Date(`${h.date.split('/').reverse().join('-')}T${h.endTime}`);
            const diffHours = diffMs / (1000 * 60 * 60);
            const warning = diffHours > 3 ? '<span class="text-[8px] text-red-400 font-black ml-2">⚠ Encerrado há >3h</span>' : '';
            
            return `
                <div class="glass-card p-4 rounded-2xl border border-white/10 flex justify-between items-center gap-4">
                    <div class="flex-1 min-w-0">
                        <p class="text-xs font-black text-white truncate">${(h.players || []).join(', ')} ${warning}</p>
                        <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">${h.court} · ${h.activity || 'JOGO'} · ${h.startTime || '--:--'} → ${h.endTime || '--:--'}</p>
                    </div>
                    <button onclick="revertHistoryEntry('${h.id}')" class="shrink-0 px-4 py-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 font-black text-[9px] uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all">
                        <i class="fas fa-rotate-left mr-1"></i>Reverter
                    </button>
                </div>
            `;
        }).join('');
    }

    showModal('undo-modal');
}

/** Fecha o modal de reversão */
function closeUndoModal() {
    hideModal('undo-modal');
}

// ============================================================
// TAREFA G — Analytics e Exportações aprimoradas
// ============================================================

/**
 * Retorna o nome do período (Manhã/Tarde/Noite/--) de acordo com um horário HH:MM
 * @param {string} timeStr - Horário no formato HH:MM
 * @returns {string}
 */

let activeWaitlistEditId = null;

function openWaitlistEditModal(id) {
    const item = state.waitlist.find(w => String(w.id) === String(id));
    if (!item) return;
    activeWaitlistEditId = id;

    // Subtítulo
    const idx = state.waitlist.findIndex(w => String(w.id) === String(id));
    document.getElementById('waitlist-edit-subtitle').textContent = `Grupo ${idx + 1} · Inscrito às ${item.registrationTime}`;

    // Atividade
    document.getElementById('we-activity').value = item.activity || 'Dupla';

    // Horário de inscrição
    document.getElementById('we-registration-time').value = item.registrationTime || '';

    // Observação
    document.getElementById('we-observation').value = item.observation || '';

    // Renderizar linhas de jogadores
    renderWaitlistEditPlayerRows(item);

    // Mostrar modal
    showModal('waitlist-edit-modal');
    gsap.fromTo("#waitlist-edit-modal > div:last-child", { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out" });
}

function closeWaitlistEditModal() {
    gsap.to("#waitlist-edit-modal > div:last-child", { scale: 0.85, opacity: 0, duration: 0.3, onComplete: () => {
        hideModal('waitlist-edit-modal');
        activeWaitlistEditId = null;
    }});
}

function renderWaitlistEditPlayerRows(item) {
    const activity = document.getElementById('we-activity').value;
    let numPlayers = 4;
    if (activity === 'Simples' || activity === 'Ranking adulto' || activity === 'Ranking infantil') numPlayers = 2;
    else if (activity === 'Individual') numPlayers = 1;
    else if (activity === 'Bate-bola') numPlayers = 3;

    const container = document.getElementById('we-player-rows');
    container.innerHTML = '';
    for (let i = 0; i < numPlayers; i++) {
        const existingPlayer = item && item.players && item.players[i] ? item.players[i] : '';
        const existingTitle = item && item.titles && item.titles[i] ? item.titles[i] : '';
        container.innerHTML += `
            <div class="grid grid-cols-2 gap-3" id="we-row-${i}">
                <input type="text" id="we-title-${i}" placeholder="Título" value="${existingTitle}"
                    oninput="searchMember(${i}, this.value, 'we')"
                    class="input-glass p-3 rounded-xl text-sm font-bold">
                <select id="we-p-name-${i}" class="input-glass p-3 rounded-xl text-sm font-bold">
                    ${existingPlayer
                        ? `<option value="${existingPlayer}" selected>${existingPlayer}</option>`
                        : `<option value="">Nome...</option>`}
                </select>
            </div>`;
    }
}

function updateWaitlistEditPlayerRows() {
    const item = state.waitlist.find(w => String(w.id) === String(activeWaitlistEditId));
    renderWaitlistEditPlayerRows(item || {});
}

function saveWaitlistEdit() {
    const idx = state.waitlist.findIndex(w => String(w.id) === String(activeWaitlistEditId));
    if (idx === -1) return;

    const activity = document.getElementById('we-activity').value;
    const registrationTime = document.getElementById('we-registration-time').value;
    const observation = document.getElementById('we-observation').value.trim();

    // Coletar jogadores e títulos
    const players = [], titles = [];
    let numPlayers = 4;
    if (activity === 'Simples' || activity === 'Ranking adulto' || activity === 'Ranking infantil') numPlayers = 2;
    else if (activity === 'Individual') numPlayers = 1;
    else if (activity === 'Bate-bola') numPlayers = 3;

    for (let i = 0; i < numPlayers; i++) {
        const titleInput = document.getElementById(`we-title-${i}`);
        const nameSelect = document.getElementById(`we-p-name-${i}`);
        if (titleInput && nameSelect && titleInput.value && nameSelect.value) {
            titles.push(titleInput.value.trim());
            players.push(nameSelect.value);
        }
    }

    if (players.length === 0) return showToast("Adicione pelo menos um jogador!", "error");

    // Verificar regra de SEM PREFERÊNCIA (dupla)
    let repeat = false;
    if (activity === "Dupla") {
        for (let i = 0; i < titles.length; i++) {
            if (state.history.some(h => h.date === getTodayDate() && h.activity === "Dupla" && h.titles && h.titles.includes(titles[i]) && h.players && h.players.includes(players[i]))) {
                repeat = true;
                break;
            }
        }
    }

    // Atualizar entry
    state.waitlist[idx] = {
        ...state.waitlist[idx],
        activity,
        registrationTime: registrationTime || state.waitlist[idx].registrationTime,
        observation,
        players,
        titles,
        repeat
    };

    saveLocal();
    dbUpdateSession(state.waitlist[idx].id, { activity, registrationTime: state.waitlist[idx].registrationTime, observation, repeat }, { players, titles });
    render();
    closeWaitlistEditModal();
    showToast("Grupo da fila atualizado!", "success");
}

// ============================================================
// GERENCIAMENTO DE SUB-ABAS DE HORÁRIOS DE AULAS
// ============================================================

/**
 * Alterna entre as sub-abas de horários (Editor / Visualizar Semana)
 */
