// 项目数据相关
let currentPage = 1;
let currentView = localStorage.getItem('projectView') || 'card';
let currentProjectType = 'my'; // my: 我的项目, collaborate: 协作项目
let projectsData = [];
let activeDropdown = null;

// 初始化：加载保存的视图配置并应用
document.addEventListener('DOMContentLoaded', () => {
    // 应用保存的视图配置
    if (currentView === 'list') {
        document.getElementById('cardViewBtn')?.classList.remove('active');
        document.getElementById('listViewBtn')?.classList.add('active');
        document.getElementById('cardView')?.classList.add('hidden');
        document.getElementById('listView')?.classList.remove('hidden');
    }
    // 加载作者列表（用于协作项目筛选）
    loadAuthors();
});

// 加载作者列表（排除当前用户）
async function loadAuthors() {
    try {
        const response = await fetch('/api/users/options');
        const users = await response.json();
        const menu = document.getElementById('authorFilter_menu');
        if (!menu) return;
        // 保留"全部作者"选项，添加其他作者（排除当前用户）
        const defaultOption = '<div class="dropdown-option px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors bg-orange-50 text-orange-700" data-value="" onclick="selectAuthorOption(\'\', \'全部作者\')">全部作者</div>';
        const options = users
            .filter(u => u.id !== currentUser.id)
            .map(u => `<div class="dropdown-option px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors" data-value="${u.id}" onclick="selectAuthorOption(${u.id}, '${escapeHtml(u.name)}')">${escapeHtml(u.name)}</div>`)
            .join('');
        menu.innerHTML = defaultOption + options;
    } catch (error) {
        console.error('加载作者列表失败:', error);
    }
}

// 选择作者筛选选项
function selectAuthorOption(value, label) {
    selectDropdownOption('authorFilter', value, label);
    loadProjects();
}

// 切换项目类型
function switchProjectType(type) {
    currentProjectType = type;
    
    // 更新按钮样式
    const myBtn = document.getElementById('myProjectBtn');
    const collabBtn = document.getElementById('collaborateBtn');
    const authorFilter = document.getElementById('authorFilterContainer');
    
    if (type === 'my') {
        myBtn?.classList.add('active');
        myBtn?.classList.remove('text-gray-600');
        collabBtn?.classList.remove('active');
        collabBtn?.classList.add('text-gray-600');
        // 隐藏作者筛选 - 使用 opacity 和 pointer-events 避免布局跳动
        authorFilter.classList.add('opacity-0', 'pointer-events-none');
        authorFilter.classList.remove('opacity-100');
        // 清空作者筛选
        setDropdownValue('authorFilter', '');
        loadProjects(1);
    } else {
        collabBtn?.classList.add('active');
        collabBtn?.classList.remove('text-gray-600');
        myBtn?.classList.remove('active');
        myBtn?.classList.add('text-gray-600');
        // 显示作者筛选
        authorFilter.classList.remove('opacity-0', 'pointer-events-none');
        authorFilter.classList.add('opacity-100');
        loadProjects(1);
    }
}

// 加载项目列表
async function loadProjects(page = 1) {
    currentPage = page;
    const search = document.getElementById('searchInput').value;
    const authorId = document.getElementById('authorFilter')?.value || '';
    
    // 构建查询参数
    let url = `/api/projects?page=${page}&per_page=12&search=${encodeURIComponent(search)}&project_type=${currentProjectType}`;
    if (authorId && currentProjectType === 'collaborate') {
        url += `&author_id=${authorId}`;
    }
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        projectsData = data.items;
        
        if (currentView === 'card') {
            renderCardView(data.items);
        } else {
            renderListView(data.items);
        }
        
        // 分页
        const totalPages = Math.ceil(data.total / data.per_page);
        const pageEl = document.getElementById('pagination');
        let pageHtml = '';
        for (let i = 1; i <= totalPages; i++) {
            pageHtml += `<button onclick="loadProjects(${i})" class="px-3 py-1 rounded ${i === page ? 'bg-orange-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}">${i}</button>`;
        }
        pageEl.innerHTML = pageHtml;
        
    } catch (error) {
        console.error('加载失败:', error);
        showToast('加载失败', 'error');
    }
}

// 渲染卡片视图
function renderCardView(projects) {
    const listEl = document.getElementById('cardView');
    if (projects.length === 0) {
        listEl.innerHTML = '<div class="col-span-full text-center py-12 text-gray-400">暂无原型项目</div>';
        return;
    }
    
    listEl.innerHTML = projects.map(project => {
        const canManage = currentUser && (currentUser.role === 'admin' || project.author_id === currentUser.id);
        const isAdmin = currentUser && currentUser.role === 'admin';
        const projectUrl = `${window.location.origin}/projects/${project.object_id}/`;
        const hasRemark = project.remark && project.remark.trim();
        const shortRemark = hasRemark ? project.remark.replace(/\\n/g, ' ').substring(0, 30) : '';
        const needMore = hasRemark && project.remark.length > 30;
        
        return `
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 card-hover transition-all relative group flex flex-col">
                <!-- 第一行：标签 + 项目标题 + 作者 + 更多按钮 -->
                <div class="flex items-start justify-between mb-2">
                    <div class="flex items-center gap-2 flex-1 min-w-0">
                        ${project.is_public ? 
                            '<span class="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full flex-shrink-0">公开</span>' :
                            '<span class="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full flex-shrink-0">私密</span>'
                        }
                        <h3 class="font-semibold text-gray-900 truncate cursor-pointer hover:text-orange-600" onclick="viewProject('${project.object_id}')">${escapeHtml(project.name)}</h3>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0 ml-2">
                        <div class="flex items-center gap-1 text-sm text-gray-500">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                            </svg>
                            <span class="truncate max-w-[80px]">${escapeHtml(project.author_name)}</span>
                        </div>
                        <!-- 更多按钮 -->
                        <div class="relative">
                            <button onclick="toggleDropdown(event, '${project.object_id}')" class="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"></path>
                                </svg>
                            </button>
                            <div id="dropdown-${project.object_id}" class="dropdown-menu absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                                <button onclick="copyProjectLink('${projectUrl}')" class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                                    </svg>
                                    复制链接
                                </button>
                                ${canManage ? `
                                <button onclick="showUpdateModal('${project.object_id}', '${escapeHtml(project.name)}')" class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                                    </svg>
                                    更新原型
                                </button>
                                <button onclick="showEditModal('${project.object_id}', '${escapeHtml(project.name)}', ${project.is_public}, '${project.view_password || ''}', '${escapeHtml(project.remark || '')}')" class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                    </svg>
                                    修改信息
                                </button>
                                <button onclick="showToast('编辑标签功能即将上线', 'info')" class="w-full px-4 py-2 text-left text-sm text-gray-400 cursor-not-allowed flex items-center gap-2">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                                    </svg>
                                    编辑标签
                                </button>
                                <button onclick="showDeleteModal('${project.object_id}', '${escapeHtml(project.name)}')" class="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                    </svg>
                                    删除原型
                                </button>
                                ` : ''}
                                ${isAdmin ? `
                                <button onclick="showChangeAuthorModal('${project.object_id}', '${escapeHtml(project.name)}')" class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                                    </svg>
                                    更改作者
                                </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- 第二行：标签列表 + 最后更新时间 -->
                <div class="flex items-center justify-between mb-3">
                    <span class="text-xs text-gray-300">标签功能即将上线</span>
                    <span class="text-xs text-gray-400">${project.updated_at}</span>
                </div>
                
                <!-- 分割线 -->
                <div class="border-t border-gray-100 my-2"></div>
                
                <!-- 备注 -->
                <div class="text-sm">
                    ${hasRemark ? `
                        <div class="flex items-center gap-1">
                            <span class="text-gray-600 line-clamp-1 flex-1">${escapeHtml(shortRemark)}${needMore ? '...' : ''}</span>
                            ${needMore ? `<button onclick="showRemarkModal('${escapeHtml(project.remark)}')" class="text-orange-600 hover:text-orange-700 text-xs flex-shrink-0">更多</button>` : ''}
                        </div>
                    ` : '<span class="text-gray-400">无备注</span>'}
                </div>
            </div>
        `;
    }).join('');
}

// 显示备注详情弹窗
function showRemarkModal(remark) {
    document.getElementById('remarkContent').textContent = remark;
    document.getElementById('remarkModal').classList.remove('hidden');
}

function closeRemarkModal() {
    document.getElementById('remarkModal').classList.add('hidden');
}

// 渲染列表视图
function renderListView(projects) {
    const tbody = document.getElementById('listViewBody');
    if (projects.length === 0) {
        tbody.innerHTML = '<div class="px-6 py-12 text-center text-gray-400">暂无原型项目</div>';
        return;
    }
    
    tbody.innerHTML = projects.map(project => {
        const canManage = currentUser && (currentUser.role === 'admin' || project.author_id === currentUser.id);
        const isAdmin = currentUser && currentUser.role === 'admin';
        const projectUrl = `${window.location.origin}/projects/${project.object_id}/`;
        const hasRemark = project.remark && project.remark.trim();
        const shortRemark = hasRemark ? project.remark.replace(/\\n/g, ' ').substring(0, 20) : '';
        const needMore = hasRemark && project.remark.length > 20;
        
        return `
            <div class="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-gray-50 transition-colors">
                <div class="col-span-2">
                    <div class="font-medium text-gray-900 cursor-pointer hover:text-orange-600 truncate" onclick="viewProject('${project.object_id}')">${escapeHtml(project.name)}</div>
                </div>
                <div class="col-span-2 text-sm text-gray-500 truncate">${escapeHtml(project.author_name)}</div>
                <div class="col-span-1">
                    ${project.is_public ? 
                        '<span class="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">公开</span>' :
                        '<span class="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full">私密</span>'
                    }
                </div>
                <div class="col-span-2 text-sm text-gray-500">${project.updated_at}</div>
                <div class="col-span-3 text-sm">
                    ${hasRemark ? `
                        <div class="flex items-center gap-1">
                            <span class="text-gray-600 truncate flex-1">${escapeHtml(shortRemark)}${needMore ? '...' : ''}</span>
                            ${needMore ? `<button onclick="showRemarkModal('${escapeHtml(project.remark)}')" class="text-orange-600 hover:text-orange-700 text-xs flex-shrink-0">更多</button>` : ''}
                        </div>
                    ` : '<span class="text-gray-400">无备注</span>'}
                </div>
                <div class="col-span-2 text-right">
                    <div class="relative inline-block">
                        <button onclick="toggleDropdown(event, 'list-${project.object_id}')" class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path>
                            </svg>
                        </button>
                        <div id="dropdown-list-${project.object_id}" class="dropdown-menu absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                            <button onclick="copyProjectLink('${projectUrl}')" class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                                </svg>
                                复制链接
                            </button>
                            ${canManage ? `
                            <button onclick="showUpdateModal('${project.object_id}', '${escapeHtml(project.name)}')" class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                                </svg>
                                更新原型
                            </button>
                            <button onclick="showEditModal('${project.object_id}', '${escapeHtml(project.name)}', ${project.is_public}, '${project.view_password || ''}', '${escapeHtml(project.remark || '')}')" class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                </svg>
                                修改信息
                            </button>
                            <button onclick="showToast('编辑标签功能即将上线', 'info')" class="w-full px-4 py-2 text-left text-sm text-gray-400 cursor-not-allowed flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                                </svg>
                                编辑标签
                            </button>
                            <button onclick="showDeleteModal('${project.object_id}', '${escapeHtml(project.name)}')" class="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                </svg>
                                删除原型
                            </button>
                            ` : ''}
                            ${isAdmin ? `
                            <button onclick="showChangeAuthorModal('${project.object_id}', '${escapeHtml(project.name)}')" class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                                </svg>
                                更改作者
                            </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 切换视图
function switchView(view) {
    currentView = view;
    // 保存到 localStorage
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
        showToast('已切换为卡片视图', 'info');
    } else {
        listBtn?.classList.add('active');
        cardBtn?.classList.remove('active');
        listView.classList.remove('hidden');
        cardView.classList.add('hidden');
        renderListView(projectsData);
        showToast('已切换为列表视图', 'info');
    }
}

// 切换项目卡片下拉菜单
function toggleDropdown(event, projectId) {
    event.stopPropagation();
    
    // 关闭自定义下拉菜单
    document.querySelectorAll('.custom-dropdown .dropdown-menu').forEach(menu => {
        menu.classList.add('hidden');
    });
    document.querySelectorAll('.custom-dropdown .dropdown-arrow').forEach(arrow => {
        arrow.classList.remove('rotate-180');
    });
    
    // 关闭之前打开的项目下拉菜单
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

// 点击其他地方关闭项目卡片下拉菜单（不干扰自定义下拉菜单）
document.addEventListener('click', (e) => {
    // 如果点击的是自定义下拉菜单内部，不处理
    if (e.target.closest('.custom-dropdown')) {
        return;
    }
    
    if (activeDropdown) {
        const dropdown = document.getElementById(activeDropdown);
        if (dropdown) dropdown.classList.remove('show');
        activeDropdown = null;
    }
});

// 设置文件上传拖拽
function setupFileUpload() {
    const zone = document.getElementById('uploadZone');
    const input = document.getElementById('projectFile');
    
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });
    
    zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
    });
    
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
        if (e.target.files.length > 0) {
            updateFileDisplay(e.target.files[0], 'upload');
        }
    });
}

function setupUpdateFileUpload() {
    const zone = document.getElementById('updateUploadZone');
    const input = document.getElementById('updateProjectFile');
    
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });
    
    zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
    });
    
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
        if (e.target.files.length > 0) {
            updateFileDisplay(e.target.files[0], 'update');
        }
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

// 显示上传弹窗
function showUploadModal() {
    document.getElementById('uploadModal').classList.remove('hidden');
}

function closeUploadModal() {
    document.getElementById('uploadModal').classList.add('hidden');
    document.getElementById('uploadForm').reset();
    resetFileDisplay('upload');
}

function resetFileDisplay(type) {
    const zone = document.getElementById(type === 'upload' ? 'uploadZone' : 'updateUploadZone');
    const placeholder = document.getElementById(type === 'upload' ? 'uploadPlaceholder' : 'updateUploadPlaceholder');
    const fileInfo = document.getElementById(type === 'upload' ? 'uploadFileInfo' : 'updateUploadFileInfo');
    
    zone.classList.remove('has-file');
    placeholder.classList.remove('hidden');
    fileInfo.classList.add('hidden');
}

// 显示更新原型弹窗
function showUpdateModal(objectId, projectName) {
    document.getElementById('updateProjectId').value = objectId;
    document.getElementById('updateProjectName').value = projectName;
    document.getElementById('updateModal').classList.remove('hidden');
}

function closeUpdateModal() {
    document.getElementById('updateModal').classList.add('hidden');
    document.getElementById('updateForm').reset();
    resetFileDisplay('update');
}

// 显示编辑弹窗
function showEditModal(objectId, projectName, isPublic, viewPassword, remark) {
    document.getElementById('editProjectId').value = objectId;
    document.getElementById('editProjectName').value = projectName;
    // 密码访问：非公开即使用密码
    const usePassword = !isPublic;
    document.getElementById('editUsePassword').checked = usePassword;
    document.getElementById('editViewPassword').value = viewPassword || '';
    document.getElementById('editRemark').value = remark || '';
    
    if (usePassword) {
        document.getElementById('editPasswordSection').classList.remove('hidden');
    } else {
        document.getElementById('editPasswordSection').classList.add('hidden');
    }
    
    document.getElementById('editModal').classList.remove('hidden');
}

function closeEditModal() {
    document.getElementById('editModal').classList.add('hidden');
    document.getElementById('editForm').reset();
}

// 显示删除确认弹窗
function showDeleteModal(objectId, projectName) {
    document.getElementById('deleteProjectId').value = objectId;
    document.getElementById('deleteProjectName').textContent = projectName;
    document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteModal() {
    document.getElementById('deleteModal').classList.add('hidden');
}

// 显示更改作者弹窗
async function showChangeAuthorModal(objectId, projectName) {
    document.getElementById('changeAuthorProjectId').value = objectId;
    document.getElementById('changeAuthorProjectName').value = projectName;
    
    // 加载用户列表
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

// 选择新作者选项
function selectNewAuthorOption(value, label) {
    selectDropdownOption('newAuthorSelect', value, label);
}

function closeChangeAuthorModal() {
    document.getElementById('changeAuthorModal').classList.add('hidden');
    document.getElementById('changeAuthorForm').reset();
    setDropdownValue('newAuthorSelect', '');
}

// 生成随机密码（6位数字+字母）
function generatePassword() {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let password = '';
    for (let i = 0; i < 6; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById('viewPassword').value = password;
}

function generateEditPassword() {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let password = '';
    for (let i = 0; i < 6; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById('editViewPassword').value = password;
}

// 复制项目链接
function copyProjectLink(url) {
    navigator.clipboard.writeText(url).then(() => {
        showToast('链接已复制到剪贴板', 'success');
    }).catch(() => {
        showToast('复制失败', 'error');
    });
}

// 查看项目
function viewProject(objectId) {
    window.open(`/projects/${objectId}/`, '_blank');
}

// 事件监听 - 密码访问
document.getElementById('usePassword').addEventListener('change', (e) => {
    document.getElementById('passwordSection').classList.toggle('hidden', !e.target.checked);
});

document.getElementById('editUsePassword').addEventListener('change', (e) => {
    document.getElementById('editPasswordSection').classList.toggle('hidden', !e.target.checked);
});

// 上传表单提交
document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const usePassword = document.getElementById('usePassword').checked;
    const formData = new FormData();
    formData.append('file', document.getElementById('projectFile').files[0]);
    formData.append('name', document.getElementById('projectName').value);
    formData.append('is_public', !usePassword); // 使用密码则不公开
    formData.append('remark', document.getElementById('remark').value);
    
    if (usePassword) {
        formData.append('view_password', document.getElementById('viewPassword').value);
    }
    
    try {
        const response = await fetch('/api/projects/upload', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            closeUploadModal();
            loadProjects();
            showToast('上传成功', 'success');
        } else {
            const data = await response.json();
            showToast(data.detail || '上传失败', 'error');
        }
    } catch (error) {
        showToast('网络错误', 'error');
    }
});

// 更新原型表单提交
document.getElementById('updateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const objectId = document.getElementById('updateProjectId').value;
    const formData = new FormData();
    formData.append('file', document.getElementById('updateProjectFile').files[0]);
    
    try {
        const response = await fetch(`/api/projects/${objectId}/update-file`, {
            method: 'POST',
            body: formData
        });
        
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
    }
});

// 修改信息表单提交
document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const objectId = document.getElementById('editProjectId').value;
    const usePassword = document.getElementById('editUsePassword').checked;
    const data = {
        name: document.getElementById('editProjectName').value,
        is_public: !usePassword, // 使用密码则不公开
        remark: document.getElementById('editRemark').value
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

// 确认删除
async function confirmDelete() {
    const objectId = document.getElementById('deleteProjectId').value;
    
    try {
        const response = await fetch(`/api/projects/${objectId}`, {
            method: 'DELETE'
        });
        
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

// 更改作者表单提交
document.getElementById('changeAuthorForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const objectId = document.getElementById('changeAuthorProjectId').value;
    const newAuthorId = document.getElementById('newAuthorSelect').value;
    
    try {
        const response = await fetch(`/api/projects/${objectId}/change-author`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_author_id: parseInt(newAuthorId) })
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

// 初始化
setupFileUpload();
setupUpdateFileUpload();
loadProjects();
