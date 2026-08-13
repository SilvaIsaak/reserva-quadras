// Login/logout e gestão de senha dos perfis esportes/diretora (Supabase Auth)
function selectUser(role) {
    selectedUserForLogin = role;
    if (role === 'publico') {
        // Sem login, entra direto
        loginAs(role);
        return;
    }
    // Mostra campo de senha
    document.getElementById('user-list').classList.add('hidden');
    document.getElementById('pin-area').classList.remove('hidden');
    document.getElementById('pin-label').textContent = `Senha para ${USER_ROLES[role].label}`;
    document.getElementById('pin-input').value = '';
    document.getElementById('pin-error').classList.add('hidden');
    setTimeout(() => document.getElementById('pin-input').focus(), 100);
}

async function confirmPin() {
    if (!supabaseClient) {
        showToast("Supabase não está configurado — veja SUPABASE_URL/SUPABASE_ANON_KEY no topo do arquivo.", "error");
        return;
    }
    const input = document.getElementById('pin-input').value;
    const role = selectedUserForLogin;
    const email = STAFF_EMAILS[role];
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password: input });
    if (!error) {
        loginAs(role);
    } else {
        const err = document.getElementById('pin-error');
        err.classList.remove('hidden');
        document.getElementById('pin-input').value = '';
        document.getElementById('pin-input').focus();
    }
}

function backToUsers() {
    selectedUserForLogin = null;
    document.getElementById('pin-area').classList.add('hidden');
    document.getElementById('user-list').classList.remove('hidden');
}

function loginAs(role) {
    currentUser = role;
    storage.set('rq_pro_user', role); // Persistir usuário logado
    const info = USER_ROLES[role];

    // Esconde tela de login
    const loginScreen = document.getElementById('login-screen');
    gsap.to(loginScreen, { opacity: 0, duration: 0.4, onComplete: () => loginScreen.style.display = 'none' });

    // Atualiza badge na nav
    const badge = document.getElementById('role-badge');
    const roleIcon = document.getElementById('role-icon');
    const roleLabel = document.getElementById('role-label');
    badge.className = `hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${info.color}`;
    roleIcon.className = `${info.icon} text-xs`;
    roleLabel.textContent = info.label;

    // Mostra/oculta itens de nav por role
    applyRoleToNav(role);

    // Navega para a view correta
    const defaultView = info.views[0];
    setTimeout(() => switchView(defaultView), 50);

    // publico só vê as views públicas redigidas (sem nome de sócio), via
    // polling; diretora/esportes autenticam e recebem sync completo em tempo real.
    if (role === 'publico') {
        startPublicPolling();
    } else {
        loadStateFromSupabase().then(startRealtimeSync);
    }
}

function applyRoleToNav(role) {
    // Hide all role-specific nav links (top nav)
    document.querySelectorAll('[class*="nav-publico"], [class*="nav-diretora"], [class*="nav-esportes"]').forEach(el => {
        el.style.display = 'none';
    });
    // Show top nav links for this role
    document.querySelectorAll(`.nav-${role}`).forEach(el => {
        el.style.display = '';
    });

    // Bottom nav: ocultar botões que não pertencem a este perfil
    document.querySelectorAll('#mobile-bottom-nav .bottom-nav-btn').forEach(btn => {
        const views = (btn.getAttribute('data-views') || '').split(' ');
        const hasRole = views.includes(`nav-${role}`);
        btn.style.display = hasRole ? '' : 'none';
    });
}

function logout() {
    if (supabaseClient && currentUser !== 'publico') supabaseClient.auth.signOut();
    stopPublicPolling();
    stopRealtimeSync();
    currentUser = null;
    selectedUserForLogin = null;
    storage.remove('rq_pro_user'); // Remover persistência do usuário
    // Esconde todas as views
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    // Mostra tela de login
    const loginScreen = document.getElementById('login-screen');
    loginScreen.style.display = 'flex';
    document.getElementById('pin-area').classList.add('hidden');
    document.getElementById('user-list').classList.remove('hidden');
    gsap.fromTo(loginScreen, { opacity: 0 }, { opacity: 1, duration: 0.4 });
}


function openPasswordModal(role) {
    if (currentUser !== 'esportes') return; // só esportes pode
    if (role !== currentUser) {
        // Não é possível definir a senha de outra conta a partir do navegador
        // (isso exigiria a service_role key no cliente — nunca faça isso).
        // Em vez disso, envia um e-mail de redefinição para a conta.
        if (confirm(`Enviar e-mail de redefinição de senha para ${USER_ROLES[role].label} (${STAFF_EMAILS[role]})?`)) {
            supabaseClient.auth.resetPasswordForEmail(STAFF_EMAILS[role]).then(({ error }) => {
                showToast(error ? `Erro ao enviar e-mail: ${error.message}` : 'E-mail de redefinição enviado!', error ? 'error' : 'success');
            });
        }
        return;
    }
    pwdTargetUser = role;
    const info = USER_ROLES[role];
    document.getElementById('pwd-modal-title').textContent = `Senha — ${info.label}`;
    document.getElementById('pwd-modal-subtitle').textContent = `Alterar sua senha de acesso (perfil ${info.label})`;
    document.getElementById('pwd-new').value = '';
    document.getElementById('pwd-confirm').value = '';
    document.getElementById('pwd-match-msg').classList.add('hidden');
    document.getElementById('pwd-save-btn').disabled = true;
    document.getElementById('pwd-save-btn').classList.add('opacity-40');
    const modal = document.getElementById('password-modal');
    showModal('password-modal');
    gsap.fromTo(modal.querySelector('.modal-theme-fix'), { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out' });
    setTimeout(() => document.getElementById('pwd-new').focus(), 150);
}

function closePasswordModal() {
    hideModal('password-modal');
    pwdTargetUser = null;
}

function togglePwdVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash text-sm';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye text-sm';
    }
}

function checkPwdMatch() {
    const newPwd = document.getElementById('pwd-new').value;
    const confirm = document.getElementById('pwd-confirm').value;
    const msg = document.getElementById('pwd-match-msg');
    const btn = document.getElementById('pwd-save-btn');

    if (newPwd.length < 4) {
        msg.textContent = 'Mínimo de 4 caracteres.';
        msg.className = 'text-xs font-bold text-amber-400';
        msg.classList.remove('hidden');
        btn.disabled = true;
        btn.classList.add('opacity-40');
        return;
    }
    if (confirm.length === 0) {
        msg.classList.add('hidden');
        btn.disabled = true;
        btn.classList.add('opacity-40');
        return;
    }
    if (newPwd === confirm) {
        msg.textContent = '✓ Senhas coincidem';
        msg.className = 'text-xs font-bold text-emerald-400';
        msg.classList.remove('hidden');
        btn.disabled = false;
        btn.classList.remove('opacity-40');
    } else {
        msg.textContent = '✗ Senhas não coincidem';
        msg.className = 'text-xs font-bold text-red-400';
        msg.classList.remove('hidden');
        btn.disabled = true;
        btn.classList.add('opacity-40');
    }
}

async function savePassword() {
    const newPwd = document.getElementById('pwd-new').value;
    if (!pwdTargetUser || newPwd.length < 4) return;

    const { error } = await supabaseClient.auth.updateUser({ password: newPwd });
    if (error) {
        showToast(`Erro ao atualizar senha: ${error.message}`, 'error');
        return;
    }

    closePasswordModal();
    showToast(`Senha do perfil ${USER_ROLES[pwdTargetUser].label} atualizada!`, 'success');
}
