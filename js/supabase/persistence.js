// Cliente Supabase: leitura/escrita incremental por linha e sincronização em tempo real
let lastClosingDate = storage.get('last_closing_date') || '';
let supabaseClient = null;
let courtIdByName = {};
let memberIdByTitle = {};
let _realtimeChannel = null;
let _publicPollTimer = null;
let _isLoadingState = false;

function initSupabase() {
    if (!SUPABASE_URL.startsWith('http')) {
        showToast("Configure SUPABASE_URL e SUPABASE_ANON_KEY no topo do arquivo!", "warning");
        return;
    }
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function ptBrDateToISO(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function isoDateToPtBr(dateStr) {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function getCourtId(name) { return courtIdByName[name] || null; }
function getCourtName(id) { return Object.keys(courtIdByName).find(n => courtIdByName[n] === id) || null; }


let _lastConnectionState = null;
let _connectionToastsReady = false;
setTimeout(() => { _connectionToastsReady = true; }, 8000);

function setConnectionState(online) {
    const dot = document.getElementById('conn-dot');
    const label = document.getElementById('conn-label');
    if (dot) {
        dot.classList.toggle('bg-emerald-400', online);
        dot.classList.toggle('animate-pulse', online);
        dot.classList.toggle('bg-red-500', !online);
    }
    if (label) {
        label.innerText = online ? 'ONLINE' : 'OFFLINE';
        label.classList.toggle('text-emerald-400', online);
        label.classList.toggle('text-red-400', !online);
    }
    const statusEl = document.getElementById('cloud-status');
    if (statusEl) {
        statusEl.innerText = online ? 'CONECTADO' : 'SEM CONEXÃO';
        statusEl.classList.remove('text-gray-500');
        statusEl.classList.toggle('text-emerald-400', online);
        statusEl.classList.toggle('text-red-400', !online);
    }
    if (_connectionToastsReady && _lastConnectionState !== null && _lastConnectionState !== online) {
        showToast(
            online ? 'Conexão restabelecida — sincronizando.'
                   : 'Sem conexão! As alterações ficam só neste dispositivo até a internet voltar.',
            online ? 'success' : 'warning'
        );
    }
    _lastConnectionState = online;
}

// --- Leitura: reconstrói o state local a partir das tabelas do Supabase.
// Nunca faz merge parcial — o servidor é sempre a verdade completa, o que
// por si só impede o bug antigo de uma aba desatualizada apagar o banco.
// O "Max Rows" da API do Supabase (padrão 1000) corta a resposta no servidor
// mesmo que o cliente peça um .range() maior — só pedir um intervalo maior
// não resolve. A única forma confiável de trazer tudo é paginar de verdade:
// buscar em blocos e continuar até a página vir menor que o tamanho pedido.
//
// Crítico: sem uma ordenação que NUNCA empata, o Postgres não garante a
// mesma ordem entre a consulta da página 1 e a da página 2 — com milhares
// de linhas empatadas (ex.: session_players.position repete 0,1,2,3 em
// milhares de sessões), isso fazia linhas inteiras desaparecerem em
// silêncio entre uma página e outra (o "só aparece 1 jogador" era exatamente
// isso). `id` é único por linha, então ordenar por ele sempre garante uma
// ordem estável e cobertura completa.
// Busca a 1ª página já pedindo a contagem total, depois dispara todas as
// páginas restantes em paralelo (em vez de uma de cada vez) — como isso
// roda a cada reconexão em tempo real, buscar página por página em série
// deixava qualquer atualização visivelmente lenta com milhares de linhas.
async function fetchAllRows(table, applyQuery) {
    const pageSize = 1000;
    const buildQuery = (withCount) => {
        let q = supabaseClient.from(table).select('*', withCount ? { count: 'exact' } : undefined);
        if (applyQuery) q = applyQuery(q);
        return q.order('id');
    };
    const first = await buildQuery(true).range(0, pageSize - 1);
    if (first.error) return { data: null, error: first.error };
    const total = first.count ?? first.data.length;
    if (!first.data || first.data.length < pageSize || total <= pageSize) {
        return { data: first.data || [], error: null };
    }
    const pageCount = Math.ceil(total / pageSize);
    const rest = await Promise.all(
        Array.from({ length: pageCount - 1 }, (_, i) => {
            const p = i + 1;
            return buildQuery(false).range(p * pageSize, p * pageSize + pageSize - 1);
        })
    );
    const failed = rest.find(r => r.error);
    if (failed) return { data: null, error: failed.error };
    return { data: first.data.concat(...rest.map(r => r.data || [])), error: null };
}

// Cada load* busca só a tabela que muda com aquele tipo de evento — recarregar
// as 6 tabelas inteiras (incluindo os ~1400 sócios) a cada reserva criada era
// o principal motivo do delay "não instantâneo" no tempo real.
async function loadCourts() {
    const res = await supabaseClient.from('courts').select('*').order('sort_order');
    if (res.error) { console.error('Erro ao carregar "courts" do Supabase:', res.error); return false; }
    courtIdByName = {};
    (res.data || []).forEach(c => { courtIdByName[c.name] = c.id; });
    state.courts = (res.data || []).map(c => c.name);
    return true;
}

async function loadMembers() {
    const [membersRes, namesRes] = await Promise.all([fetchAllRows('members'), fetchAllRows('member_names')]);
    if (membersRes.error || namesRes.error) {
        console.error('Erro ao carregar sócios do Supabase:', membersRes.error || namesRes.error);
        return false;
    }
    memberIdByTitle = {};
    const namesByMember = {};
    (namesRes.data || []).forEach(n => {
        (namesByMember[n.member_id] = namesByMember[n.member_id] || []).push(n.name);
    });
    const newMembers = {};
    (membersRes.data || []).forEach(m => {
        memberIdByTitle[m.membership_number] = m.id;
        newMembers[m.membership_number] = namesByMember[m.id] || [];
    });
    state.members = newMembers;
    return true;
}

async function loadSettings() {
    const res = await supabaseClient.from('club_settings').select('*').eq('id', 1).single();
    if (res.error) { console.error('Erro ao carregar "club_settings" do Supabase:', res.error); return false; }
    if (res.data) {
        state.settings.clubName = res.data.club_name;
        state.settings.primaryColor = res.data.primary_color;
        state.settings.theme = res.data.theme;
        state.settings.performanceMode = res.data.performance_mode;
        state.manuallyReleasedLessons = res.data.manually_released_lessons || [];
    }
    return true;
}

function _sessionRowToLocal(s, rowPlayersSorted) {
    const local = {
        id: s.id,
        court: s.court_id ? getCourtName(s.court_id) : null,
        type: s.type || undefined,
        activity: s.activity,
        startTime: s.start_time,
        endTime: s.end_time,
        registrationTime: s.registration_time,
        registrationDate: isoDateToPtBr(s.registration_date),
        observation: s.observation,
        repeat: s.repeat,
        promotedFrom: s.promoted_from || undefined,
        players: rowPlayersSorted.map(p => p.name_snapshot),
        titles: rowPlayersSorted.map(p => p.title_snapshot || ''),
        queuePosition: s.queue_position
    };
    if (s.status === 'history') {
        local.date = isoDateToPtBr(s.history_date);
        local.weekday = s.weekday;
        local.playDuration = s.play_duration_min || 0;
        local.waitDuration = s.wait_duration_min || 0;
        local.tempoEsperaMin = s.wait_duration_min || 0;
        local.totalJogadores = rowPlayersSorted.length;
        local.periodoStr = getPeriodoStr(s.start_time);
        local.encerradoPor = s.encerrado_por;
    }
    if (s.status === 'withdrawn') {
        local.withdrawnAt = s.withdrawn_at;
        local.withdrawnDate = isoDateToPtBr(s.withdrawn_date);
    }
    return local;
}

function _bucketSessionRows(rows, playersRows) {
    const playersBySession = {};
    (playersRows || []).forEach(p => {
        (playersBySession[p.session_id] = playersBySession[p.session_id] || []).push(p);
    });
    const buckets = { court: [], waitlist: [], withdrawn: [], history: [] };
    (rows || []).forEach(s => {
        const rowPlayers = (playersBySession[s.id] || []).slice().sort((a, b) => a.position - b.position);
        buckets[s.status].push(_sessionRowToLocal(s, rowPlayers));
    });
    buckets.waitlist.sort((a, b) => (a.queuePosition ?? 999999) - (b.queuePosition ?? 999999));
    return buckets;
}

// Carga completa — inclui o histórico (só usado nos relatórios/dashboard,
// não precisa ser instantâneo). Usada no login/F5, não no tempo real.
async function loadSessions() {
    const [sessionsRes, playersRes] = await Promise.all([fetchAllRows('sessions'), fetchAllRows('session_players')]);
    if (sessionsRes.error || playersRes.error) {
        console.error('Erro ao carregar sessões do Supabase:', sessionsRes.error || playersRes.error);
        return false;
    }
    const buckets = _bucketSessionRows(sessionsRes.data, playersRes.data);
    state.bookings = buckets.court;
    state.waitlist = buckets.waitlist;
    state.withdrawals = buckets.withdrawn;
    state.history = buckets.history;
    return true;
}

// Carga rápida para o tempo real: só quadras/fila/desistências (dezenas de
// linhas), nunca o histórico (milhares). Isso é o que faz criar/mover/editar
// uma reserva refletir quase instantâneo nos outros dispositivos — sem isso,
// toda ação disparava uma busca no histórico inteiro. `state.history` só é
// atualizado de novo no próximo login/F5 (aceitável para dados de relatório).
async function loadActiveSessions() {
    const sessionsRes = await fetchAllRows('sessions', q => q.neq('status', 'history'));
    if (sessionsRes.error) {
        console.error('Erro ao carregar sessões ativas do Supabase:', sessionsRes.error);
        return false;
    }
    const activeIds = sessionsRes.data.map(s => s.id);
    let playersData = [];
    if (activeIds.length > 0) {
        const playersRes = await supabaseClient.from('session_players').select('*').in('session_id', activeIds);
        if (playersRes.error) {
            console.error('Erro ao carregar jogadores das sessões ativas:', playersRes.error);
            return false;
        }
        playersData = playersRes.data || [];
    }
    const buckets = _bucketSessionRows(sessionsRes.data, playersData);
    state.bookings = buckets.court;
    state.waitlist = buckets.waitlist;
    state.withdrawals = buckets.withdrawn;
    // state.history não é tocado aqui de propósito.
    return true;
}

// --- Carga completa (login, F5, reconexão) — busca as 4 fontes em paralelo.
async function loadStateFromSupabase() {
    if (!supabaseClient || _isLoadingState) return;
    _isLoadingState = true;
    try {
        const [ok1, ok2, ok3, ok4] = await Promise.all([loadCourts(), loadSessions(), loadMembers(), loadSettings()]);
        if (!ok1 || !ok2 || !ok3 || !ok4) throw new Error('Uma ou mais tabelas falharam ao carregar (ver erros acima).');
        saveLocal();
        render();
        setConnectionState(true);
    } catch (err) {
        console.error("Erro ao carregar dados do Supabase:", err);
        showToast("Falha ao carregar dados da nuvem — mostrando último snapshot salvo neste dispositivo.", "error");
        setConnectionState(false);
    } finally {
        _isLoadingState = false;
    }
}

// --- Carga seletiva (tempo real) — só busca a(s) tabela(s) que mudou.
const _RELOAD_MAP = {
    sessions: ['sessions'], session_players: ['sessions'],
    courts: ['courts', 'sessions'], // court_id -> nome muda, sessions precisa recalcular
    members: ['members'], member_names: ['members'],
    club_settings: ['settings']
};
// 'sessions' aqui usa loadActiveSessions (rápido, sem histórico) — a carga
// completa com histórico só acontece no login/F5 via loadStateFromSupabase.
const _LOADERS = { sessions: loadActiveSessions, courts: loadCourts, members: loadMembers, settings: loadSettings };

async function loadStateIncremental(changedTable) {
    if (!supabaseClient || _isLoadingState) return;
    _isLoadingState = true;
    try {
        const parts = _RELOAD_MAP[changedTable] || [];
        const results = await Promise.all(parts.map(p => _LOADERS[p]()));
        if (results.some(ok => !ok)) throw new Error(`Falha ao atualizar "${changedTable}" (ver erros acima).`);
        saveLocal();
        render();
        setConnectionState(true);
    } catch (err) {
        console.error("Erro ao sincronizar em tempo real:", err);
        setConnectionState(false);
    } finally {
        _isLoadingState = false;
    }
}

// --- Realtime (staff autenticado): qualquer mudança recarrega só a fonte
// afetada — nunca um merge parcial local (o servidor decide o resultado).
function startRealtimeSync() {
    if (!supabaseClient || _realtimeChannel) return;
    const timers = {};
    // sessions e session_players quase sempre mudam juntos (criar uma reserva
    // grava a sessão e os jogadores em seguida) e os dois recarregam a mesma
    // coisa (loadSessions) — normalizar pra uma chave só evita disparar duas
    // vezes para a mesma ação.
    const scheduleReload = (table) => {
        const key = table === 'session_players' ? 'sessions' : table;
        clearTimeout(timers[key]);
        timers[key] = setTimeout(() => loadStateIncremental(key), 80);
    };
    _realtimeChannel = supabaseClient.channel('rq_business_tables')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => scheduleReload('sessions'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'session_players' }, () => scheduleReload('session_players'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'courts' }, () => scheduleReload('courts'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => scheduleReload('members'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'member_names' }, () => scheduleReload('member_names'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'club_settings' }, () => scheduleReload('club_settings'))
        .subscribe((status, err) => {
            // Sem isso, uma falha na inscrição de tempo real (canal fechado,
            // erro de autenticação, timeout) ficava muda — parecia que o
            // dispositivo só não estava recebendo as mudanças de outros.
            console.log('[realtime] status:', status, err || '');
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.error('[realtime] falha ao inscrever:', err);
                _realtimeChannel = null;
                setTimeout(startRealtimeSync, 3000);
            }
        });
}
function stopRealtimeSync() {
    if (_realtimeChannel) { supabaseClient.removeChannel(_realtimeChannel); _realtimeChannel = null; }
}

// --- Painel público (perfil "publico", sem login): consome as views
// redigidas via polling simples (não precisa de tempo real segundo a segundo)
// e nunca recebe nome/título de sócio — ver supabase/schema.sql.
async function loadPublicState() {
    if (!supabaseClient) return;
    try {
        const [viewRes, waitRes] = await Promise.all([
            supabaseClient.from('v_public_courts').select('*'),
            supabaseClient.from('v_public_waitlist').select('*')
        ]);
        // v_public_courts já traz todas as quadras (mesmo livres), na ordem
        // certa — não precisa (e o perfil publico não tem acesso) à tabela
        // courts diretamente.
        state.courts = (viewRes.data || []).map(r => r.court_name);
        state.bookings = (viewRes.data || []).filter(r => r.session_id).map(r => ({
            id: r.session_id, court: r.court_name, type: r.type, activity: r.activity,
            startTime: r.start_time, endTime: r.end_time, observation: r.observation,
            players: r.type ? [] : ['Quadra em uso'] // nunca inclui nome de sócio na TV pública
        }));
        state.waitlist = (waitRes.data || []).map(r => ({
            id: r.session_id, registrationTime: r.registration_time, activity: r.activity,
            players: [`${r.player_count || 0} jogador${r.player_count === 1 ? '' : 'es'}`]
        }));
        render();
        setConnectionState(true);
    } catch (err) {
        console.error("Erro ao carregar painel público:", err);
        setConnectionState(false);
    }
}
function startPublicPolling() {
    loadPublicState();
    if (_publicPollTimer) return;
    _publicPollTimer = setInterval(loadPublicState, 5000);
}
function stopPublicPolling() {
    if (_publicPollTimer) { clearInterval(_publicPollTimer); _publicPollTimer = null; }
}

// --- Escrita: cada helper grava só a linha (ou linhas) afetada(s) — nunca
// existe um "salvar tudo" que sobrescreva o banco inteiro (a causa raiz da
// perda de dados no Firebase).
function _showSyncError(err) {
    console.error("Erro ao salvar no Supabase:", err);
    showToast("Falha ao salvar na nuvem — dados gravados apenas neste dispositivo.", "error");
}

async function _syncSessionPlayers(sessionId, players, titles) {
    await supabaseClient.from('session_players').delete().eq('session_id', sessionId);
    const rows = (players || []).map((name, i) => ({
        session_id: sessionId, name_snapshot: name, title_snapshot: (titles && titles[i]) || null,
        member_id: (titles && memberIdByTitle[titles[i]]) || null, position: i
    }));
    if (rows.length > 0) await supabaseClient.from('session_players').insert(rows);
}

function _localToSessionRow(local, status) {
    return {
        status,
        court_id: local.court ? getCourtId(local.court) : null,
        type: local.type || null,
        activity: local.activity || null,
        start_time: local.startTime || null,
        end_time: local.endTime || null,
        registration_time: local.registrationTime || null,
        registration_date: ptBrDateToISO(local.registrationDate),
        observation: local.observation || null,
        repeat: !!local.repeat,
        promoted_from: local.promotedFrom || null,
        queue_position: local.queuePosition ?? null,
        // Só preenchidos ao importar backups (histórico/desistências já arquivados)
        withdrawn_at: local.withdrawnAt || null,
        withdrawn_date: ptBrDateToISO(local.withdrawnDate),
        history_date: ptBrDateToISO(local.date),
        weekday: local.weekday || null,
        play_duration_min: local.playDuration ?? null,
        wait_duration_min: local.waitDuration ?? null,
        encerrado_por: local.encerradoPor || null
    };
}

function _chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

// Cria uma sessão nova. Troca `local.id` (temporário) pelo UUID real assim
// que o insert retorna, antes do restante do código usar esse objeto.
async function dbInsertSession(local, status) {
    try {
        const row = _localToSessionRow(local, status);
        const { data, error } = await supabaseClient.from('sessions').insert(row).select('id').single();
        if (error) throw error;
        local.id = data.id;
        await _syncSessionPlayers(data.id, local.players, local.titles);
        return data.id;
    } catch (err) { _showSyncError(err); return null; }
}

// Atualiza só os campos passados em `patch`. `playersTitles` (opcional)
// reescreve os jogadores; omita para não tocá-los.
async function dbUpdateSession(id, patch, playersTitles) {
    try {
        const row = {};
        if ('status' in patch) row.status = patch.status;
        if ('court' in patch) row.court_id = patch.court ? getCourtId(patch.court) : null;
        if ('type' in patch) row.type = patch.type || null;
        if ('activity' in patch) row.activity = patch.activity || null;
        if ('startTime' in patch) row.start_time = patch.startTime || null;
        if ('endTime' in patch) row.end_time = patch.endTime || null;
        if ('registrationTime' in patch) row.registration_time = patch.registrationTime || null;
        if ('observation' in patch) row.observation = patch.observation || null;
        if ('repeat' in patch) row.repeat = !!patch.repeat;
        if ('promotedFrom' in patch) row.promoted_from = patch.promotedFrom || null;
        if ('queuePosition' in patch) row.queue_position = patch.queuePosition;
        if ('withdrawnAt' in patch) row.withdrawn_at = patch.withdrawnAt || null;
        if ('withdrawnDate' in patch) row.withdrawn_date = ptBrDateToISO(patch.withdrawnDate);
        if ('date' in patch) row.history_date = ptBrDateToISO(patch.date);
        if ('weekday' in patch) row.weekday = patch.weekday || null;
        if ('playDuration' in patch) row.play_duration_min = patch.playDuration;
        if ('waitDuration' in patch) row.wait_duration_min = patch.waitDuration;
        if ('encerradoPor' in patch) row.encerrado_por = patch.encerradoPor || null;
        const { error } = await supabaseClient.from('sessions').update(row).eq('id', id);
        if (error) throw error;
        if (playersTitles) await _syncSessionPlayers(id, playersTitles.players, playersTitles.titles);
    } catch (err) { _showSyncError(err); }
}

// Upsert em lote — usado só pelo encerramento em massa (22h) e pela grade
// automática de aulas, que transicionam várias sessões de uma vez.
async function dbUpsertSessionsBulk(rows) {
    try {
        if (rows.length === 0) return;
        const { error } = await supabaseClient.from('sessions').upsert(rows);
        if (error) throw error;
    } catch (err) { _showSyncError(err); }
}

async function dbDeleteAllSessions() {
    try {
        const { error } = await supabaseClient.from('sessions').delete().not('id', 'is', null);
        if (error) throw error;
    } catch (err) { _showSyncError(err); }
}

async function dbUpsertMember(title, names) {
    try {
        let memberId = memberIdByTitle[title];
        if (!memberId) {
            const { data, error } = await supabaseClient.from('members').insert({ membership_number: title }).select('id').single();
            if (error) throw error;
            memberId = data.id;
            memberIdByTitle[title] = memberId;
        }
        await supabaseClient.from('member_names').delete().eq('member_id', memberId);
        const rows = (names || []).map(name => ({ member_id: memberId, name }));
        if (rows.length > 0) await supabaseClient.from('member_names').insert(rows);
    } catch (err) { _showSyncError(err); }
}

async function dbDeleteMemberTitle(title) {
    try {
        const memberId = memberIdByTitle[title];
        if (!memberId) return;
        const { error } = await supabaseClient.from('members').delete().eq('id', memberId);
        if (error) throw error;
        delete memberIdByTitle[title];
    } catch (err) { _showSyncError(err); }
}

// Substitui a base de sócios inteira — usado só pela importação via JSON
// (ação administrativa rara e explícita, não o fluxo normal de salvar).
async function dbSyncMembersFull(membersObj) {
    try {
        const { error: delErr } = await supabaseClient.from('members').delete().not('id', 'is', null);
        if (delErr) throw delErr;
        memberIdByTitle = {};
        for (const [title, names] of Object.entries(membersObj || {})) {
            await dbUpsertMember(title, Array.isArray(names) ? names : [names]);
        }
    } catch (err) { _showSyncError(err); }
}

// Sincroniza a lista de quadras com o texto livre editado em Configurações.
async function dbSyncCourts(names) {
    try {
        const existing = Object.keys(courtIdByName);
        const toRemove = existing.filter(n => !names.includes(n));
        for (const name of toRemove) {
            await supabaseClient.from('courts').delete().eq('id', courtIdByName[name]);
            delete courtIdByName[name];
        }
        for (let i = 0; i < names.length; i++) {
            if (courtIdByName[names[i]]) {
                await supabaseClient.from('courts').update({ sort_order: i }).eq('id', courtIdByName[names[i]]);
            } else {
                const { data, error } = await supabaseClient.from('courts').insert({ name: names[i], sort_order: i }).select('id').single();
                if (error) throw error;
                courtIdByName[names[i]] = data.id;
            }
        }
    } catch (err) { _showSyncError(err); }
}

async function dbSaveSettings(patch) {
    try {
        const row = {};
        if ('clubName' in patch) row.club_name = patch.clubName;
        if ('primaryColor' in patch) row.primary_color = patch.primaryColor;
        if ('theme' in patch) row.theme = patch.theme;
        if ('performanceMode' in patch) row.performance_mode = patch.performanceMode;
        if ('manuallyReleasedLessons' in patch) row.manually_released_lessons = patch.manuallyReleasedLessons;
        const { error } = await supabaseClient.from('club_settings').update(row).eq('id', 1);
        if (error) throw error;
    } catch (err) { _showSyncError(err); }
}

// Substitui TODOS os dados — usado só pela importação de backup completo via
// JSON (ação administrativa rara e explícita).
// Versão em lote de dbSyncMembersFull — para milhares de títulos (importação de
// backup), o padrão um-a-um do dia a dia seria milhares de round-trips.
async function dbBulkImportMembers(membersObj) {
    const { error: delErr } = await supabaseClient.from('members').delete().not('id', 'is', null);
    if (delErr) throw delErr;
    memberIdByTitle = {};
    const titles = Object.keys(membersObj || {});
    for (const chunk of _chunkArray(titles, 500)) {
        const { data, error } = await supabaseClient.from('members')
            .insert(chunk.map(title => ({ membership_number: title })))
            .select('id, membership_number');
        if (error) throw error;
        data.forEach(row => { memberIdByTitle[row.membership_number] = row.id; });
    }
    const nameRows = [];
    for (const title of titles) {
        const names = Array.isArray(membersObj[title]) ? membersObj[title] : [membersObj[title]];
        names.forEach(name => nameRows.push({ member_id: memberIdByTitle[title], name }));
    }
    for (const chunk of _chunkArray(nameRows, 500)) {
        const { error } = await supabaseClient.from('member_names').insert(chunk);
        if (error) throw error;
    }
}

// Insere sessões em lote (500 por vez) e recupera os UUIDs reais na mesma
// ordem de entrada — uma única instrução INSERT ... VALUES (...), (...)
// devolve as linhas do RETURNING na ordem em que foram listadas.
async function dbBulkInsertSessions(locals, status) {
    if (locals.length === 0) return;
    for (const chunk of _chunkArray(locals, 500)) {
        const rows = chunk.map(local => _localToSessionRow(local, status));
        const { data, error } = await supabaseClient.from('sessions').insert(rows).select('id');
        if (error) throw error;
        chunk.forEach((local, i) => { local.id = data[i].id; });
    }
    const playerRows = [];
    locals.forEach(local => {
        (local.players || []).forEach((name, i) => {
            playerRows.push({
                session_id: local.id, name_snapshot: name,
                title_snapshot: (local.titles && local.titles[i]) || null,
                member_id: (local.titles && memberIdByTitle[local.titles[i]]) || null,
                position: i
            });
        });
    });
    for (const chunk of _chunkArray(playerRows, 500)) {
        const { error } = await supabaseClient.from('session_players').insert(chunk);
        if (error) throw error;
    }
}

async function dbImportFullSystemData(importedState) {
    try {
        await dbDeleteAllSessions();
        await dbBulkImportMembers(importedState.members || {});
        if (importedState.courts) await dbSyncCourts(importedState.courts);
        if (importedState.settings) await dbSaveSettings(importedState.settings);
        await dbBulkInsertSessions(importedState.bookings || [], 'court');
        await dbBulkInsertSessions((importedState.waitlist || []).map((w, i) => ({ ...w, queuePosition: i })), 'waitlist');
        await dbBulkInsertSessions(importedState.withdrawals || [], 'withdrawn');
        await dbBulkInsertSessions(importedState.history || [], 'history');
    } catch (err) { _showSyncError(err); }
}


function refreshCloudSync() {
    if (currentUser === 'publico') loadPublicState();
    else loadStateFromSupabase();
}

// Recuperar sessão do usuário. "publico" é só uma preferência local (sem
// privilégio nenhum); diretora/esportes só são restaurados se existir uma
// sessão de verdade no Supabase Auth — um `rq_pro_user` salvo no
// localStorage não basta (isso seria só um "cadeado" decorativo no cliente).
async function restoreSession() {
    const savedUser = storage.get('rq_pro_user');
    if (savedUser === 'publico') {
        loginAs('publico');
        return;
    }
    if (supabaseClient) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', session.user.id).single();
            if (profile && USER_ROLES[profile.role]) {
                loginAs(profile.role);
                return;
            }
        }
    }
    // Sem sessão: garante que tela de login está visível e todas as views ocultas
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) {
        loginScreen.style.display = 'flex';
        gsap.fromTo(loginScreen, { opacity: 0 }, { opacity: 1, duration: 0.4 });
    }
}
