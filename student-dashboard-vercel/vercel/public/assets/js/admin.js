'use strict';

// ---------------------------------------------------------------
// Admin dashboard logic. All data lives in MySQL (via the Node.js API); this file only
// renders what /api/admin returns and sends changes back.
// ---------------------------------------------------------------
const API_URL = '/api/admin';
const avatarOptions = ['👨‍🎓', '👩‍🎓', '👨‍💻', '👩‍🔬', '👦', '👧', '🧑‍🏫', '🚀', '⭐', '🏆'];

// Data State (filled from the server)
let groups = [];     // [{id, name}]
let students = [];   // students matching current search / filter / sort
let stats = { total_students: 0, total_groups: 0, avg_score: 0, top_name: null, top_score: 0 };
let podium = [];
let totalStudents = 0;

let selectedAvatar = '👨‍🎓';
let filterTimer = null;
let loadSeq = 0;

// Initialize App
window.onload = async function () {
    renderAvatarOptions();
    try {
        const s = await loadSession();
        if (s.role !== 'admin') { window.location.href = 'login.html'; return; }
    } catch (e) {
        showToast('تعذر الاتصال بالخادم.', true);
        return;
    }
    updateDashboard();
};

// ---------------- Server communication ----------------
function currentFilters() {
    return {
        q: document.getElementById('searchInput').value.trim(),
        group: document.getElementById('groupFilter').value,
        sort: document.getElementById('sortBySelect').value
    };
}

async function apiRequest(method, payload) {
    const opts = { method: method, credentials: 'same-origin', headers: { 'Accept': 'application/json' } };
    let url = API_URL;
    if (method === 'GET') {
        url += '?' + new URLSearchParams(currentFilters()).toString();
    } else {
        opts.headers['Content-Type'] = 'application/json';
        opts.headers['X-CSRF-Token'] = CSRF_TOKEN;
        opts.body = JSON.stringify(Object.assign({}, payload, { filters: currentFilters() }));
    }
    let res;
    try {
        res = await fetch(url, opts);
    } catch (e) {
        throw new Error('تعذر الاتصال بالخادم، تحقق من اتصالك بالإنترنت.');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-JSON response */ }
    if (res.status === 401) {
        window.location.href = 'login.html';
        throw new Error('انتهت الجلسة، يرجى تسجيل الدخول.');
    }
    if (!res.ok || !data || !data.ok) {
        throw new Error((data && data.message) || 'حدث خطأ غير متوقع.');
    }
    return data;
}

function applyState(state) {
    groups = state.groups;
    students = state.students;
    stats = state.stats;
    podium = state.podium;
    totalStudents = state.total_students;
    renderGroupOptions();
    renderStats();
    renderPodium();
    renderTable(students);
}

// Main Refresh Function (loads everything from MySQL)
async function updateDashboard() {
    const seq = ++loadSeq;
    try {
        const data = await apiRequest('GET');
        if (seq === loadSeq) applyState(data.state);
    } catch (err) {
        showToast(err.message, true);
    }
}

// Search / filter / sort are executed by MySQL (debounced)
function handleFilterAndSearch() {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(updateDashboard, 200);
}

// Runs a mutation, then re-renders from the fresh server state.
// Calls are queued so quick successive clicks (+5, +5, ...) are never lost.
let actionQueue = Promise.resolve();
function runAction(payload) {
    const task = actionQueue.then(async () => {
        const data = await apiRequest('POST', payload);
        loadSeq++;
        applyState(data.state);
        return data;
    });
    actionQueue = task.catch(() => {});
    return task;
}

// ---------------- Rendering ----------------

// Render Dropdowns for Groups
function renderGroupOptions() {
    const groupFilter = document.getElementById('groupFilter');
    const formStudentGroup = document.getElementById('formStudentGroup');
    const groupsListContainer = document.getElementById('groupsListContainer');

    // Save filter / form selection
    const currentFilterVal = groupFilter.value;
    const currentFormVal = formStudentGroup.value;

    // Group Filter dropdown
    let filterHtml = '<option value="ALL">جميع المجموعات</option>';
    groups.forEach(g => {
        filterHtml += `<option value="${g.id}">${esc(g.name)}</option>`;
    });
    groupFilter.innerHTML = filterHtml;
    groupFilter.value = groups.some(g => String(g.id) === currentFilterVal) ? currentFilterVal : 'ALL';

    // Form Group Select
    let formHtml = '';
    groups.forEach(g => {
        formHtml += `<option value="${g.id}">${esc(g.name)}</option>`;
    });
    formStudentGroup.innerHTML = formHtml;
    if (groups.some(g => String(g.id) === currentFormVal)) formStudentGroup.value = currentFormVal;

    // Group Manager List
    let managerHtml = '';
    groups.forEach(g => {
        managerHtml += `
            <div class="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700/50">
                <span class="text-xs font-semibold text-gray-800 dark:text-gray-200">${esc(g.name)}</span>
                <button onclick="removeGroup(${g.id})" class="text-rose-500 hover:text-rose-700 text-xs p-1" title="حذف المجموعة">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
    });
    groupsListContainer.innerHTML = managerHtml;
}

// Render Avatar Option Picker
function renderAvatarOptions() {
    const container = document.getElementById('avatarSelector');
    container.innerHTML = avatarOptions.map((av, index) => `
        <button type="button" onclick="selectAvatar('${av}')" id="avBtn-${index}"
                class="avatar-btn text-xl p-2 rounded-xl border ${selectedAvatar === av ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/40' : 'border-gray-200 dark:border-gray-700'} hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">
            ${av}
        </button>
    `).join('');
}

function selectAvatar(av) {
    selectedAvatar = av;
    renderAvatarOptions();
}

// Render Stats Overview
function renderStats() {
    document.getElementById('statTotalStudents').textContent = stats.total_students;
    document.getElementById('statTotalGroups').textContent = stats.total_groups;

    if (stats.total_students > 0) {
        document.getElementById('statAvgRating').textContent = `${Number(stats.avg_score).toFixed(1)}%`;
        document.getElementById('statTopStudent').textContent = stats.top_name ? stats.top_name : '--';
        document.getElementById('statTopScore').innerHTML = `<i class="fa-solid fa-trophy text-[10px]"></i> ${Number(stats.top_score)} نقطة`;
    } else {
        document.getElementById('statAvgRating').textContent = '0%';
        document.getElementById('statTopStudent').textContent = '--';
        document.getElementById('statTopScore').textContent = '0 نقطة';
    }
}

// Render Top 3 Podium
function renderPodium() {
    const container = document.getElementById('podiumContainer');
    const top3 = podium;

    if (top3.length === 0) {
        container.innerHTML = '<p class="text-xs text-blue-200">لا يوجد طلاب متوفرون حالياً</p>';
        return;
    }

    // Arrange podium order: [Rank 2 (Silver), Rank 1 (Gold), Rank 3 (Bronze)]
    let podiumOrder = [];
    if (top3[1]) podiumOrder.push({ ...top3[1], pos: 2, badge: '🥈', color: 'from-gray-300 to-gray-400', height: 'h-32 sm:h-36' });
    if (top3[0]) podiumOrder.push({ ...top3[0], pos: 1, badge: '👑', color: 'from-amber-400 to-yellow-500', height: 'h-40 sm:h-44' });
    if (top3[2]) podiumOrder.push({ ...top3[2], pos: 3, badge: '🥉', color: 'from-amber-700 to-amber-800', height: 'h-24 sm:h-28' });

    // If only 1 student exists, fill appropriately
    if (top3.length === 1) {
        podiumOrder = [{ ...top3[0], pos: 1, badge: '👑', color: 'from-amber-400 to-yellow-500', height: 'h-40 sm:h-44' }];
    }

    container.innerHTML = podiumOrder.map(item => `
        <div class="flex flex-col items-center flex-1 max-w-[200px] w-full order-${item.pos === 1 ? '1 sm:order-2' : item.pos === 2 ? '2 sm:order-1' : '3'}">
            <!-- Student Card Info -->
            <div class="flex flex-col items-center mb-2 animate-bounce-short">
                <div class="relative">
                    <span class="text-3xl sm:text-4xl filter drop-shadow">${esc(item.avatar)}</span>
                    <span class="absolute -top-2 -right-2 text-base">${item.badge}</span>
                </div>
                <h4 class="font-bold text-xs sm:text-sm text-white mt-1 text-center truncate max-w-[130px]">${esc(item.name)}</h4>
                <span class="text-[11px] text-amber-300 font-extrabold bg-amber-400/20 px-2 py-0.5 rounded-full mt-0.5">
                    ${Number(item.score)} نقطة
                </span>
            </div>

            <!-- Step Pillar -->
            <div class="w-full ${item.height} bg-gradient-to-t ${item.color} rounded-t-2xl shadow-lg flex flex-col justify-between p-2 items-center text-gray-900 font-extrabold">
                <span class="text-xs bg-white/40 px-2 py-0.5 rounded-full mt-1">#${item.pos}</span>
                <span class="text-xs opacity-80 mb-1">${esc(item.group)}</span>
            </div>
        </div>
    `).join('');
}

// Render Table Body
function renderTable(displayStudents) {
    const tbody = document.getElementById('studentsTableBody');
    const emptyState = document.getElementById('emptyState');
    const counter = document.getElementById('studentCounterBadge');

    counter.textContent = `عرض ${displayStudents.length} من ${totalStudents}`;

    if (displayStudents.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    tbody.innerHTML = displayStudents.map(student => {
        // Badge for top ranks in table
        let rankBadge = `<span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs">#${student.rank}</span>`;
        if (student.rank === 1) rankBadge = `<span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700 font-bold text-xs"><i class="fa-solid fa-crown text-amber-500"></i></span>`;
        if (student.rank === 2) rankBadge = `<span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-200 text-slate-700 font-bold text-xs">2</span>`;
        if (student.rank === 3) rankBadge = `<span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-900/20 text-amber-600 font-bold text-xs">3</span>`;

        // Score bar color
        let scoreColor = 'bg-blue-600';
        if (student.score >= 90) scoreColor = 'bg-emerald-500';
        else if (student.score >= 75) scoreColor = 'bg-blue-500';
        else if (student.score >= 60) scoreColor = 'bg-amber-500';
        else scoreColor = 'bg-rose-500';

        return `
            <tr class="hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors">
                <!-- Rank -->
                <td class="py-3.5 px-4 text-center whitespace-nowrap">
                    ${rankBadge}
                </td>

                <!-- Student Details -->
                <td class="py-3.5 px-4 whitespace-nowrap">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xl flex-shrink-0">
                            ${esc(student.avatar)}
                        </div>
                        <div>
                            <h4 class="font-bold text-gray-900 dark:text-white leading-tight">${esc(student.name)}</h4>
                            <span class="text-[11px] text-gray-400 font-mono">${esc(student.code)}</span>
                        </div>
                    </div>
                </td>

                <!-- Group -->
                <td class="py-3.5 px-4 whitespace-nowrap">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800/40">
                        <i class="fa-solid fa-layer-group text-[10px]"></i> ${esc(student.group)}
                    </span>
                </td>

                <!-- Rating & Score Bar -->
                <td class="py-3.5 px-4 whitespace-nowrap">
                    <div class="w-36">
                        <div class="flex justify-between items-center mb-1">
                            <span class="font-extrabold text-xs text-gray-900 dark:text-white">${student.score} %</span>
                            <span class="text-[10px] text-gray-400">النقاط</span>
                        </div>
                        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                            <div class="${scoreColor} h-2 rounded-full transition-all duration-500" style="width: ${student.score}%"></div>
                        </div>
                    </div>
                </td>

                <!-- Quick Score Adjustment Controls -->
                <td class="py-3.5 px-4 text-center whitespace-nowrap">
                    <div class="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-900 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
                        <button onclick="adjustScore(${student.id}, -5)" class="w-7 h-7 rounded-lg bg-white dark:bg-gray-800 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors flex items-center justify-center font-bold text-xs shadow-xs" title="-5 نقاط">
                            -5
                        </button>
                        <button onclick="adjustScore(${student.id}, -1)" class="w-7 h-7 rounded-lg bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center font-bold text-xs shadow-xs" title="-1 نقطة">
                            -1
                        </button>
                        <button onclick="adjustScore(${student.id}, 1)" class="w-7 h-7 rounded-lg bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center font-bold text-xs shadow-xs" title="+1 نقطة">
                            +1
                        </button>
                        <button onclick="adjustScore(${student.id}, 5)" class="w-7 h-7 rounded-lg bg-white dark:bg-gray-800 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors flex items-center justify-center font-bold text-xs shadow-xs" title="+5 نقاط">
                            +5
                        </button>
                    </div>
                </td>

                <!-- Action Buttons -->
                <td class="py-3.5 px-4 text-center whitespace-nowrap">
                    <div class="flex items-center justify-center gap-2">
                        <button onclick="openEditStudentModal(${student.id})" class="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors" title="تعديل البيانات">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button onclick="deleteStudent(${student.id})" class="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors" title="حذف الطالب">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ---------------- Actions ----------------

// Real-Time Quick Adjust Score (clamped 0..100 in SQL)
async function adjustScore(studentId, delta) {
    try {
        const data = await runAction({ action: 'score_adjust', id: studentId, delta: delta });
        if (data) showToast(data.message);
    } catch (err) {
        showToast(err.message, true);
    }
}

// Add/Edit Student Form Handlers
function openModal(modalId) {
    if (modalId === 'addStudentModal') modalId = 'studentModal'; // original header button id
    const modal = document.getElementById(modalId);
    const card = document.getElementById(modalId + 'Card');

    if (modalId === 'studentModal' && !document.getElementById('formStudentId').value) {
        if (groups.length === 0) {
            showToast('أضف مجموعة واحدة على الأقل قبل إضافة الطلاب', true);
            openModal('manageGroupsModal');
            return;
        }
        document.getElementById('modalTitle').textContent = 'إضافة طالب جديد';
        document.getElementById('studentForm').reset();
        document.getElementById('formStudentId').value = '';
        document.getElementById('formStudentPassword').required = true;
        document.getElementById('formPasswordLabel').textContent = 'كلمة مرور الطالب *';
        document.getElementById('formStudentPassword').placeholder = 'كلمة المرور لتسجيل دخول الطالب';
        selectedAvatar = '👨‍🎓';
        renderAvatarOptions();
    }

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        if (card) card.classList.remove('scale-95');
    }, 10);
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    const card = document.getElementById(modalId + 'Card');
    if (card) card.classList.add('scale-95');
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        if (modalId === 'studentModal') {
            document.getElementById('formStudentId').value = '';
        }
    }, 200);
}

function openEditStudentModal(studentId) {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    document.getElementById('studentForm').reset();
    document.getElementById('modalTitle').textContent = 'تعديل بيانات الطالب';
    document.getElementById('formStudentId').value = student.id;
    document.getElementById('formStudentName').value = student.name;
    document.getElementById('formStudentGroup').value = String(student.group_id);
    document.getElementById('formStudentScore').value = student.score;
    document.getElementById('formStudentPassword').value = '';
    document.getElementById('formStudentPassword').required = false;
    document.getElementById('formPasswordLabel').textContent = 'كلمة مرور الطالب';
    document.getElementById('formStudentPassword').placeholder = 'اتركه فارغاً للإبقاء على كلمة المرور الحالية';
    selectedAvatar = student.avatar || '👨‍🎓';
    renderAvatarOptions();

    openModal('studentModal');
}

async function saveStudentForm(event) {
    event.preventDefault();
    const idInput = document.getElementById('formStudentId').value;
    const name = document.getElementById('formStudentName').value.trim();
    const group = document.getElementById('formStudentGroup').value;
    const score = parseInt(document.getElementById('formStudentScore').value) || 0;
    const password = document.getElementById('formStudentPassword').value;
    const submitBtn = event.target.querySelector('button[type="submit"]');

    submitBtn.disabled = true;
    try {
        const data = await runAction({
            action: 'student_save',
            id: idInput ? parseInt(idInput) : null,
            name: name,
            group_id: parseInt(group),
            score: score,
            avatar: selectedAvatar,
            password: password
        });
        if (data) {
            closeModal('studentModal');
            showToast(data.message);
        }
    } catch (err) {
        showToast(err.message, true);
    } finally {
        submitBtn.disabled = false;
    }
}

async function deleteStudent(studentId) {
    const student = students.find(s => s.id === studentId);
    if (student && confirm(`هل أنت تأكد من حذف الطالب (${student.name})؟`)) {
        try {
            const data = await runAction({ action: 'student_delete', id: studentId });
            if (data) showToast(data.message);
        } catch (err) {
            showToast(err.message, true);
        }
    }
}

// Group Management Handlers
async function addNewGroup(event) {
    event.preventDefault();
    const input = document.getElementById('newGroupNameInput');
    const newName = input.value.trim();
    if (!newName) return;
    try {
        const data = await runAction({ action: 'group_add', name: newName });
        if (data) {
            input.value = '';
            showToast(data.message);
        }
    } catch (err) {
        showToast(err.message, true);
    }
}

async function removeGroup(groupId) {
    // Avoid filtering by a group that is about to disappear
    if (document.getElementById('groupFilter').value === String(groupId)) {
        document.getElementById('groupFilter').value = 'ALL';
    }
    try {
        const data = await runAction({ action: 'group_delete', id: groupId });
        if (data) showToast(data.message);
    } catch (err) {
        alert(' ' + err.message);
        updateDashboard();
    }
}

function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('groupFilter').value = 'ALL';
    document.getElementById('sortBySelect').value = 'scoreDesc';
    handleFilterAndSearch();
}
