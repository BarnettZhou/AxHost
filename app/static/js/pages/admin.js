// 分页相关
let currentPage = 1;
let perPage = parseInt(localStorage.getItem('adminPerPage')) || 12;

// 缓存当前页面用户数据
let currentUsers = [];

// 角色和状态的选项映射
const roleMap = {
    'admin': '管理员',
    'product_manager': '产品经理',
    'developer': '技术开发'
};

const statusMap = {
    'active': '正常',
    'inactive': '停用'
};

// 检查管理员权限
async function checkAdmin() {
    try {
        const response = await fetch('/api/auth/me');
        if (!response.ok) {
            window.location.href = '/login';
            return;
        }
        const user = await response.json();
        if (user.role !== 'admin') {
            window.location.href = '/';
            return;
        }
        loadUsers();
    } catch (error) {
        window.location.href = '/login';
    }
}

// 加载用户列表
async function loadUsers(page = 1) {
    currentPage = page;
    const search = document.getElementById('searchInput').value;
    const status = document.getElementById('statusFilter')?.value || '';
    const role = document.getElementById('roleFilter')?.value || '';
    
    try {
        // 构建查询参数
        let url = `/api/users?page=${page}&per_page=${perPage}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (status) url += `&status=${status}`;
        if (role) url += `&role=${role}`;
        
        const response = await fetch(url);
        const data = await response.json();
        currentUsers = data.items;
        const users = currentUsers;
        const totalPages = Math.ceil(data.total / perPage);
        
        // 渲染列表
        const listEl = document.getElementById('userList');
        listEl.innerHTML = users.map(user => `
            <div class="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-gray-50 transition-colors">
                <div class="col-span-2 text-sm font-medium text-gray-900 whitespace-nowrap">${escapeHtml(user.name)}</div>
                <div class="col-span-2 text-sm text-gray-500 whitespace-nowrap">${user.employee_id}</div>
                <div class="col-span-2 text-sm text-gray-500 whitespace-nowrap">
                    ${roleMap[user.role] || user.role}
                </div>
                <div class="col-span-2 whitespace-nowrap">
                    <span class="px-2 py-1 text-xs rounded-full ${user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                        ${statusMap[user.status] || user.status}
                    </span>
                </div>
                <div class="col-span-2 text-sm text-gray-500 whitespace-nowrap">
                    ${user.created_at}
                </div>
                <div class="col-span-2 text-right text-sm font-medium whitespace-nowrap">
                    <button onclick="editUser(${user.id})" class="text-orange-600 hover:text-orange-800">编辑</button>
                </div>
            </div>
        `).join('');
        
        // 渲染分页
        renderPagination(data.total, totalPages, page);
        
    } catch (error) {
        console.error('加载失败:', error);
        showToast('加载失败', 'error');
    }
}

// 筛选下拉菜单选择回调
function selectStatusOption(value, label) {
    selectDropdownOption('statusFilter', value, label);
    loadUsers(1);
}

function selectRoleOption(value, label) {
    selectDropdownOption('roleFilter', value, label);
    loadUsers(1);
}

// 用户表单下拉菜单选择回调
function selectUserRoleOption(value, label) {
    selectDropdownOption('userRole', value, label);
}

function selectUserStatusOption(value, label) {
    selectDropdownOption('userStatus', value, label);
}

function showAddModal() {
    document.getElementById('modalTitle').textContent = '添加用户';
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = '';
    document.getElementById('userPassword').required = true;
    
    // 重置下拉菜单到默认值
    setDropdownValue('userRole', 'admin', false);
    setDropdownValue('userStatus', 'active', false);
    
    document.getElementById('userModal').classList.remove('hidden');
}

async function editUser(id) {
    const user = currentUsers.find(u => u.id === id);
    if (!user) {
        // 如果缓存中没有，从后端获取
        try {
            const response = await fetch(`/api/users/${id}`);
            if (!response.ok) throw new Error('获取用户失败');
            const userData = await response.json();
            fillEditForm(userData);
        } catch (error) {
            console.error('加载用户失败:', error);
            showToast('加载用户失败', 'error');
        }
        return;
    }
    
    fillEditForm(user);
}

function fillEditForm(user) {
    document.getElementById('modalTitle').textContent = '编辑用户';
    document.getElementById('userId').value = user.id;
    document.getElementById('userName').value = user.name;
    document.getElementById('userEmployeeId').value = user.employee_id;
    document.getElementById('userPassword').required = false;
    document.getElementById('userPassword').value = '';
    
    // 设置下拉菜单值
    setDropdownValue('userRole', user.role, false);
    setDropdownValue('userStatus', user.status, false);
    
    document.getElementById('userModal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('userModal').classList.add('hidden');
}

document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const userId = document.getElementById('userId').value;
    const data = {
        name: document.getElementById('userName').value,
        employee_id: document.getElementById('userEmployeeId').value,
        role: document.getElementById('userRole').value,
        status: document.getElementById('userStatus').value
    };
    
    const password = document.getElementById('userPassword').value;
    if (password) {
        data.password = password;
    }
    
    try {
        const url = userId ? `/api/users/${userId}` : '/api/users';
        const method = userId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            closeModal();
            loadUsers();
            showToast(userId ? '用户更新成功' : '用户添加成功', 'success');
        } else {
            const res = await response.json();
            showToast(res.detail || '操作失败', 'error');
        }
    } catch (error) {
        showToast('网络错误', 'error');
    }
});

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
            <button onclick="loadUsers(${currentPageNum - 1})" 
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
            
            <button onclick="loadUsers(${currentPageNum + 1})" 
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
                loadUsers(page);
            } else {
                showToast(`请输入1-${totalPages}之间的页码`, 'error');
            }
        } else if (e.key === 'Escape') {
            const pageEl = document.getElementById('pagination');
            renderPagination(pageEl?.dataset.total || 0, parseInt(pageEl?.dataset.totalPages || 1, 10), currentPageNum);
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
    localStorage.setItem('adminPerPage', perPage);
    loadUsers(1);
}

// 覆盖初始化函数，使用管理员检查
checkAdmin();
