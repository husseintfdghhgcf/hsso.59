'use strict';

// If the visitor already has a session, send them to the right dashboard.
loadSession().then(s => {
    if (s.role === 'admin') window.location.href = 'admin/index.html';
    else if (s.role === 'student') window.location.href = 'student/index.html';
}).catch(() => {});
