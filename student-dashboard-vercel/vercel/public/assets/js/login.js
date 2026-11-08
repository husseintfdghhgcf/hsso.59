'use strict';

// Shared login logic for both portals (admin / student).
const form = document.getElementById('loginForm');
const errBox = document.getElementById('loginError');
const errText = document.getElementById('loginErrorText');
const submitBtn = document.getElementById('loginSubmit');

function showError(msg) {
    errText.textContent = msg;
    errBox.classList.remove('hidden');
}

// Already logged in? Go straight to the dashboard.
loadSession().then(s => {
    const portal = form.dataset.endpoint.includes('/admin/') ? 'admin' : 'student';
    if (s.role === portal) window.location.href = form.dataset.redirect;
}).catch(() => {});

form.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    errBox.classList.add('hidden');
    const payload = {
        [form.dataset.field]: document.getElementById('loginName').value.trim(),
        password: document.getElementById('loginPassword').value
    };
    if (!payload[form.dataset.field] || !payload.password) {
        showError('يرجى إدخال البيانات المطلوبة.');
        return;
    }
    submitBtn.disabled = true;
    try {
        const r = await postJson(form.dataset.endpoint, payload);
        if (r.ok) {
            window.location.href = form.dataset.redirect;
            return;
        }
        showError(r.data.message || 'تعذر تسجيل الدخول.');
    } catch (e) {
        showError('تعذر الاتصال بالخادم.');
    } finally {
        submitBtn.disabled = false;
    }
});
