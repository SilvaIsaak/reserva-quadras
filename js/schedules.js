// NÃO CONECTADO AO index.html — referência para modularização futura, ver prompt-reorganizacao-reservaquadras.md

import { state, saveLocal, storage } from './state.js';

export const FIXED_SCHEDULES = {
    "Quadra 1": [
        { days: [1, 2, 3, 4, 5], start: "06:30", end: "11:00", status: "free" },
        { days: [1, 2, 3, 4, 5], start: "11:00", end: "16:00", status: "lesson" },
        { days: [1, 2, 3, 4, 5], start: "16:00", end: "22:00", status: "free" },
        { days: [6, 0], start: "06:30", end: "22:00", status: "free" }
    ],
    "Quadra 2": [
        { days: [1, 2, 3, 4, 5], start: "06:30", end: "17:00", status: "lesson" },
        { days: [1, 2, 3, 4, 5], start: "17:00", end: "22:00", status: "free" },
        { days: [6, 0], start: "06:30", end: "22:00", status: "free" }
    ],
    "Quadra 5": [
        { days: [1, 2, 3, 4, 5], start: "06:30", end: "10:00", status: "free" },
        { days: [1, 2, 3, 4, 5], start: "10:00", end: "17:00", status: "lesson" },
        { days: [1, 2, 3, 4, 5], start: "17:00", end: "22:00", status: "free" },
        { days: [6, 0], start: "06:30", end: "22:00", status: "free" }
    ],
    "Quadra 6": [
        { days: [1, 2, 3, 4, 5], start: "07:00", end: "12:00", status: "lesson" },
        { days: [1, 2, 3, 4, 5], start: "12:00", end: "13:00", status: "free" },
        { days: [1, 2, 3, 4, 5], start: "13:00", end: "18:00", status: "lesson" },
        { days: [1, 2, 3, 4, 5], start: "18:00", end: "19:00", status: "free" },
        { days: [1, 2, 3, 4, 5], start: "19:00", end: "22:00", status: "lesson" },
        { days: [6, 0], start: "06:30", end: "22:00", status: "free" }
    ],
    "Quadra 7": [
        { days: [1, 2, 3, 4, 5], start: "07:00", end: "12:30", status: "lesson" },
        { days: [1, 2, 3, 4, 5], start: "12:30", end: "14:30", status: "free" },
        { days: [1, 2, 3, 4, 5], start: "14:30", end: "22:00", status: "lesson" },
        { days: [6, 0], start: "06:30", end: "22:00", status: "free" }
    ],
    "Quadra Rápida": [
        { days: [1], start: "07:00", end: "12:00", status: "lesson" },
        { days: [1], start: "12:30", end: "18:00", status: "free" },
        { days: [1], start: "18:00", end: "22:00", status: "lesson" },
        { days: [2, 3, 4], start: "07:00", end: "12:00", status: "lesson" },
        { days: [2, 3, 4], start: "12:00", end: "14:00", status: "free" },
        { days: [2, 3, 4], start: "14:00", end: "22:00", status: "lesson" },
        { days: [5], start: "07:00", end: "12:00", status: "lesson" },
        { days: [5], start: "12:00", end: "13:30", status: "free" },
        { days: [5], start: "13:30", end: "18:00", status: "lesson" },
        { days: [5], start: "18:00", end: "22:00", status: "lesson" },
        { days: [6, 0], start: "06:30", end: "22:00", status: "free" }
    ]
};

export function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

export function getFixedStatus(courtName) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const schedules = FIXED_SCHEDULES[courtName];
    if (!schedules) return null;
    
    for (const schedule of schedules) {
        if (schedule.days.includes(dayOfWeek)) {
            const startMinutes = timeToMinutes(schedule.start);
            const endMinutes = timeToMinutes(schedule.end);
            
            if (endMinutes > startMinutes) {
                if (currentMinutes >= startMinutes && currentMinutes < endMinutes) return schedule.status;
            } else {
                if (currentMinutes >= startMinutes || currentMinutes < endMinutes) return schedule.status;
            }
        }
    }
    return "free";
}

export function applyFixedSchedules(getTodayDate, getWeekdayName) {
    const todayDate = getTodayDate();
    const weekdayName = getWeekdayName();

    const lastDateForReset = storage.get('last_reset_date', '');
    if (lastDateForReset !== todayDate) {
        state.manuallyReleasedLessons = [];
        storage.set('last_reset_date', todayDate);
    }

    const now = new Date();
    const dayOfWeek = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (const courtName of state.courts) {
        const fixedStatus = getFixedStatus(courtName);
        if (!fixedStatus) continue;

        const existingBooking = state.bookings.find(b => b.court === courtName);

        if (existingBooking && ['blocked', 'rain', 'tournament'].includes(existingBooking.type)) continue;

        const manualRelease = state.manuallyReleasedLessons.find(m => m.court === courtName && m.date === todayDate);
        if (manualRelease) {
            if (manualRelease.until) {
                if (currentMinutes < timeToMinutes(manualRelease.until)) continue;
                state.manuallyReleasedLessons = state.manuallyReleasedLessons.filter(m => !(m.court === courtName && m.date === todayDate));
            } else continue;
        }

        if (fixedStatus === "lesson" && (!existingBooking || existingBooking.type !== "lesson")) {
            if (existingBooking) continue;
            let currentPeriod = FIXED_SCHEDULES[courtName]?.find(s => s.days.includes(dayOfWeek) && currentMinutes >= timeToMinutes(s.start) && currentMinutes < timeToMinutes(s.end));
            state.bookings.push({
                id: Date.now() + Math.random(), court: courtName, type: "lesson",
                players: ["AULA"], startTime: currentPeriod ? currentPeriod.start : "00:00",
                observation: "Agenda Fixa"
            });
        } else if (fixedStatus === "free" && existingBooking && existingBooking.type === "lesson") {
            if (existingBooking.observation !== "Agenda Fixa") continue;
            state.history.push({
                ...existingBooking, date: todayDate, weekday: weekdayName, endTime: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                playDuration: 0, waitDuration: 0, activity: "AULA", encerradoPor: "automatico_22h"
            });
            state.bookings = state.bookings.filter(b => b.court !== courtName);
        }
    }
    saveLocal();
}

export function getNextTransition(courtName) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const schedules = FIXED_SCHEDULES[courtName];
    if (!schedules) return null;

    const daySchedules = schedules.filter(s => s.days.includes(dayOfWeek));
    for (const s of daySchedules) {
        const startMins = timeToMinutes(s.start);
        const endMins = timeToMinutes(s.end);
        if (currentMinutes >= startMins && currentMinutes < endMins) {
            if (s.status === 'lesson') return { label: `Livre às ${s.end}`, color: 'text-emerald-400' };
            const nextLesson = daySchedules.find(nx => nx.status === 'lesson' && timeToMinutes(nx.start) >= endMins);
            if (nextLesson) return { label: `Aula às ${nextLesson.start}`, color: 'text-amber-400' };
        }
    }
    return null;
}
