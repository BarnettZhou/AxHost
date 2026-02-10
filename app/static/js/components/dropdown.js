// 自定义下拉菜单组件 JS
(function() {
    'use strict';
    
    // 存储所有下拉菜单的回调函数
    const dropdownCallbacks = {};
    
    // 切换下拉菜单显示/隐藏
    window.toggleDropdownMenu = function(dropdownId) {
        const container = document.getElementById(`${dropdownId}_container`);
        if (!container) {
            console.error('Dropdown container not found:', dropdownId);
            return;
        }
        
        const menu = container.querySelector('.dropdown-menu');
        const arrow = container.querySelector('.dropdown-arrow');
        
        if (!menu || !arrow) {
            console.error('Dropdown menu or arrow not found:', dropdownId);
            return;
        }
        
        const isHidden = menu.classList.contains('hidden');
        
        // 先关闭所有其他自定义下拉菜单
        document.querySelectorAll('.custom-dropdown .dropdown-menu').forEach(m => {
            if (m !== menu) {
                m.classList.add('hidden');
                const otherArrow = m.closest('.custom-dropdown')?.querySelector('.dropdown-arrow');
                if (otherArrow) otherArrow.classList.remove('rotate-180');
            }
        });
        
        // 切换当前菜单
        if (isHidden) {
            menu.classList.remove('hidden');
            arrow.classList.add('rotate-180');
        } else {
            menu.classList.add('hidden');
            arrow.classList.remove('rotate-180');
        }
    };
    
    // 选择选项
    window.selectDropdownOption = function(dropdownId, value, label) {
        const container = document.getElementById(`${dropdownId}_container`);
        if (!container) return;
        
        const hiddenInput = document.getElementById(dropdownId);
        const textSpan = container.querySelector('.dropdown-text');
        const menu = container.querySelector('.dropdown-menu');
        const arrow = container.querySelector('.dropdown-arrow');
        
        // 更新值
        if (hiddenInput) hiddenInput.value = value;
        if (textSpan) {
            textSpan.textContent = label;
            textSpan.classList.remove('text-gray-400');
            textSpan.classList.add('text-gray-700');
        }
        
        // 关闭菜单
        if (menu) menu.classList.add('hidden');
        if (arrow) arrow.classList.remove('rotate-180');
        
        // 更新选中样式
        if (menu) {
            menu.querySelectorAll('.dropdown-option').forEach(opt => {
                opt.classList.remove('bg-orange-50', 'text-orange-700');
                if (opt.dataset.value === String(value)) {
                    opt.classList.add('bg-orange-50', 'text-orange-700');
                }
            });
        }
        
        // 触发回调
        if (dropdownCallbacks[dropdownId]) {
            dropdownCallbacks[dropdownId](value, label);
        }
    };
    
    // 初始化下拉菜单
    window.initDropdown = function(dropdownId, onChangeCallback) {
        if (onChangeCallback) {
            dropdownCallbacks[dropdownId] = onChangeCallback;
        }
        
        // 设置初始值显示
        const container = document.getElementById(`${dropdownId}_container`);
        if (!container) return;
        
        const hiddenInput = document.getElementById(dropdownId);
        const textSpan = container.querySelector('.dropdown-text');
        const initialValue = hiddenInput?.value;
        
        if (initialValue !== undefined && textSpan) {
            const option = container.querySelector(`.dropdown-option[data-value="${initialValue}"]`);
            if (option) {
                textSpan.textContent = option.textContent.trim();
                textSpan.classList.remove('text-gray-400');
                textSpan.classList.add('text-gray-700');
                option.classList.add('bg-orange-50', 'text-orange-700');
            }
        }
    };
    
    // 设置下拉菜单值（用于 JS 动态设置）
    window.setDropdownValue = function(dropdownId, value, triggerCallback = false) {
        const container = document.getElementById(`${dropdownId}_container`);
        if (!container) return;
        
        const option = container.querySelector(`.dropdown-option[data-value="${value}"]`);
        if (option) {
            const label = option.textContent.trim();
            selectDropdownOption(dropdownId, value, label);
            
            // 如果需要触发回调
            if (triggerCallback && dropdownCallbacks[dropdownId]) {
                dropdownCallbacks[dropdownId](value, label);
            }
        }
    };
    
    // 点击外部关闭下拉菜单 - 使用捕获阶段确保优先执行
    document.addEventListener('click', function(e) {
        const customDropdown = e.target.closest('.custom-dropdown');
        if (!customDropdown) {
            // 点击了外部，关闭所有自定义下拉菜单
            document.querySelectorAll('.custom-dropdown .dropdown-menu').forEach(menu => {
                menu.classList.add('hidden');
            });
            document.querySelectorAll('.custom-dropdown .dropdown-arrow').forEach(arrow => {
                arrow.classList.remove('rotate-180');
            });
        }
    }, true); // 使用捕获阶段
})();
