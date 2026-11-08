'use strict';

// ---------------------------------------------------------------
// Student view of the original dashboard: read-only, own data only.
// Render functions are the original ones (same markup / classes).
// ---------------------------------------------------------------
let students = [];       // contains ONLY the logged-in student
let podium = [];
let stats = {};
let totalStudents = 0;
let groups = [];

window.onload = async function () {
    let st;
    try {
        const sess = await loadSession();
        if (sess.role !== 'student') { window.location.href = 'login.html'; return; }
        const res = await fetch('/api/student/me', { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
        if (res.status === 401) { window.location.href = 'login.html'; return; }
        st = await res.json();
        if (!st.ok) throw new Error(st.message || 'error');
    } catch (e) {
        showToast('تعذر تحميل البيانات.', true);
        return;
    }
    const me = st.me;
    students = [{ id: me.id, code: me.code, name: me.name, group: me.group, score: me.score, avatar: me.avatar, rank: me.rank }];
    podium = students;
    groups = [me.group];
    totalStudents = me.total;
    stats = { total_students: me.total, total_groups: st.groups_total, avg_score: me.avg, rank: me.rank };
    renderGroupOptions();
    renderStats();
    renderPodium();
    handleFilterAndSearch();
};

function renderGroupOptions() {
    const groupFilter = document.getElementById('groupFilter');
    let filterHtml = '<option value="ALL">جميع المجموعات</option>';
    groups.forEach(g => { filterHtml += `<option value="${esc(g)}">${esc(g)}</option>`; });
    groupFilter.innerHTML = filterHtml;
}

function renderStats() {
    const me = students[0];
    document.getElementById('statTotalStudents').textContent = stats.total_students;
    document.getElementById('statTotalGroups').textContent = stats.total_groups;
    document.getElementById('statAvgRating').textContent = `${Number(stats.avg_score).toFixed(1)}%`;
    document.getElementById('statTopStudent').textContent = me.name;
    document.getElementById('statTopScore').innerHTML = `<i class="fa-solid fa-trophy text-[10px]"></i> #${me.rank} - ${me.score} نقطة`;
}

// Own card only, placed on the podium step that matches the real rank
function renderPodium() {
    const container = document.getElementById('podiumContainer');
    const me = students[0];
    let item;
    if (me.rank === 1) item = { badge: '👑', color: 'from-amber-400 to-yellow-500', height: 'h-40 sm:h-44' };
    else if (me.rank === 2) item = { badge: '🥈', color: 'from-gray-300 to-gray-400', height: 'h-32 sm:h-36' };
    else if (me.rank === 3) item = { badge: '🥉', color: 'from-amber-700 to-amber-800', height: 'h-24 sm:h-28' };
    else item = { badge: '⭐', color: 'from-blue-400 to-indigo-500', height: 'h-24 sm:h-28' };
    item = { ...me, ...item, pos: me.rank };

    container.innerHTML = `
        <div class="flex flex-col items-center flex-1 max-w-[200px] w-full">
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
    `;
}

// Search / filter / sort over the single own record (same function names as the original)
function handleFilterAndSearch() {
    const searchQuery = document.getElementById('searchInput').value.trim().toLowerCase();
    const selectedGroup = document.getElementById('groupFilter').value;
    const result = students.filter(student => {
        const matchesSearch = student.name.toLowerCase().includes(searchQuery) || student.code.toLowerCase().includes(searchQuery);
        const matchesGroup = selectedGroup === 'ALL' || student.group === selectedGroup;
        return matchesSearch && matchesGroup;
    });
    renderTable(result);
}

function renderTable(displayStudents) {
    const tbody = document.getElementById('studentsTableBody');
    const emptyState = document.getElementById('emptyState');
    const counter = document.getElementById('studentCounterBadge');

    counter.textContent = `عرض ${displayStudents.length} من ${students.length}`;

    if (displayStudents.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }
    emptyState.classList.add('hidden');

    tbody.innerHTML = displayStudents.map(student => {
        let rankBadge = `<span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs">#${student.rank}</span>`;
        if (student.rank === 1) rankBadge = `<span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700 font-bold text-xs"><i class="fa-solid fa-crown text-amber-500"></i></span>`;
        if (student.rank === 2) rankBadge = `<span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-200 text-slate-700 font-bold text-xs">2</span>`;
        if (student.rank === 3) rankBadge = `<span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-900/20 text-amber-600 font-bold text-xs">3</span>`;

        let scoreColor = 'bg-blue-600';
        if (student.score >= 90) scoreColor = 'bg-emerald-500';
        else if (student.score >= 75) scoreColor = 'bg-blue-500';
        else if (student.score >= 60) scoreColor = 'bg-amber-500';
        else scoreColor = 'bg-rose-500';

        return `
            <tr class="hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors">
                <td class="py-3.5 px-4 text-center whitespace-nowrap">${rankBadge}</td>
                <td class="py-3.5 px-4 whitespace-nowrap">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xl flex-shrink-0">${esc(student.avatar)}</div>
                        <div>
                            <h4 class="font-bold text-gray-900 dark:text-white leading-tight">${esc(student.name)}</h4>
                            <span class="text-[11px] text-gray-400 font-mono">${esc(student.code)}</span>
                        </div>
                    </div>
                </td>
                <td class="py-3.5 px-4 whitespace-nowrap">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800/40">
                        <i class="fa-solid fa-layer-group text-[10px]"></i> ${esc(student.group)}
                    </span>
                </td>
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
            </tr>
        `;
    }).join('');
}

function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('groupFilter').value = 'ALL';
    document.getElementById('sortBySelect').value = 'scoreDesc';
    handleFilterAndSearch();
}
