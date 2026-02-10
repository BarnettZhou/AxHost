// 分页相关
let currentPage = 1;
const perPage = 20;

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
        const pageEl = document.getElementById('pagination');
        let pageHtml = '';
        for (let i = 1; i <= totalPages; i++) {
            pageHtml += `<button onclick="loadUsers(${i})" class="px-3 py-1 rounded ${i === page ? 'bg-orange-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}">${i}</button>`;
        }
        pageEl.innerHTML = pageHtml;
        
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

// 覆盖初始化函数，使用管理员检查
checkAdmin();
