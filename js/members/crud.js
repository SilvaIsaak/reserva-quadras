// CRUD de sócios (títulos e nomes)
function openMemberModal() {
    const sidebar = document.getElementById('members-sidebar');
    const panel = document.getElementById('members-sidebar-panel');
    if (!sidebar || !panel) return;
    sidebar.classList.remove('hidden');
    sidebar.style.display = 'block';
    // Força reflow antes de animar
    panel.getBoundingClientRect();
    panel.style.transform = 'translateX(0)';
    renderMembersList();
}
function closeMemberModal() {
    const sidebar = document.getElementById('members-sidebar');
    const panel = document.getElementById('members-sidebar-panel');
    if (!sidebar || !panel) return;
    panel.style.transform = 'translateX(100%)';
    setTimeout(() => {
        sidebar.classList.add('hidden');
        sidebar.style.display = '';
    }, 420);
}

function renderMembersList() {
    const container = document.getElementById('members-list-container');
    const countLabel = document.getElementById('members-count-label');
    const search = (document.getElementById('members-search')?.value || '').toLowerCase();
    if (!container) return;

    const entries = Object.entries(state.members || {});
    const filtered = search
        ? entries.filter(([title, names]) =>
            title.toLowerCase().includes(search) ||
            (Array.isArray(names) ? names.some(n => n.toLowerCase().includes(search)) : String(names).toLowerCase().includes(search))
          )
        : entries;

    if (countLabel) countLabel.textContent = `${entries.length} título${entries.length !== 1 ? 's' : ''} cadastrado${entries.length !== 1 ? 's' : ''}`;

    if (filtered.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-500 py-10 font-bold text-sm">${search ? 'Nenhum resultado encontrado.' : 'Nenhum sócio cadastrado.'}</p>`;
        return;
    }

    container.innerHTML = filtered.map(([title, names]) => {
        const nameList = Array.isArray(names) ? names : [names];
        return `
        <div class="glass-card p-4 rounded-2xl border border-white/10">
            <div class="flex justify-between items-start gap-2">
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-black text-indigo-400 uppercase tracking-widest">Título ${title}</p>
                    <div class="mt-2 space-y-1">
                        ${nameList.map((name, idx) => `
                        <div class="flex items-center justify-between gap-2 py-1 border-b border-white/5 last:border-0">
                            <span class="text-sm text-white font-bold truncate">${name}</span>
                            <button onclick="removeMemberName('${title}', ${idx})" class="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all text-[10px]"><i class="fas fa-times"></i></button>
                        </div>`).join('')}
                    </div>
                    <button onclick="addNameToTitle('${title}')" class="mt-2 text-[9px] font-black text-indigo-400 uppercase tracking-widest hover:text-indigo-300 transition-all flex items-center gap-1"><i class="fas fa-plus"></i> Adicionar nome</button>
                </div>
                <button onclick="deleteMemberTitle('${title}')" class="shrink-0 w-7 h-7 flex items-center justify-center rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all text-xs border border-red-500/20"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

function addNewMember() {
    const titleInput = document.getElementById('new-member-title');
    const nameInput = document.getElementById('new-member-name');
    if (!titleInput || !nameInput) return;
    const title = titleInput.value.trim();
    const name = nameInput.value.trim();
    if (!title || !name) { showToast('Preencha o número do título e o nome.', 'warning'); return; }
    if (!state.members) state.members = {};
    if (!state.members[title]) state.members[title] = [];
    if (!Array.isArray(state.members[title])) state.members[title] = [state.members[title]];
    if (state.members[title].includes(name)) { showToast('Este nome já está cadastrado neste título.', 'warning'); return; }
    state.members[title].push(name);
    saveLocal();
    dbUpsertMember(title, state.members[title]);
    titleInput.value = '';
    nameInput.value = '';
    renderMembersList();
    showToast(`${name} adicionado ao título ${title}!`, 'success');
}

function deleteMemberTitle(title) {
    if (!confirm(`Excluir o título ${title} e todos os seus sócios?`)) return;
    delete state.members[title];
    saveLocal();
    dbDeleteMemberTitle(title);
    renderMembersList();
    showToast(`Título ${title} removido.`, 'success');
}

function removeMemberName(title, idx) {
    if (!state.members[title]) return;
    const names = Array.isArray(state.members[title]) ? state.members[title] : [state.members[title]];
    names.splice(idx, 1);
    saveLocal();
    if (names.length === 0) {
        delete state.members[title];
        dbDeleteMemberTitle(title);
    } else {
        state.members[title] = names;
        dbUpsertMember(title, names);
    }
    renderMembersList();
    showToast('Sócio removido.', 'success');
}

function addNameToTitle(title) {
    const name = prompt(`Adicionar nome ao título ${title}:`);
    if (!name || !name.trim()) return;
    if (!Array.isArray(state.members[title])) state.members[title] = [state.members[title]].filter(Boolean);
    if (state.members[title].includes(name.trim())) { showToast('Nome já cadastrado neste título.', 'warning'); return; }
    state.members[title].push(name.trim());
    saveLocal();
    dbUpsertMember(title, state.members[title]);
    renderMembersList();
    showToast(`${name.trim()} adicionado ao título ${title}!`, 'success');
}



function exportMembers() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.members, null, 4));
    const link = document.createElement('a');
    link.setAttribute("href", dataStr); link.setAttribute("download", "socios_reservaquadras.json");
    document.body.appendChild(link); link.click(); link.remove();
}

