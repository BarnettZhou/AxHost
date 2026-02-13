let currentPage = 1;
let currentView = localStorage.getItem('projectView') || 'card';
let currentProjectType = 'my';
let projectsData = [];
let activeDropdown = null;
let perPage = parseInt(localStorage.getItem('projectPerPage')) || 12;

let allTags = [];
let commonTags = [];
let selectedTagFilter = '';
let manageTagSearch = '';
let addTagColor = '#D3D3D3';
let tagFormMode = 'create';
let tagFormEditingId = null;

let uploadSelectedTags = [];
let editSelectedTags = [];

const TAG_COLORS = [
    { base: '#ffffff', highlight: '#80858f' },
    { base: '#d5e4fe', highlight: '#2a71f1' },
    { base: '#d6f1ff', highlight: '#08a1f2' },
    { base: '#d3f3e2', highlight: '#45af77' },
    { base: '#fedbdb', highlight: '#de3c36' },
    { base: '#ffecdb', highlight: '#f88825' },
    { base: '#fff5cc', highlight: '#f5c400' },
    { base: '#fbdbff', highlight: '#9a38d7' },
    { base: '#ffdbea', highlight: '#dd4097' },
];

function colorHighlight(baseColor) {
    const found = TAG_COLORS.find(item => item.base.toUpperCase() === (baseColor || '').toUpperCase());
    return found ? found.highlight : '#444952';
}

function formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    const currentYear = new Date().getFullYear();
    const year = parseInt(dateStr.slice(0, 4), 10);
    if (year === currentYear) {
        return dateStr.slice(5);
    }
    return dateStr;
}

function tagChipHtml(tag, { compact = false, highlight = false, removable = false, removeFn = '' } = {}) {
    const bgColor = highlight ? colorHighlight(tag.color || '#D3D3D3') : (tag.color || '#D3D3D3');
    const textColor = highlight ? '#ffffff' : '#374151';
    const name = escapeHtml(tag.name || '');
    const emoji = tag.emoji ? `<span>${escapeHtml(tag.emoji)}</span>` : '';
    const sizeClass = compact ? 'text-xs px-2 py-1' : 'text-xs px-2.5 py-1.5';
    return `
        <span class="inline-flex items-center gap-1 rounded-full ${sizeClass} border border-black/5" style="background:${bgColor};color:${textColor};">
            ${emoji}
            <span>${name}</span>
            ${removable ? `<button type="button" onclick="${removeFn}" class="ml-1 text-current/80 hover:text-current">×</button>` : ''}
        </span>
    `;
}

function renderCardTags(tags) {
    if (!tags || tags.length === 0) {
        return '<span class="text-xs text-gray-400">无标签</span>';
    }
    const maxChars = 24;
    let used = 0;
    const visible = [];
    for (const tag of tags) {
        const len = (tag.name || '').length + 1;
        if (visible.length > 0 && used + len > maxChars) break;
        visible.push(tag);
        used += len;
    }
    const hidden = tags.length - visible.length;
    const chips = visible.map(tag => tagChipHtml(tag, { compact: true })).join('');
    if (hidden <= 0) return `<div class="flex flex-wrap gap-1">${chips}</div>`;
    const encoded = encodeURIComponent(JSON.stringify(tags));
    return `
        <div class="flex flex-wrap gap-1 items-center">
            ${chips}
            <button onclick="openProjectTagsModalEncoded('${encoded}')" class="inline-flex items-center rounded-full text-xs px-2 py-1 border border-gray-300 bg-white text-gray-600 hover:text-orange-600">+${hidden} 个标签</button>
        </div>
    `;
}

function renderListTags(tags) {
    if (!tags || tags.length === 0) return '';
    const max = 5;
    const visible = tags.slice(0, max);
    const hidden = tags.length - visible.length;
    const chips = visible.map(tag => tagChipHtml(tag, { compact: true })).join('');
    if (hidden <= 0) return `<div class="flex flex-wrap gap-1 mt-1">${chips}</div>`;
    const encoded = encodeURIComponent(JSON.stringify(tags));
    return `
        <div class="flex flex-wrap gap-1 mt-1">
            ${chips}
            <button onclick="openProjectTagsModalEncoded('${encoded}')" class="inline-flex items-center rounded-full text-xs px-2 py-1 border border-gray-300 bg-white text-gray-600 hover:text-orange-600">+${hidden} 个标签</button>
        </div>
    `;
}

function renderProjectActionMenu(project, projectUrl, canManage, isAdmin) {
    const copyItem = `
        <button onclick="copyProjectLink('${projectUrl}')" class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
            </svg>
            复制链接
        </button>
    `;
    const manageItems = canManage ? `
        <button onclick="showUpdateModal('${project.object_id}', '${escapeHtml(project.name)}')" class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
            </svg>
            更新原型
        </button>
        <button onclick="showEditModalById('${project.object_id}')" class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
            </svg>
            修改信息
        </button>
        <button onclick="showDeleteModal('${project.object_id}', '${escapeHtml(project.name)}')" class="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
            删除原型
        </button>
    ` : '';
    const adminItem = isAdmin ? `
        <button onclick="showChangeAuthorModal('${project.object_id}', '${escapeHtml(project.name)}')" class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
            </svg>
            更改作者
        </button>
    ` : '';
    return `${copyItem}${manageItems}${adminItem}`;
}

function openProjectTagsModal(tags) {
    const body = document.getElementById('projectTagsModalBody');
    body.innerHTML = (tags || []).map(tag => tagChipHtml(tag)).join('') || '<span class="text-sm text-gray-400">无标签</span>';
    document.getElementById('projectTagsModal').classList.remove('hidden');
}

function openProjectTagsModalEncoded(encoded) {
    try {
        const tags = JSON.parse(decodeURIComponent(encoded));
        openProjectTagsModal(tags);
    } catch (error) {
        showToast('标签数据解析失败', 'error');
    }
}

function closeProjectTagsModal() {
    document.getElementById('projectTagsModal').classList.add('hidden');
}

function getCurrentUser() {
    try {
        if (typeof currentUser !== 'undefined' && currentUser) return currentUser;
    } catch (error) {
        // ignore
    }
    return window.currentUser || null;
}

async function ensureCurrentUserReady() {
    if (getCurrentUser()) return getCurrentUser();
    try {
        const response = await fetch('/api/auth/me');
        if (!response.ok) return null;
        const user = await response.json();
        try {
            currentUser = user;
        } catch (error) {
            // ignore
        }
        window.currentUser = user;
        return user;
    } catch (error) {
        return null;
    }
}

function normalizeTagName(name) {
    return (name || '').trim();
}

function uniqueTagNames(tags) {
    const seen = new Set();
    const names = [];
    for (const tag of tags || []) {
        const name = normalizeTagName(tag.name);
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        names.push(name);
    }
    return names;
}

function getTagById(tagId) {
    return allTags.find(tag => String(tag.id) === String(tagId));
}

function getTagByName(name) {
    const key = normalizeTagName(name).toLowerCase();
    return allTags.find(tag => tag.name.toLowerCase() === key);
}

function renderTagFilterOptions(search = '') {
    const container = document.getElementById('tagFilterOptions');
    if (!container) return;
    
    const keyword = search.toLowerCase().trim();
    const filteredTags = keyword ? allTags.filter(tag => tag.name.toLowerCase().includes(keyword)) : allTags;
    
    const options = filteredTags.map(tag => `
        <div class="dropdown-option px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors" data-value="${tag.id}" onclick="selectTagFilter('${tag.id}', '${escapeHtml(tag.name)}')">${escapeHtml(tag.emoji || '')} ${escapeHtml(tag.name)}</div>
    `).join('');
    
    container.innerHTML = '<div class="dropdown-option px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors bg-orange-50 text-orange-700" data-value="" onclick="selectTagFilter(\'\', \'全部标签\')">全部标签</div>' + (options || '<div class="px-4 py-2 text-sm text-gray-400">未找到匹配标签</div>');
}

function renderQuickTagFilters() {
    const container = document.getElementById('quickTagFilters');
    if (!container) return;
    if (!commonTags.length) {
        container.innerHTML = '<span class="text-xs text-gray-400">暂无常用标签</span>';
        return;
    }
    container.innerHTML = commonTags.map(tag => {
        const active = String(selectedTagFilter) === String(tag.id);
        return `<button type="button" onclick="toggleQuickTagFilter('${tag.id}')">${tagChipHtml(tag, { compact: true, highlight: active })}</button>`;
    }).join('');
}

function toggleQuickTagFilter(tagId) {
    const next = String(selectedTagFilter) === String(tagId) ? '' : String(tagId);
    if (next) {
        const tag = getTagById(next);
        if (tag) {
            selectedTagFilter = next;
            setDropdownValue('tagFilter', next);
        }
    } else {
        selectedTagFilter = '';
        selectDropdownOption('tagFilter', '', '全部标签');
    }
    loadProjects(1);
    renderQuickTagFilters();
}

function selectTagFilter(value, label) {
    selectedTagFilter = value ? String(value) : '';
    selectDropdownOption('tagFilter', selectedTagFilter, label || '全部标签');
    loadProjects(1);
    renderQuickTagFilters();
}

async function loadTags(search = '') {
    const response = await fetch(`/api/tags?search=${encodeURIComponent(search)}`);
    if (!response.ok) throw new Error('加载标签失败');
    return response.json();
}

async function loadCommonTags() {
    const response = await fetch('/api/tags/common');
    if (!response.ok) throw new Error('加载常用标签失败');
    return response.json();
}

async function refreshTagsData() {
    [allTags, commonTags] = await Promise.all([loadTags(), loadCommonTags()]);
    renderTagFilterOptions();
    renderQuickTagFilters();
    renderManageTagLists();
}

async function loadAuthors() {
    try {
        const me = getCurrentUser();
        const response = await fetch('/api/users/options');
        const users = await response.json();
        const menu = document.getElementById('authorFilter_menu');
        if (!menu) return;
        const defaultOption = '<div class="dropdown-option px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors bg-orange-50 text-orange-700" data-value="" onclick="selectAuthorOption(\'\', \'全部作者\')">全部作者</div>';
        const options = users
            .filter(u => !me || u.id !== me.id)
            .map(u => `<div class="dropdown-option px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors" data-value="${u.id}" onclick="selectAuthorOption(${u.id}, '${escapeHtml(u.name)}')">${escapeHtml(u.name)}</div>`)
            .join('');
        menu.innerHTML = defaultOption + options;
    } catch (error) {
        console.error('加载作者列表失败:', error);
    }
}

function selectAuthorOption(value, label) {
    selectDropdownOption('authorFilter', value, label);
    loadProjects(1);
}

function switchProjectType(type) {
    currentProjectType = type;

    const myBtn = document.getElementById('myProjectBtn');
    const collabBtn = document.getElementById('collaborateBtn');
    const authorFilter = document.getElementById('authorFilterContainer');

    if (type === 'my') {
        myBtn?.classList.add('active');
        myBtn?.classList.remove('text-gray-600');
        collabBtn?.classList.remove('active');
        collabBtn?.classList.add('text-gray-600');
        authorFilter.classList.add('opacity-0', 'pointer-events-none');
        authorFilter.classList.remove('opacity-100');
        setDropdownValue('authorFilter', '');
    } else {
        collabBtn?.classList.add('active');
        collabBtn?.classList.remove('text-gray-600');
        myBtn?.classList.remove('active');
        myBtn?.classList.add('text-gray-600');
        authorFilter.classList.remove('opacity-0', 'pointer-events-none');
        authorFilter.classList.add('opacity-100');
    }
    loadProjects(1);
}

// 分页组件渲染
function renderPagination(total, totalPages, currentPageNum) {
    const pageEl = document.getElementById('pagination');
    if (!pageEl) return;
    
    pageEl.dataset.total = total;
    pageEl.dataset.totalPages = totalPages;
    
    const hasPrev = currentPageNum > 1;
    const hasNext = currentPageNum < totalPages;
    
    const perPageOptions = [12, 24, 48];
    const perPageOptionsHtml = perPageOptions.map(opt => 
        `<div class="dropdown-option px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors ${opt === perPage ? 'bg-orange-50 text-orange-700' : ''}" data-value="${opt}" onclick="selectPerPageOption(${opt})">${opt}条/页</div>`
    ).join('');
    
    pageEl.innerHTML = `
        <span class="text-gray-500">共 ${total} 条数据</span>
        
        <div class="flex items-center gap-2">
            <button onclick="loadProjects(${currentPageNum - 1})" 
                class="h-8 w-8 flex items-center justify-center rounded-lg border ${hasPrev ? 'border-gray-300 hover:border-orange-500 hover:text-orange-600' : 'border-gray-200 text-gray-300 cursor-not-allowed'} transition-colors"
                ${!hasPrev ? 'disabled' : ''}>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                </svg>
            </button>
            
            <div class="flex items-center gap-1">
                <span id="pageNumberDisplay" onclick="showPageInput(${currentPageNum}, ${totalPages})" 
                    class="cursor-pointer hover:text-orange-600 font-medium min-w-[40px] text-center">
                    ${currentPageNum}
                </span>
                <span class="text-gray-400">/ ${totalPages}</span>
            </div>
            
            <button onclick="loadProjects(${currentPageNum + 1})" 
                class="h-8 w-8 flex items-center justify-center rounded-lg border ${hasNext ? 'border-gray-300 hover:border-orange-500 hover:text-orange-600' : 'border-gray-200 text-gray-300 cursor-not-allowed'} transition-colors"
                ${!hasNext ? 'disabled' : ''}>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
            </button>
        </div>
        
        <!-- 每页数量选择 - 自定义下拉菜单样式 -->
        <div class="custom-dropdown relative w-[100px]" id="perPage_container">
            <button type="button" 
                    class="dropdown-trigger w-full h-8 px-3 rounded-lg border border-gray-300 bg-white text-left text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-colors flex items-center justify-between"
                    onclick="toggleDropdownMenu('perPage')">
                <span class="dropdown-text text-gray-700">${perPage}条/页</span>
                <svg class="dropdown-arrow w-4 h-4 text-gray-400 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
            </button>
            <input type="hidden" id="perPage" value="${perPage}">
            <div class="dropdown-menu absolute z-50 w-full mb-1 bottom-full bg-white rounded-lg shadow-lg border border-gray-200 py-1 hidden" id="perPage_menu">
                ${perPageOptionsHtml}
            </div>
        </div>
    `;
}

// 显示页码输入框
function showPageInput(currentPageNum, totalPages) {
    const displayEl = document.getElementById('pageNumberDisplay');
    if (!displayEl) return;
    
    const input = document.createElement('input');
    input.type = 'number';
    input.min = 1;
    input.max = totalPages;
    input.value = currentPageNum;
    input.className = 'w-12 h-7 px-1 text-center text-sm border border-orange-500 rounded focus:outline-none focus:ring-2 focus:ring-orange-500';
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const page = parseInt(e.target.value, 10);
            if (page >= 1 && page <= totalPages) {
                loadProjects(page);
            } else {
                showToast(`请输入1-${totalPages}之间的页码`, 'error');
            }
        } else if (e.key === 'Escape') {
            renderPagination(document.getElementById('pagination').dataset.total || 0, totalPages, currentPageNum);
        }
    });
    
    input.addEventListener('blur', () => {
        const pageEl = document.getElementById('pagination');
        renderPagination(pageEl?.dataset.total || 0, parseInt(pageEl?.dataset.totalPages || 1, 10), currentPageNum);
    });
    
    displayEl.replaceWith(input);
    input.focus();
    input.select();
}

// 选择每页数量选项
function selectPerPageOption(value) {
    selectDropdownOption('perPage', value, `${value}条/页`);
    changePerPage(value);
}

// 切换每页数量
function changePerPage(newPerPage) {
    perPage = parseInt(newPerPage, 10);
    localStorage.setItem('projectPerPage', perPage);
    loadProjects(1);
}

async function loadProjects(page = 1) {
    currentPage = page;
    const search = document.getElementById('searchInput').value;
    const authorId = document.getElementById('authorFilter')?.value || '';

    let url = `/api/projects?page=${page}&per_page=${perPage}&search=${encodeURIComponent(search)}&project_type=${currentProjectType}`;
    if (authorId && currentProjectType === 'collaborate') {
        url += `&author_id=${authorId}`;
    }
    if (selectedTagFilter) {
        url += `&tag_id=${selectedTagFilter}`;
    }

    try {
        const response = await fetch(url);
        const data = await response.json();
        projectsData = data.items || [];

        if (currentView === 'card') {
            renderCardView(projectsData);
        } else {
            renderListView(projectsData);
        }

        const totalPages = Math.ceil((data.total || 0) / (data.per_page || perPage));
        renderPagination(data.total || 0, totalPages, page);
    } catch (error) {
        console.error('加载失败:', error);
        showToast('加载失败', 'error');
    }
}

function renderCardView(projects) {
    const listEl = document.getElementById('cardView');
    if (!projects.length) {
        listEl.innerHTML = '<div class="col-span-full text-center py-12 text-gray-400">暂无原型项目</div>';
        return;
    }

    // 使用 requestAnimationFrame 批量渲染，避免阻塞主线程
    const html = projects.map(project => {
        const me = getCurrentUser();
        const canManage = me && (me.role === 'admin' || project.author_id === me.id);
        const isAdmin = me && me.role === 'admin';
        const projectUrl = `${window.location.origin}/projects/${project.object_id}/`;
        const hasRemark = project.remark && project.remark.trim();
        const shortRemark = hasRemark ? project.remark.replace(/\n/g, ' ').substring(0, 48) : '';
        const needMore = hasRemark && project.remark.length > 48;

        return `
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 card-hover relative group flex flex-col">
                <div class="flex items-start justify-between mb-2">
                    <div class="flex items-center gap-2 flex-1 min-w-0">
                        ${project.is_public ? '<span class="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full flex-shrink-0">公开</span>' : '<span class="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full flex-shrink-0">私密</span>'}
                        <h3 class="font-semibold text-gray-900 truncate cursor-pointer hover:text-orange-600" onclick="viewProject('${project.object_id}')">${escapeHtml(project.name)}</h3>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0 ml-2">
                        <div class="flex items-center gap-1 text-sm text-gray-500">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                            <span class="truncate max-w-[80px]">${escapeHtml(project.author_name)}</span>
                        </div>
                        <div class="relative">
                            <button onclick="toggleDropdown(event, '${project.object_id}')" class="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"></path></svg>
                            </button>
                            <div id="dropdown-${project.object_id}" class="dropdown-menu absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                                ${renderProjectActionMenu(project, projectUrl, canManage, isAdmin)}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flex items-center justify-between mb-2">
                    ${hasRemark ? `<button type="button" onclick="showRemarkModal('${escapeHtml(project.remark)}')" class="text-sm text-gray-600 truncate pr-3 text-left hover:text-orange-600">${escapeHtml(shortRemark)}${needMore ? '...' : ''}</button>` : '<span class="text-sm text-gray-400">无备注</span>'}
                    <span class="text-xs text-gray-400 flex-shrink-0">${formatDisplayDate(project.updated_at)}</span>
                </div>
                <div class="border-t border-gray-100 my-2"></div>
                <div class="text-sm">${renderCardTags(project.tags || [])}</div>
            </div>
        `;
    }).join('');
    
    listEl.innerHTML = html;
}

function renderListView(projects) {
    const tbody = document.getElementById('listViewBody');
    if (!projects.length) {
        tbody.innerHTML = '<div class="px-6 py-12 text-center text-gray-400">暂无原型项目</div>';
        return;
    }

    const html = projects.map(project => {
        const me = getCurrentUser();
        const canManage = me && (me.role === 'admin' || project.author_id === me.id);
        const isAdmin = me && me.role === 'admin';
        const projectUrl = `${window.location.origin}/projects/${project.object_id}/`;
        const hasRemark = project.remark && project.remark.trim();

        return `
            <div class="flex gap-4 px-6 py-4 items-center hover:bg-gray-50">
                <div style="width: 22%">
                    <div class="font-medium text-gray-900 cursor-pointer hover:text-orange-600 truncate" onclick="viewProject('${project.object_id}')">${escapeHtml(project.name)}</div>
                </div>
                <div style="width: 16%">
                    ${renderListTags(project.tags || [])}
                </div>
                <div class="text-sm text-gray-500 truncate" style="width: 12%">${escapeHtml(project.author_name)}</div>
                <div style="width: 8%">${project.is_public ? '<span class="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">公开</span>' : '<span class="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full">私密</span>'}</div>
                <div class="text-sm text-gray-500" style="width: 20%">${formatDisplayDate(project.updated_at)}</div>
                <div class="text-sm flex-1 overflow-hidden">
                    ${hasRemark ? `<span class="text-gray-600 truncate block cursor-pointer hover:text-orange-600" onclick="showRemarkModal('${escapeHtml(project.remark)}')" title="点击查看完整备注">${escapeHtml(project.remark)}</span>` : '<span class="text-gray-400">无备注</span>'}
                </div>
                <div class="text-right" style="width: 8%">
                    <div class="relative inline-block">
                        <button onclick="toggleDropdown(event, 'list-${project.object_id}')" class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>
                        </button>
                        <div id="dropdown-list-${project.object_id}" class="dropdown-menu absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                            ${renderProjectActionMenu(project, projectUrl, canManage, isAdmin)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    tbody.innerHTML = html;
}

function switchView(view) {
    currentView = view;
    localStorage.setItem('projectView', view);

    const cardBtn = document.getElementById('cardViewBtn');
    const listBtn = document.getElementById('listViewBtn');
    const cardView = document.getElementById('cardView');
    const listView = document.getElementById('listView');

    if (view === 'card') {
        cardBtn?.classList.add('active');
        listBtn?.classList.remove('active');
        cardView.classList.remove('hidden');
        listView.classList.add('hidden');
        renderCardView(projectsData);
    } else {
        listBtn?.classList.add('active');
        cardBtn?.classList.remove('active');
        listView.classList.remove('hidden');
        cardView.classList.add('hidden');
        renderListView(projectsData);
    }
}

function toggleDropdown(event, projectId) {
    event.stopPropagation();

    document.querySelectorAll('.custom-dropdown .dropdown-menu').forEach(menu => menu.classList.add('hidden'));
    document.querySelectorAll('.custom-dropdown .dropdown-arrow').forEach(arrow => arrow.classList.remove('rotate-180'));

    if (activeDropdown && activeDropdown !== `dropdown-${projectId}`) {
        const prevDropdown = document.getElementById(activeDropdown);
        if (prevDropdown) prevDropdown.classList.remove('show');
    }

    const dropdown = document.getElementById(`dropdown-${projectId}`);
    if (dropdown) {
        dropdown.classList.toggle('show');
        activeDropdown = dropdown.classList.contains('show') ? `dropdown-${projectId}` : null;
    }
}

document.addEventListener('click', (e) => {
    if (e.target.closest('.custom-dropdown')) return;
    if (activeDropdown) {
        const dropdown = document.getElementById(activeDropdown);
        if (dropdown) dropdown.classList.remove('show');
        activeDropdown = null;
    }
});

function setupFileUpload() {
    const zone = document.getElementById('uploadZone');
    const input = document.getElementById('projectFile');

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            input.files = files;
            updateFileDisplay(files[0], 'upload');
        }
    });

    input.addEventListener('change', (e) => {
        if (e.target.files.length > 0) updateFileDisplay(e.target.files[0], 'upload');
    });
}

function setupUpdateFileUpload() {
    const zone = document.getElementById('updateUploadZone');
    const input = document.getElementById('updateProjectFile');

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            input.files = files;
            updateFileDisplay(files[0], 'update');
        }
    });

    input.addEventListener('change', (e) => {
        if (e.target.files.length > 0) updateFileDisplay(e.target.files[0], 'update');
    });
}

function updateFileDisplay(file, type) {
    const zone = document.getElementById(type === 'upload' ? 'uploadZone' : 'updateUploadZone');
    const placeholder = document.getElementById(type === 'upload' ? 'uploadPlaceholder' : 'updateUploadPlaceholder');
    const fileInfo = document.getElementById(type === 'upload' ? 'uploadFileInfo' : 'updateUploadFileInfo');
    const fileName = document.getElementById(type === 'upload' ? 'uploadFileName' : 'updateUploadFileName');

    zone.classList.add('has-file');
    placeholder.classList.add('hidden');
    fileInfo.classList.remove('hidden');
    fileName.textContent = file.name;
}

function resetFileDisplay(type) {
    const zone = document.getElementById(type === 'upload' ? 'uploadZone' : 'updateUploadZone');
    const placeholder = document.getElementById(type === 'upload' ? 'uploadPlaceholder' : 'updateUploadPlaceholder');
    const fileInfo = document.getElementById(type === 'upload' ? 'uploadFileInfo' : 'updateUploadFileInfo');

    zone.classList.remove('has-file');
    placeholder.classList.remove('hidden');
    fileInfo.classList.add('hidden');
}

function showUploadModal() {
    uploadSelectedTags = [];
    renderProjectFormTags('upload');
    
    // 清理可能残留的上传表单遮罩层和禁用状态
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        const overlay = document.getElementById('uploadForm_overlay');
        if (overlay) overlay.remove();
        
        uploadForm.querySelectorAll('button').forEach(el => {
            el.disabled = false;
            delete el.dataset.originalDisabled;
        });
        uploadForm.querySelectorAll('input, textarea, select').forEach(el => {
            el.disabled = false;
            delete el.dataset.originalDisabled;
        });
        
        const submitBtn = uploadForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '上传';
        }
    }
    
    document.getElementById('uploadModal').classList.remove('hidden');
}

function closeUploadModal() {
    document.getElementById('uploadModal').classList.add('hidden');
    
    // 清理上传表单的遮罩层和禁用状态
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        const overlay = document.getElementById('uploadForm_overlay');
        if (overlay) overlay.remove();
        
        uploadForm.querySelectorAll('button').forEach(el => {
            el.disabled = false;
            delete el.dataset.originalDisabled;
        });
        uploadForm.querySelectorAll('input, textarea, select').forEach(el => {
            el.disabled = false;
            delete el.dataset.originalDisabled;
        });
        
        const submitBtn = uploadForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '上传';
        }
    }
    
    uploadForm.reset();
    resetFileDisplay('upload');
    hideTagInput('upload');
}

function showUpdateModal(objectId, projectName) {
    document.getElementById('updateProjectId').value = objectId;
    document.getElementById('updateProjectName').value = projectName;
    
    // 清理可能残留的更新表单遮罩层和禁用状态
    const updateForm = document.getElementById('updateForm');
    if (updateForm) {
        const overlay = document.getElementById('updateForm_overlay');
        if (overlay) overlay.remove();
        
        updateForm.querySelectorAll('button').forEach(el => {
            el.disabled = false;
            delete el.dataset.originalDisabled;
        });
        updateForm.querySelectorAll('input, textarea, select').forEach(el => {
            el.disabled = false;
            delete el.dataset.originalDisabled;
        });
        
        const submitBtn = updateForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '确认更新';
        }
    }
    
    document.getElementById('updateModal').classList.remove('hidden');
}

function closeUpdateModal() {
    document.getElementById('updateModal').classList.add('hidden');
    
    // 清理更新表单的遮罩层和禁用状态
    const updateForm = document.getElementById('updateForm');
    if (updateForm) {
        const overlay = document.getElementById('updateForm_overlay');
        if (overlay) overlay.remove();
        
        updateForm.querySelectorAll('button').forEach(el => {
            el.disabled = false;
            delete el.dataset.originalDisabled;
        });
        updateForm.querySelectorAll('input, textarea, select').forEach(el => {
            el.disabled = false;
            delete el.dataset.originalDisabled;
        });
        
        const submitBtn = updateForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '确认更新';
        }
    }
    
    updateForm.reset();
    resetFileDisplay('update');
}

function showEditModal(project) {
    document.getElementById('editProjectId').value = project.object_id;
    document.getElementById('editProjectName').value = project.name;
    const usePassword = !project.is_public;
    document.getElementById('editUsePassword').checked = usePassword;
    document.getElementById('editViewPassword').value = project.view_password || '';
    document.getElementById('editRemark').value = project.remark || '';
    document.getElementById('editPasswordSection').classList.toggle('hidden', !usePassword);

    editSelectedTags = (project.tags || []).map(tag => ({ ...tag, pending: false }));
    renderProjectFormTags('edit');
    hideTagInput('edit');

    document.getElementById('editModal').classList.remove('hidden');
}

function showEditModalById(objectId) {
    const project = projectsData.find(item => item.object_id === objectId);
    if (!project) {
        showToast('项目数据不存在，请刷新后重试', 'error');
        return;
    }
    showEditModal(project);
}

function closeEditModal() {
    document.getElementById('editModal').classList.add('hidden');
    document.getElementById('editForm').reset();
    hideTagInput('edit');
}

function showDeleteModal(objectId, projectName) {
    document.getElementById('deleteProjectId').value = objectId;
    document.getElementById('deleteProjectName').textContent = projectName;
    document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteModal() {
    document.getElementById('deleteModal').classList.add('hidden');
}

function showRemarkModal(remark) {
    document.getElementById('remarkContent').textContent = remark;
    document.getElementById('remarkModal').classList.remove('hidden');
}

function closeRemarkModal() {
    document.getElementById('remarkModal').classList.add('hidden');
}

async function showChangeAuthorModal(objectId, projectName) {
    document.getElementById('changeAuthorProjectId').value = objectId;
    document.getElementById('changeAuthorProjectName').value = projectName;

    try {
        const response = await fetch('/api/users/options');
        const users = await response.json();
        const menu = document.getElementById('newAuthorSelect_menu');
        if (menu) {
            menu.innerHTML = '<div class="dropdown-option px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors" data-value="" onclick="selectNewAuthorOption(\'\', \'请选择新作者\')">请选择新作者</div>' +
                users.map(u => `<div class="dropdown-option px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors" data-value="${u.id}" onclick="selectNewAuthorOption(${u.id}, '${escapeHtml(u.name)} (${u.employee_id})')">${escapeHtml(u.name)} (${u.employee_id})</div>`).join('');
        }
    } catch (error) {
        showToast('加载用户列表失败', 'error');
    }

    document.getElementById('changeAuthorModal').classList.remove('hidden');
}

function selectNewAuthorOption(value, label) {
    selectDropdownOption('newAuthorSelect', value, label);
}

function closeChangeAuthorModal() {
    document.getElementById('changeAuthorModal').classList.add('hidden');
    document.getElementById('changeAuthorForm').reset();
    setDropdownValue('newAuthorSelect', '');
}

function generatePassword() {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let password = '';
    for (let i = 0; i < 6; i++) password += chars.charAt(Math.floor(Math.random() * chars.length));
    document.getElementById('viewPassword').value = password;
}

function generateEditPassword() {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let password = '';
    for (let i = 0; i < 6; i++) password += chars.charAt(Math.floor(Math.random() * chars.length));
    document.getElementById('editViewPassword').value = password;
}

function copyProjectLink(url) {
    // 兼容性方案：优先使用现代 API，降级使用传统方法
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => showToast('链接已复制到剪贴板', 'success')).catch(() => fallbackCopyText(url));
    } else {
        fallbackCopyText(url);
    }
}

// 兼容性降级方案（支持 Windows Chrome HTTP 环境）
function fallbackCopyText(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showToast('链接已复制到剪贴板', 'success');
        } else {
            showToast('复制失败，请手动复制', 'error');
        }
    } catch (err) {
        showToast('复制失败，请手动复制', 'error');
    }
    document.body.removeChild(textarea);
}

function viewProject(objectId) {
    window.open(`/projects/${objectId}/`, '_blank');
}

function currentFormTags(type) {
    return type === 'upload' ? uploadSelectedTags : editSelectedTags;
}

function setCurrentFormTags(type, tags) {
    if (type === 'upload') uploadSelectedTags = tags;
    else editSelectedTags = tags;
}

function renderProjectFormTags(type) {
    const chipsEl = document.getElementById(`${type}TagChips`);
    const tags = currentFormTags(type);
    chipsEl.innerHTML = tags.map((tag, idx) => {
        const pendingLabel = tag.pending ? '（待创建）' : '';
        return tagChipHtml({ ...tag, name: `${tag.name}${pendingLabel}` }, {
            removable: true,
            removeFn: `removeFormTag('${type}', ${idx})`
        });
    }).join('');
}

function removeFormTag(type, idx) {
    const tags = currentFormTags(type);
    tags.splice(idx, 1);
    setCurrentFormTags(type, tags);
    renderProjectFormTags(type);
}

function showTagInput(type) {
    document.getElementById(`${type}TagInputWrap`).classList.remove('hidden');
    document.getElementById(`${type}TagAddBtn`)?.classList.add('hidden');
    const input = document.getElementById(`${type}TagInput`);
    input.value = '';
    renderTagSearchResults(type);
    input.focus();
}

function hideTagInput(type) {
    document.getElementById(`${type}TagInputWrap`).classList.add('hidden');
    document.getElementById(`${type}TagAddBtn`)?.classList.remove('hidden');
    const input = document.getElementById(`${type}TagInput`);
    if (input) input.value = '';
    document.getElementById(`${type}TagResults`).classList.add('hidden');
}

function addFormTag(type, tag) {
    const tags = currentFormTags(type);
    if (tags.find(item => item.name.toLowerCase() === tag.name.toLowerCase())) {
        hideTagInput(type);
        return;
    }
    tags.push(tag);
    setCurrentFormTags(type, tags);
    renderProjectFormTags(type);
    hideTagInput(type);
}

function renderTagSearchResults(type) {
    const input = document.getElementById(`${type}TagInput`);
    const panel = document.getElementById(`${type}TagResults`);
    const keyword = normalizeTagName(input.value).toLowerCase();

    if (!keyword) {
        panel.classList.add('hidden');
        panel.innerHTML = '';
        return;
    }

    const matches = allTags.filter(tag => tag.name.toLowerCase().includes(keyword));
    panel.classList.remove('hidden');

    if (!matches.length) {
        panel.innerHTML = '<div class="px-3 py-2 text-sm text-gray-400">未找到匹配标签</div>';
        return;
    }

    panel.innerHTML = matches.map(tag => `
        <button type="button" onclick='addFormTag("${type}", ${JSON.stringify({ id: 0 })})' class="w-full px-3 py-2 text-left hover:bg-gray-50">${tagChipHtml(tag, { compact: true })}</button>
    `).join('');

    const buttons = panel.querySelectorAll('button');
    buttons.forEach((btn, idx) => {
        btn.onclick = () => addFormTag(type, { ...matches[idx], pending: false });
    });
}

function setupTagInputEvents(type) {
    const input = document.getElementById(`${type}TagInput`);
    input.addEventListener('input', () => renderTagSearchResults(type));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideTagInput(type);
            return;
        }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const name = normalizeTagName(input.value);
        if (!name) {
            hideTagInput(type);
            return;
        }
        if (name.length > 16) {
            showToast('标签名称不可超过16个字符', 'error');
            return;
        }
        const matched = getTagByName(name);
        if (matched) {
            addFormTag(type, { ...matched, pending: false });
            return;
        }
        addFormTag(type, { name, emoji: '', color: '#D3D3D3', pending: true });
    });
}

function showTagManagerModal() {
    document.getElementById('tagManagerModal').classList.remove('hidden');
    closeTagFormPopup();
    renderManageTagLists();
}

function closeTagManagerModal() {
    document.getElementById('tagManagerModal').classList.add('hidden');
    manageTagSearch = '';
    const searchInput = document.getElementById('manageTagSearchInput');
    if (searchInput) searchInput.value = '';
    closeTagFormPopup();
    renderManageTagLists();
}

function manageTagRow(tag, isCommon) {
    const canEdit = !!tag.can_edit;
    const moveBtn = isCommon
        ? `<button onclick="removeCommonTag(${tag.id})" class="h-7 w-7 rounded hover:bg-gray-100 text-gray-600" title="取消常用">
                <svg class="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
           </button>`
        : `<button onclick="addCommonTag(${tag.id})" class="h-7 w-7 rounded hover:bg-gray-100 text-gray-600" title="设为常用">
                <svg class="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                </svg>
           </button>`;

    const editBtn = canEdit
        ? `<button onclick="openEditTagPopup(${tag.id}, this)" class="h-7 w-7 rounded hover:bg-gray-100 text-gray-600" title="编辑">
                <svg class="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                </svg>
           </button>`
        : '';

    return `
        <div class="border border-gray-200 rounded-lg p-3 bg-white">
            <div class="flex items-center justify-between gap-2">
                <div class="min-w-0 flex items-center gap-1.5 text-sm text-gray-800">
                    <span class="w-2.5 h-2.5 rounded-full border border-black/10 flex-shrink-0" style="background:${tag.color || '#D3D3D3'};"></span>
                    ${tag.emoji ? `<span>${escapeHtml(tag.emoji)}</span>` : ''}
                    <span class="truncate">${escapeHtml(tag.name)}</span>
                </div>
                <div class="flex items-center gap-2">${moveBtn}${editBtn}</div>
            </div>
        </div>
    `;
}

function renderTagFormColorOptions() {
    const container = document.getElementById('tagFormColorOptions');
    if (!container) return;
    container.innerHTML = TAG_COLORS.map(item => {
        const active = item.base.toUpperCase() === (addTagColor || '').toUpperCase();
        return `<button type="button" data-color="${item.base}" class="w-6 h-6 rounded-full border-2 ${active ? 'border-black ring-2 ring-orange-500 ring-offset-1' : 'border-transparent'}" style="background:${item.base}"></button>`;
    }).join('');
    container.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            addTagColor = btn.dataset.color;
            renderTagFormColorOptions();
        });
    });
}

function renderManageTagLists() {
    const commonEl = document.getElementById('commonTagsManageList');
    const allEl = document.getElementById('allTagsManageList');
    const commonIds = new Set(commonTags.map(t => t.id));
    const filteredAll = allTags
        .filter(tag => !commonIds.has(tag.id))
        .filter(tag => !manageTagSearch || tag.name.toLowerCase().includes(manageTagSearch.toLowerCase()));

    commonEl.innerHTML = commonTags.length ? commonTags.map(tag => manageTagRow(tag, true)).join('') : '<div class="text-sm text-gray-400">暂无常用标签</div>';
    allEl.innerHTML = filteredAll.length ? filteredAll.map(tag => manageTagRow(tag, false)).join('') : '<div class="text-sm text-gray-400">暂无标签</div>';
}

async function addCommonTag(tagId) {
    const response = await fetch(`/api/tags/common/${tagId}`, { method: 'POST' });
    if (!response.ok) {
        showToast('加入常用失败', 'error');
        return;
    }
    await refreshTagsData();
}

async function removeCommonTag(tagId) {
    const response = await fetch(`/api/tags/common/${tagId}`, { method: 'DELETE' });
    if (!response.ok) {
        showToast('移除常用失败', 'error');
        return;
    }
    if (String(selectedTagFilter) === String(tagId)) {
        selectedTagFilter = '';
        selectDropdownOption('tagFilter', '', '全部标签');
        loadProjects(1);
    }
    await refreshTagsData();
}

function openAddTagPopup() {
    tagFormMode = 'create';
    tagFormEditingId = null;
    addTagColor = '#ffffff';
    document.getElementById('tagFormTitle').textContent = '添加标签';
    document.getElementById('tagFormSubmitBtn').textContent = '添加';
    document.getElementById('tagFormName').value = '';
    document.getElementById('tagFormEmoji').value = '';
    const popup = document.getElementById('tagFormPopup');
    popup.classList.remove('hidden');
    popup.style.right = '16px';
    popup.style.bottom = '56px';
    popup.style.left = 'auto';
    popup.style.top = 'auto';
    renderTagFormColorOptions();
}

function openEditTagPopup(tagId, triggerEl) {
    const tag = allTags.find(item => item.id === tagId);
    if (!tag) {
        showToast('标签不存在', 'error');
        return;
    }
    tagFormMode = 'edit';
    tagFormEditingId = tagId;
    addTagColor = tag.color || '#D3D3D3';
    document.getElementById('tagFormTitle').textContent = '编辑标签';
    document.getElementById('tagFormSubmitBtn').textContent = '保存';
    document.getElementById('tagFormName').value = tag.name || '';
    document.getElementById('tagFormEmoji').value = tag.emoji || '';
    const popup = document.getElementById('tagFormPopup');
    popup.classList.remove('hidden');
    const panel = document.getElementById('tagManagerPanel');
    if (panel && triggerEl) {
        const panelRect = panel.getBoundingClientRect();
        const triggerRect = triggerEl.getBoundingClientRect();
        const popupWidth = 360;
        const popupHeight = 230;
        let left = triggerRect.right - panelRect.left - popupWidth;
        let top = triggerRect.bottom - panelRect.top + 8;
        if (left < 8) left = 8;
        if (left + popupWidth > panelRect.width - 8) left = panelRect.width - popupWidth - 8;
        if (top + popupHeight > panelRect.height - 8) {
            top = triggerRect.top - panelRect.top - popupHeight - 8;
        }
        if (top < 8) top = 8;
        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
        popup.style.right = 'auto';
        popup.style.bottom = 'auto';
    }
    renderTagFormColorOptions();
}

function closeTagFormPopup() {
    document.getElementById('tagFormPopup').classList.add('hidden');
    document.getElementById('tagFormName').value = '';
    document.getElementById('tagFormEmoji').value = '';
    tagFormMode = 'create';
    tagFormEditingId = null;
    addTagColor = '#D3D3D3';
}

function isTagFormPopupOpen() {
    const popup = document.getElementById('tagFormPopup');
    return popup && !popup.classList.contains('hidden');
}

async function submitTagForm() {
    const mode = tagFormMode;
    const name = normalizeTagName(document.getElementById('tagFormName').value);
    const emoji = (document.getElementById('tagFormEmoji').value || '').trim();
    if (!name) {
        showToast('标签名称不能为空', 'error');
        return;
    }
    if (name.length > 16) {
        showToast('标签名称不可超过16个字符', 'error');
        return;
    }

    const url = mode === 'edit' ? `/api/tags/${tagFormEditingId}` : '/api/tags';
    const method = mode === 'edit' ? 'PUT' : 'POST';
    const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, emoji, color: addTagColor })
    });

    if (!response.ok) {
        const data = await response.json();
        showToast(data.detail || (mode === 'edit' ? '编辑失败' : '添加失败'), 'error');
        return;
    }

    closeTagFormPopup();
    await refreshTagsData();
    loadProjects(currentPage);
    showToast(mode === 'edit' ? '编辑成功' : '添加成功', 'success');
}

async function confirmDelete() {
    const objectId = document.getElementById('deleteProjectId').value;
    try {
        const response = await fetch(`/api/projects/${objectId}`, { method: 'DELETE' });
        if (response.ok) {
            closeDeleteModal();
            loadProjects();
            showToast('删除成功', 'success');
        } else {
            const data = await response.json();
            showToast(data.detail || '删除失败', 'error');
        }
    } catch (error) {
        showToast('网络错误', 'error');
    }
}

document.getElementById('usePassword').addEventListener('change', (e) => {
    document.getElementById('passwordSection').classList.toggle('hidden', !e.target.checked);
});

document.getElementById('editUsePassword').addEventListener('change', (e) => {
    document.getElementById('editPasswordSection').classList.toggle('hidden', !e.target.checked);
});

function setFormLoading(formId, isLoading, loadingText = '处理中...') {
    const form = document.getElementById(formId);
    const submitBtn = form.querySelector('button[type="submit"]');
    
    if (isLoading) {
        form.dataset.originalSubmitContent = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>${loadingText}`;
        
        form.querySelectorAll('button').forEach(el => {
            el.dataset.originalDisabled = el.disabled;
            el.disabled = true;
        });
        
        form.querySelectorAll('input, textarea, select').forEach(el => {
            el.dataset.originalDisabled = el.disabled;
            el.disabled = true;
        });
        
        const overlay = document.createElement('div');
        overlay.id = `${formId}_overlay`;
        overlay.className = 'absolute inset-0 bg-white/60 z-50 cursor-not-allowed';
        overlay.style.cssText = 'position: absolute; inset: 0; background: rgba(255,255,255,0.6); z-index: 50; cursor: not-allowed;';
        form.style.position = 'relative';
        form.appendChild(overlay);
    } else {
        submitBtn.disabled = false;
        submitBtn.innerHTML = form.dataset.originalSubmitContent || '提交';
        
        form.querySelectorAll('button').forEach(el => {
            el.disabled = el.dataset.originalDisabled === 'true';
        });
        
        form.querySelectorAll('input, textarea, select').forEach(el => {
            el.disabled = el.dataset.originalDisabled === 'true';
        });
        
        const overlay = document.getElementById(`${formId}_overlay`);
        if (overlay) overlay.remove();
    }
}

document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    setFormLoading('uploadForm', true, '上传中...');

    const usePassword = document.getElementById('usePassword').checked;
    const formData = new FormData();
    formData.append('file', document.getElementById('projectFile').files[0]);
    formData.append('name', document.getElementById('projectName').value);
    formData.append('is_public', !usePassword);
    formData.append('remark', document.getElementById('remark').value);
    formData.append('tags', JSON.stringify(uniqueTagNames(uploadSelectedTags)));

    if (usePassword) {
        formData.append('view_password', document.getElementById('viewPassword').value);
    }

    try {
        const response = await fetch('/api/projects/upload', { method: 'POST', body: formData });
        if (response.ok) {
            closeUploadModal();
            await refreshTagsData();
            loadProjects();
            showToast('上传成功', 'success');
        } else {
            const data = await response.json();
            showToast(data.detail || '上传失败', 'error');
        }
    } catch (error) {
        showToast('网络错误', 'error');
    } finally {
        setFormLoading('uploadForm', false);
    }
});

document.getElementById('updateForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    setFormLoading('updateForm', true, '更新中...');

    const objectId = document.getElementById('updateProjectId').value;
    const formData = new FormData();
    formData.append('file', document.getElementById('updateProjectFile').files[0]);

    try {
        const response = await fetch(`/api/projects/${objectId}/update-file`, { method: 'POST', body: formData });
        if (response.ok) {
            closeUpdateModal();
            loadProjects();
            showToast('更新成功', 'success');
        } else {
            const data = await response.json();
            showToast(data.detail || '更新失败', 'error');
        }
    } catch (error) {
        showToast('网络错误', 'error');
    } finally {
        setFormLoading('updateForm', false);
    }
});

document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const objectId = document.getElementById('editProjectId').value;
    const usePassword = document.getElementById('editUsePassword').checked;
    const data = {
        name: document.getElementById('editProjectName').value,
        is_public: !usePassword,
        remark: document.getElementById('editRemark').value,
        tag_names: uniqueTagNames(editSelectedTags)
    };

    if (usePassword) {
        data.view_password = document.getElementById('editViewPassword').value;
    }

    try {
        const response = await fetch(`/api/projects/${objectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            closeEditModal();
            await refreshTagsData();
            loadProjects();
            showToast('修改成功', 'success');
        } else {
            const resData = await response.json();
            showToast(resData.detail || '修改失败', 'error');
        }
    } catch (error) {
        showToast('网络错误', 'error');
    }
});

document.getElementById('changeAuthorForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const objectId = document.getElementById('changeAuthorProjectId').value;
    const newAuthorId = document.getElementById('newAuthorSelect').value;

    try {
        const response = await fetch(`/api/projects/${objectId}/change-author`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_author_id: parseInt(newAuthorId, 10) })
        });

        if (response.ok) {
            closeChangeAuthorModal();
            loadProjects();
            showToast('作者更改成功', 'success');
        } else {
            const data = await response.json();
            showToast(data.detail || '更改失败', 'error');
        }
    } catch (error) {
        showToast('网络错误', 'error');
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    if (currentView === 'list') {
        document.getElementById('cardViewBtn')?.classList.remove('active');
        document.getElementById('listViewBtn')?.classList.add('active');
        document.getElementById('cardView')?.classList.add('hidden');
        document.getElementById('listView')?.classList.remove('hidden');
    }

    document.getElementById('manageTagSearchInput').addEventListener('input', (e) => {
        manageTagSearch = e.target.value;
        renderManageTagLists();
    });

    document.getElementById('tagFilterSearch')?.addEventListener('input', (e) => {
        renderTagFilterOptions(e.target.value);
    });

    document.addEventListener('click', (e) => {
        if (!isTagFormPopupOpen()) return;
        const popup = document.getElementById('tagFormPopup');
        const insidePopup = e.target.closest('#tagFormPopup');
        const triggerBtn = e.target.closest('button[onclick*="openAddTagPopup"], button[onclick*="openEditTagPopup"]');
        if (insidePopup || triggerBtn) return;
        closeTagFormPopup();
        e.preventDefault();
        e.stopPropagation();
    }, true);

    setupTagInputEvents('upload');
    setupTagInputEvents('edit');
    setupFileUpload();
    setupUpdateFileUpload();

    await ensureCurrentUserReady();
    await Promise.all([
        loadAuthors(),
        refreshTagsData()
    ]);
    await loadProjects();
});
