// Helpers genéricos: modais, toasts, datas/horário, sincronização de horário via internet
// --- Helper: abrir/fechar modais com display:flex garantido ---
function showModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    el.style.display = 'flex';
}
function hideModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('hidden');
    el.style.display = '';
}

// --- Escape de HTML: nomes de jogador/sócio, títulos, observações e nomes de
// quadra são texto livre digitado pelo usuário (ou importado via JSON) e vão
// parar direto em innerHTML pelo app inteiro — sem isso, um nome como
// "<img src=x onerror=alert(1)>" executa para qualquer um que veja a tela.
function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Escape para valores interpolados dentro de onclick="fn('${valor}')": o
// atributo é decodificado como HTML antes de virar código JS, então um
// escapeHtml comum não impede a fuga da string JS (aspas simples continuam
// aspas simples depois de decodificadas). Escapa primeiro para sobreviver
// como literal de string JS, depois para sobreviver como valor de atributo.
function escapeJsAttr(str) {
    return String(str ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// --- Safe LocalStorage Wrapper ---


// Mobile Menu Toggle
function toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    if (!menu) return;
    const isHidden = menu.classList.contains('hidden');
    
    if (isHidden) {
        menu.classList.remove('hidden');
        setTimeout(() => menu.classList.add('open'), 10);
    } else {
        menu.classList.remove('open');
        setTimeout(() => menu.classList.add('hidden'), 400);
    }
}

// Funções auxiliares para datas dinâmicas
function getTodayDate() {
    return getAccurateNow().toLocaleDateString('pt-BR');
}

function getWeekdayName() {
    return getAccurateNow().toLocaleDateString('pt-BR', { weekday: 'long' });
}

// --- Agendas Fixas ---
// Suporta days: [1,2,3,4,5] (Seg-Sex), [6] (Sábado), [0] (Domingo)

function showToast(msg, type='info') {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const toast = document.createElement('div');
    const bg = type === 'error' ? 'bg-red-600' : (type === 'warning' ? 'bg-orange-500' : 'bg-indigo-600');
    toast.className = `${bg} text-white px-8 py-4 rounded-2xl shadow-2xl font-black text-xs uppercase tracking-widest flex items-center gap-3 mb-3`;
    toast.innerHTML = `<i class="fas fa-bell"></i> ${escapeHtml(msg)}`;
    container.appendChild(toast);
    gsap.from(toast, { x: 100, opacity: 0, duration: 0.5 });
    setTimeout(() => { gsap.to(toast, { x: 100, opacity: 0, duration: 0.5, onComplete: () => toast.remove() }); }, 4000);
}

// ============================================================
// HORÁRIO VIA INTERNET (timeapi.io — fuso America/Sao_Paulo)
// ============================================================
let _timeOffset = 0; // diferença em ms entre servidor e Date.now()
let _timeSynced = false;
const _clockEl = () => document.getElementById('public-clock');
const _syncIndicatorEl = () => document.getElementById('clock-sync-indicator');

async function fetchWithTimeout(url, options = {}, timeout = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

// Cada fonte devolve o instante do servidor em ms desde epoch, medido entre t0 (antes do fetch)
// e t1 (depois da resposta) para compensar a latência da requisição — ver getAccurateNow().
// A Cloudflare vem primeiro: é a rede mais confiável das três (o endpoint de trace roda em
// qualquer ponto de presença da CDN), enquanto timeapi.io e worldtimeapi.org já flagraram ficar
// minutos fora do ar/desatualizados. Manter os dois como fallback ainda ajuda quando a Cloudflare
// falhar, mas nenhuma fonte única de terceiros deve ser aceita sem essa cadeia de reserva.
const TIME_SOURCES = [
    {
        label: 'Cloudflare',
        async fetch() {
            const res = await fetchWithTimeout('https://cloudflare.com/cdn-cgi/trace', { cache: 'no-store' });
            if (!res.ok) throw new Error('cloudflare trace falhou');
            const text = await res.text();
            const match = text.match(/^ts=([\d.]+)/m);
            if (!match) throw new Error('cloudflare trace sem ts');
            return parseFloat(match[1]) * 1000;
        },
    },
    {
        label: 'timeapi.io',
        async fetch() {
            const res = await fetchWithTimeout('https://timeapi.io/api/time/current/zone?timeZone=America%2FSao_Paulo', { cache: 'no-store' });
            if (!res.ok) throw new Error('timeapi falhou');
            const data = await res.json();
            return new Date(data.dateTime).getTime();
        },
    },
    {
        label: 'worldtimeapi.org (fallback)',
        async fetch() {
            const res = await fetchWithTimeout('https://worldtimeapi.org/api/timezone/America/Sao_Paulo', { cache: 'no-store' });
            if (!res.ok) throw new Error('worldtimeapi falhou');
            const data = await res.json();
            return new Date(data.datetime).getTime();
        },
    },
];

async function syncInternetTime() {
    for (const source of TIME_SOURCES) {
        try {
            const t0 = Date.now();
            const serverMs = await source.fetch();
            const t1 = Date.now();
            _timeOffset = serverMs - (t0 + t1) / 2;
            _timeSynced = true;
            if (_syncIndicatorEl()) {
                _syncIndicatorEl().title = `Horário sincronizado (${source.label})`;
                _syncIndicatorEl().classList.replace('text-gray-500','text-emerald-400');
            }
            return;
        } catch(e) {
            console.warn(`[Clock] Falha ao sincronizar via ${source.label}.`, e);
        }
    }
    _timeSynced = false;
    if (_syncIndicatorEl()) {
        _syncIndicatorEl().title = 'Sem sincronização — usando relógio local';
        _syncIndicatorEl().classList.replace('text-emerald-400','text-gray-500');
    }
    console.warn('[Clock] Todas as fontes de horário falharam. Usando relógio local.');
}

function getAccurateNow() {
    return new Date(Date.now() + _timeOffset);
}

// Sincronizar imediatamente e depois a cada 10 minutos

function getPeriodoStr(timeStr) {
    if (!timeStr) return '--';
    const mins = timeToMinutes(timeStr);
    if (mins >= PERIODS.morning.startHour * 60 + PERIODS.morning.startMinute && mins <= PERIODS.morning.endHour * 60 + PERIODS.morning.endMinute) return 'Manhã';
    if (mins >= PERIODS.afternoon.startHour * 60 + PERIODS.afternoon.startMinute && mins <= PERIODS.afternoon.endHour * 60 + PERIODS.afternoon.endMinute) return 'Tarde';
    if (mins >= PERIODS.evening.startHour * 60 + PERIODS.evening.startMinute && mins <= PERIODS.evening.endHour * 60 + PERIODS.evening.endMinute) return 'Noite';
    return '--';
}

/** G.3: Novos KPIs no Dashboard Home (versão única) */

/** G.1: releaseCourt aprimorado — encerradoPor e applyFixedSchedules já integrados na versão final abaixo */

/** G.2: exportDashboardData com novas colunas */

function showToastWithAction(msg, actionLabel, onAction) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'glass-card px-5 py-4 rounded-2xl shadow-xl border border-white/10 flex items-center gap-4 max-w-sm w-full bg-indigo-500/10';
    // O callback é ligado por addEventListener, não serializado no onclick.
    // A versão anterior usava `onAction.toString()`, o que reexecutava a função
    // fora do escopo original: as variáveis capturadas (nextGroup, court) não
    // existiam mais e o botão falhava com ReferenceError.
    div.innerHTML = `
        <span class="flex-1 text-sm font-bold text-white">${escapeHtml(msg)}</span>
        <button data-role="confirm"
            class="shrink-0 px-4 py-2 rounded-xl bg-indigo-500 text-white font-black text-[10px] uppercase tracking-widest hover:brightness-110 transition-all">
            ${actionLabel}
        </button>
        <button data-role="dismiss" class="shrink-0 text-gray-500 hover:text-white text-lg leading-none">&times;</button>
    `;
    let timer = null;
    const close = () => { if (timer) clearTimeout(timer); div.remove(); };
    div.querySelector('[data-role="confirm"]').addEventListener('click', () => {
        try {
            onAction();
        } catch (e) {
            console.error('Erro ao executar ação do toast:', e);
            showToast('Não foi possível concluir a ação.', 'error');
        }
        close();
    });
    div.querySelector('[data-role="dismiss"]').addEventListener('click', close);
    container.appendChild(div);
    timer = setTimeout(close, 12000);
}

// Substituir releaseCourt pelo novo fluxo com modal de opção para aulas
