// index.html:L1493-1507
const sanitizedData = JSON.parse(JSON.stringify({
    courts: state.courts,
    bookings: state.bookings,
    // ... outros campos
}));
firebaseDb.ref('rq_state').set(sanitizedData);