// NÃO CONECTADO AO index.html — referência para modularização futura, ver prompt-reorganizacao-reservaquadras.md

import { state, saveLocal } from './state.js';
import { showToast } from './utils.js';

export let firebaseApp = null;
export let firebaseDb = null;
export let isCloudSyncing = false;

export function connectFirebase() {
    if (!state.settings.firebaseConfig) {
        showToast("Cole sua configuração do Firebase primeiro!", "warning");
        return;
    }

    try {
        if (firebaseApp) {
            firebaseApp.delete();
        }
        
        firebaseApp = firebase.initializeApp(state.settings.firebaseConfig);
        firebaseDb = firebase.database(firebaseApp);
        const statusEl = document.getElementById('cloud-status');
        
        firebaseDb.ref('rq_state').on('value', (snapshot) => {
            const cloudData = snapshot.val();
            if (cloudData && !isCloudSyncing) {
                console.log("Sincronizando da nuvem...");
                state.courts = cloudData.courts || state.courts;
                state.bookings = Array.isArray(cloudData.bookings) ? cloudData.bookings : Object.values(cloudData.bookings || {});
                state.waitlist = Array.isArray(cloudData.waitlist) ? cloudData.waitlist : Object.values(cloudData.waitlist || {});
                state.withdrawals = Array.isArray(cloudData.withdrawals) ? cloudData.withdrawals : Object.values(cloudData.withdrawals || {});
                state.history = Array.isArray(cloudData.history) ? cloudData.history : Object.values(cloudData.history || {});
                state.members = cloudData.members || state.members;
                state.manuallyReleasedLessons = cloudData.manuallyReleasedLessons || [];
                
                if (cloudData.settings) {
                    state.settings.clubName = cloudData.settings.clubName || state.settings.clubName;
                    state.settings.primaryColor = cloudData.settings.primaryColor || state.settings.primaryColor;
                }
                
                saveLocal(); 
                render();
                console.log("Estado atualizado via Nuvem!");
            }
        });

        if(statusEl) {
            statusEl.innerText = "CONECTADO";
            statusEl.classList.replace('text-gray-500', 'text-emerald-400');
        }
        showToast("Conectado à Nuvem!", "success");
    } catch (err) {
        console.error(err);
        showToast("Erro ao conectar ao Firebase!", "error");
    }
}

export function save() {
    saveLocal();
    if (firebaseDb) {
        isCloudSyncing = true;
        
        const sanitizedData = JSON.parse(JSON.stringify({
            courts: state.courts,
            bookings: state.bookings,
            waitlist: state.waitlist,
            withdrawals: state.withdrawals,
            history: state.history,
            members: state.members,
            manuallyReleasedLessons: state.manuallyReleasedLessons,
            settings: {
                clubName: state.settings.clubName,
                primaryColor: state.settings.primaryColor
            }
        }));

        firebaseDb.ref('rq_state').set(sanitizedData).then(() => {
            isCloudSyncing = false;
        }).catch((err) => {
            console.error("Erro ao salvar no Firebase:", err);
            isCloudSyncing = false;
        });
    }
}
