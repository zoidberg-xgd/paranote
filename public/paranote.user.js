// ==UserScript==
// @name         ParaNote - 段落评论
// @namespace    https://paranote.app
// @version      1.0.0
// @description  为任意网页添加段落级评论功能，点击段落即可评论
// @author       ParaNote
// @match        *://*/*
// @exclude      *://localhost/*
// @exclude      *://127.0.0.1/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      localhost
// @connect      *
// @run-at       document-idle
// @icon         data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📝</text></svg>
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 配置 ====================
    
    // ParaNote 服务器地址 (修改为你的服务器地址)
    const DEFAULT_API_BASE = 'http://localhost:4000';
    
    // 获取用户配置
    const getConfig = () => ({
        apiBase: GM_getValue('paranote_api_base', DEFAULT_API_BASE),
        siteId: GM_getValue('paranote_site_id', 'userscript'),
        enabled: GM_getValue('paranote_enabled', false),
        autoEnable: GM_getValue('paranote_auto_enable', []), // 自动启用的域名列表
        selector: GM_getValue('paranote_selector', ''), // 自定义内容选择器
    });

    let config = getConfig();
    let isActive = false;

    // ==================== 菜单命令 ====================

    GM_registerMenuCommand('⚙️ 设置 ParaNote 服务器', () => {
        const newUrl = prompt('请输入 ParaNote 服务器地址:', config.apiBase);
        if (newUrl !== null) {
            GM_setValue('paranote_api_base', newUrl.replace(/\/$/, ''));
            config = getConfig();
            alert('服务器地址已更新！请刷新页面。');
        }
    });

    GM_registerMenuCommand('🏷️ 设置站点 ID', () => {
        const newId = prompt('请输入站点 ID (用于区分不同网站的评论):', config.siteId);
        if (newId !== null) {
            GM_setValue('paranote_site_id', newId);
            config = getConfig();
            alert('站点 ID 已更新！');
        }
    });

    GM_registerMenuCommand('📝 启用/禁用 ParaNote', toggleParaNote);

    GM_registerMenuCommand('⭐ 将此网站加入自动启用列表', () => {
        const domain = window.location.hostname;
        const autoList = config.autoEnable;
        if (!autoList.includes(domain)) {
            autoList.push(domain);
            GM_setValue('paranote_auto_enable', autoList);
            config = getConfig();
            alert(`已将 ${domain} 加入自动启用列表！`);
        } else {
            const idx = autoList.indexOf(domain);
            autoList.splice(idx, 1);
            GM_setValue('paranote_auto_enable', autoList);
            config = getConfig();
            alert(`已将 ${domain} 从自动启用列表移除。`);
        }
    });

    GM_registerMenuCommand('🎯 设置内容选择器', () => {
        const selector = prompt(
            '请输入内容区域的 CSS 选择器 (留空则自动检测):\n' +
            '例如: article, .post-content, #main-content',
            config.selector
        );
        if (selector !== null) {
            GM_setValue('paranote_selector', selector);
            config = getConfig();
            alert('选择器已更新！请刷新页面。');
        }
    });

    // ==================== 核心功能 ====================

    function toggleParaNote() {
        if (isActive) {
            disableParaNote();
        } else {
            enableParaNote();
        }
    }

    async function enableParaNote() {
        if (isActive) return;
        
        console.log('[ParaNote] Enabling...');
        
        // 等待动态内容加载（最多等待3秒）
        let containers = findAllContentContainers();
        if (containers.length === 0) {
            console.log('[ParaNote] No content found, waiting for dynamic content...');
            for (let i = 0; i < 6; i++) {
                await new Promise(r => setTimeout(r, 500));
                containers = findAllContentContainers();
                if (containers.length > 0) break;
            }
        }
        
        if (containers.length === 0) {
            alert('ParaNote: 未找到文章内容区域。\n请尝试设置自定义选择器。');
            return;
        }

        console.log(`[ParaNote] Found ${containers.length} content containers`);

        // 为每个容器设置 data 属性
        const workId = generateWorkId(window.location.href);
        
        containers.forEach((container, index) => {
            const paragraphs = container.querySelectorAll('p');
            if (paragraphs.length === 0) return;
            
            // 每个回答用不同的 chapterId
            const chapterId = containers.length > 1 
                ? `answer-${index}` 
                : generateChapterId(window.location.pathname);

            container.setAttribute('data-na-root', '');
            container.setAttribute('data-site-id', config.siteId);
            container.setAttribute('data-work-id', workId);
            container.setAttribute('data-chapter-id', chapterId);
            
            console.log(`[ParaNote] Container ${index}: ${paragraphs.length} paragraphs, chapterId: ${chapterId}`);
        });

        // 加载 embed.js (使用 GM_xmlhttpRequest 绕过 CSP)
        loadEmbedScript(config.apiBase, config.siteId);

        // 添加浮动按钮
        addFloatingButton();

        isActive = true;
        showToast(`✅ ParaNote 已启用 (${containers.length} 个区域)`);
    }

    function disableParaNote() {
        if (!isActive) return;

        console.log('[ParaNote] Disabling...');

        // 移除脚本
        const script = document.getElementById('paranote-embed-script');
        if (script) script.remove();

        // 移除 UI 元素
        document.querySelectorAll('.na-sidebar, .na-overlay, .na-comment-count, #paranote-fab').forEach(el => el.remove());

        // 移除 data 属性
        const container = document.querySelector('[data-na-root]');
        if (container) {
            container.removeAttribute('data-na-root');
            container.removeAttribute('data-paranote-initialized');
        }

        // 恢复段落样式
        document.querySelectorAll('p[data-na-index]').forEach(p => {
            p.style.cursor = '';
            p.style.textDecoration = '';
            p.style.background = '';
            p.removeAttribute('data-na-index');
        });

        isActive = false;
        showToast('❌ ParaNote 已禁用');
    }

    // ==================== 脚本加载 (绕过 CSP) ====================

    function loadEmbedScript(apiBase, siteId) {
        console.log('[ParaNote] Loading embed.js via GM_xmlhttpRequest...');

        // 使用 unsafeWindow 注入到页面上下文（绑过沙箱隔离）
        const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        
        // 先设置全局配置
        pageWindow.__paranoteConfig = {
            siteId: siteId,
            apiBase: apiBase
        };
        
        // 注入请求函数，绑过 CSP 限制
        pageWindow.__paranoteRequest = function(url, options = {}) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: options.method || 'GET',
                    url: url,
                    headers: options.headers || {},
                    data: options.body,
                    onload: function(response) {
                        try {
                            resolve(JSON.parse(response.responseText));
                        } catch (e) {
                            resolve({ error: 'parse_error', raw: response.responseText });
                        }
                    },
                    onerror: function(e) {
                        reject(e);
                    }
                });
            });
        };
        
        console.log('[ParaNote] Injected __paranoteRequest to page context');

        // 直接初始化评论功能（不依赖外部脚本）
        initParaNoteEmbed(apiBase, siteId);
    }
    
    // ==================== 内置评论功能 ====================
    
    function initParaNoteEmbed(apiBase, siteId) {
        const roots = document.querySelectorAll('[data-na-root]');
        if (!roots.length) {
            console.error('[ParaNote] No root element found');
            return;
        }
        
        console.log(`[ParaNote] Found ${roots.length} containers`);
        
        // 全局状态
        let currentContext = null; // { workId, chapterId, paraIndex }
        let allContainerData = {}; // { chapterId: { allCommentsData } }
        
        // 创建全局侧边栏
        const sidebar = document.createElement('div');
        sidebar.className = 'na-sidebar';
        sidebar.style.cssText = 'position:fixed;top:0;right:-350px;width:350px;height:100vh;background:#fff;box-shadow:-2px 0 10px rgba(0,0,0,0.1);z-index:99999;transition:right 0.3s;display:flex;flex-direction:column;';
        sidebar.innerHTML = `
            <div style="padding:15px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:600;">评论 <span id="na-count"></span></span>
                <button id="na-close" style="border:none;background:none;font-size:20px;cursor:pointer;">×</button>
            </div>
            <div id="na-list" style="flex:1;overflow-y:auto;padding:10px;"></div>
            <div style="padding:10px;border-top:1px solid #eee;">
                <textarea id="na-input" placeholder="写下你的评论..." style="width:100%;height:60px;border:1px solid #ddd;border-radius:4px;padding:8px;resize:none;box-sizing:border-box;user-select:text;-webkit-user-select:text;"></textarea>
                <button id="na-submit" style="margin-top:8px;width:100%;padding:8px;background:#bd1c2b;color:#fff;border:none;border-radius:4px;cursor:pointer;">发布</button>
            </div>
        `;
        document.body.appendChild(sidebar);
        
        const listEl = sidebar.querySelector('#na-list');
        const countEl = sidebar.querySelector('#na-count');
        const inputEl = sidebar.querySelector('#na-input');
        const submitBtn = sidebar.querySelector('#na-submit');
        const closeBtn = sidebar.querySelector('#na-close');
        
        closeBtn.onclick = () => { sidebar.style.right = '-350px'; currentContext = null; };
        
        // API 请求函数
        function apiRequest(url, options = {}) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: options.method || 'GET',
                    url: url,
                    headers: options.headers || { 'Content-Type': 'application/json' },
                    data: options.body,
                    onload: function(response) {
                        try {
                            resolve(JSON.parse(response.responseText));
                        } catch (e) {
                            resolve({ error: 'parse_error' });
                        }
                    },
                    onerror: reject
                });
            });
        }
        
        // 加载指定容器的评论
        async function loadContainerComments(workId, chapterId) {
            const url = `${apiBase}/api/v1/comments?siteId=${encodeURIComponent(siteId)}&workId=${encodeURIComponent(workId)}&chapterId=${encodeURIComponent(chapterId)}`;
            const data = await apiRequest(url);
            allContainerData[chapterId] = data.commentsByPara || {};
            return allContainerData[chapterId];
        }
        
        // 更新指定容器的徽章
        function updateContainerBadges(root, chapterId) {
            const paras = root.querySelectorAll('p');
            const commentsData = allContainerData[chapterId] || {};
            paras.forEach((p, idx) => {
                const count = (commentsData[String(idx)] || []).length;
                let badge = p.querySelector('.na-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'na-badge';
                    p.appendChild(badge);
                }
                
                // 气泡样式：有评论红色，无评论灰色
                const hasComments = count > 0;
                badge.style.cssText = `
                    display: inline-block !important;
                    margin-left: 6px !important;
                    padding: 2px 8px !important;
                    font-size: 12px !important;
                    color: #fff !important;
                    background: ${hasComments ? '#bd1c2b' : '#ccc'} !important;
                    border-radius: 10px !important;
                    cursor: pointer !important;
                    font-weight: 600 !important;
                    line-height: 1.2 !important;
                    vertical-align: middle !important;
                    text-decoration: none !important;
                    border: none !important;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.15) !important;
                    transition: background 0.2s !important;
                `.replace(/\s+/g, ' ');
                badge.textContent = count;
                badge.onmouseenter = () => badge.style.background = '#bd1c2b';
                badge.onmouseleave = () => badge.style.background = hasComments ? '#bd1c2b' : '#ccc';
            });
        }
        
        // 显示评论
        function showComments(workId, chapterId, paraIndex) {
            currentContext = { workId, chapterId, paraIndex };
            sidebar.style.right = '0';
            
            const commentsData = allContainerData[chapterId] || {};
            const comments = commentsData[String(paraIndex)] || [];
            countEl.textContent = comments.length > 0 ? `(${comments.length})` : '';
            
            listEl.innerHTML = '';
            
            if (comments.length === 0) {
                listEl.innerHTML = '<div style="text-align:center;color:#999;padding:40px;">💬<br>暂无评论</div>';
                return;
            }
            
            comments.forEach(c => {
                listEl.appendChild(createCommentCard(c, workId, chapterId));
            });
        }
        
        // 初始化每个容器
        roots.forEach(async (root, rootIndex) => {
            const workId = root.dataset.workId || 'default-work';
            const chapterId = root.dataset.chapterId || 'default-chapter';
            const paras = root.querySelectorAll('p');
            
            if (!paras.length) return;
            
            console.log(`[ParaNote] Container ${rootIndex}: ${paras.length} paragraphs, chapterId: ${chapterId}`);
            
            // 加载评论并更新徽章
            await loadContainerComments(workId, chapterId);
            updateContainerBadges(root, chapterId);
            
            // 段落点击事件
            paras.forEach((p, idx) => {
                p.style.cursor = 'pointer';
                p.onclick = (e) => {
                    if (e.target.tagName === 'A') return;
                    // 点击同一段落时切换侧边栏
                    const isOpen = sidebar.style.right === '0' || sidebar.style.right === '0px';
                    if (currentContext && 
                        currentContext.chapterId === chapterId && 
                        currentContext.paraIndex === idx &&
                        isOpen) {
                        // 关闭侧边栏
                        sidebar.style.right = '-350px';
                        currentContext = null;
                    } else {
                        showComments(workId, chapterId, idx);
                    }
                };
            });
        });
        
        // 发布评论
        submitBtn.onclick = async () => {
            if (!currentContext) return;
            const content = inputEl.value.trim();
            if (!content) return;
            
            const { workId, chapterId, paraIndex } = currentContext;
            
            submitBtn.textContent = '发送中...';
            submitBtn.disabled = true;
            
            try {
                await apiRequest(apiBase + '/api/v1/comments', {
                    method: 'POST',
                    body: JSON.stringify({
                        siteId, workId, chapterId,
                        paraIndex,
                        content
                    })
                });
                inputEl.value = '';
                await loadContainerComments(workId, chapterId);
                const root = document.querySelector(`[data-chapter-id="${chapterId}"]`);
                if (root) updateContainerBadges(root, chapterId);
                showComments(workId, chapterId, paraIndex);
                showToast('✅ 发布成功');
            } catch (e) {
                console.error(e);
                showToast('❌ 发布失败');
            } finally {
                submitBtn.textContent = '发布';
                submitBtn.disabled = false;
            }
        };
        
        console.log('[ParaNote] Embed initialized');
        
        // 生成头像颜色
        function getAvatarColor(name) {
            let hash = 0;
            for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
            const hue = Math.abs(hash) % 360;
            return { bg: `hsl(${hue}, 60%, 85%)`, text: `hsl(${hue}, 60%, 30%)` };
        }
        
        // 创建评论卡片
        function createCommentCard(c, workId, chapterId, isReply = false) {
            const card = document.createElement('div');
            card.style.cssText = isReply 
                ? 'padding:8px 0;border-bottom:1px solid #f0f0f0;'
                : 'padding:12px;margin-bottom:8px;background:#f9f9f9;border-radius:6px;';
            
            const name = c.userName || '匿名';
            const colors = getAvatarColor(name);
            const firstChar = name.charAt(0).toUpperCase();
            const date = c.createdAt ? new Date(c.createdAt).toLocaleString('zh-CN', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
            
            // 头部：头像 + 用户名 + 时间
            const header = document.createElement('div');
            header.style.cssText = 'display:flex;align-items:center;margin-bottom:6px;';
            header.innerHTML = `
                <div style="width:${isReply?'24px':'32px'};height:${isReply?'24px':'32px'};border-radius:50%;background:${colors.bg};color:${colors.text};display:flex;align-items:center;justify-content:center;font-weight:600;font-size:${isReply?'10px':'12px'};margin-right:8px;flex-shrink:0;">${firstChar}</div>
                <div style="flex:1;">
                    <span style="font-weight:600;font-size:${isReply?'12px':'13px'};">${name}</span>
                    <span style="margin-left:8px;font-size:${isReply?'10px':'11px'};color:#999;">${date}</span>
                </div>
            `;
            
            // 内容（长评论折叠）
            const contentEl = document.createElement('div');
            contentEl.style.cssText = `font-size:${isReply?'13px':'14px'};color:#333;line-height:1.5;padding-left:${isReply?'32px':'40px'};`;
            
            const MAX_LENGTH = 150; // 超过150字符折叠
            const content = c.content || '';
            
            if (content.length > MAX_LENGTH) {
                const shortText = content.slice(0, MAX_LENGTH) + '...';
                contentEl.textContent = shortText;
                contentEl.dataset.full = content;
                contentEl.dataset.short = shortText;
                contentEl.dataset.expanded = 'false';
                
                const expandBtn = document.createElement('span');
                expandBtn.textContent = ' 展开';
                expandBtn.style.cssText = 'color:#bd1c2b;cursor:pointer;font-size:12px;margin-left:4px;';
                expandBtn.onclick = (e) => {
                    e.stopPropagation();
                    const isExpanded = contentEl.dataset.expanded === 'true';
                    if (isExpanded) {
                        contentEl.childNodes[0].textContent = contentEl.dataset.short;
                        expandBtn.textContent = ' 展开';
                        contentEl.dataset.expanded = 'false';
                    } else {
                        contentEl.childNodes[0].textContent = contentEl.dataset.full;
                        expandBtn.textContent = ' 收起';
                        contentEl.dataset.expanded = 'true';
                    }
                };
                contentEl.appendChild(document.createTextNode(shortText));
                contentEl.innerHTML = ''; // 清空
                contentEl.appendChild(document.createTextNode(shortText));
                contentEl.appendChild(expandBtn);
            } else {
                contentEl.textContent = content;
            }
            
            card.appendChild(header);
            card.appendChild(contentEl);
            
            // 操作栏（非回复才显示）
            if (!isReply) {
                const actions = document.createElement('div');
                actions.style.cssText = 'display:flex;align-items:center;gap:12px;margin-top:8px;padding-left:40px;';
                
                // 回复按钮
                const replyBtn = document.createElement('button');
                replyBtn.innerHTML = '💬 回复';
                replyBtn.style.cssText = 'border:none;background:none;color:#666;font-size:12px;cursor:pointer;padding:2px 6px;';
                replyBtn.onmouseenter = () => replyBtn.style.color = '#bd1c2b';
                replyBtn.onmouseleave = () => replyBtn.style.color = '#666';
                replyBtn.onclick = () => showReplyInput(card, c, workId, chapterId);
                
                // 点赞按钮
                const likeBtn = document.createElement('button');
                likeBtn.innerHTML = `❤️ ${c.likes || ''}`;
                likeBtn.style.cssText = 'border:none;background:none;color:#666;font-size:12px;cursor:pointer;padding:2px 6px;';
                likeBtn.onmouseenter = () => likeBtn.style.color = '#bd1c2b';
                likeBtn.onmouseleave = () => likeBtn.style.color = '#666';
                likeBtn.onclick = async () => {
                    try {
                        const result = await apiRequest(apiBase + '/api/v1/comments/like', {
                            method: 'POST',
                            body: JSON.stringify({ siteId, workId, chapterId, commentId: c.id })
                        });
                        if (result.error === 'already_liked') {
                            showToast('您已经点过赞了');
                        } else if (result.likes !== undefined) {
                            likeBtn.innerHTML = `❤️ ${result.likes}`;
                            likeBtn.style.color = '#bd1c2b';
                            showToast('👍 点赞成功');
                        }
                    } catch (e) {
                        console.error(e);
                    }
                };
                
                actions.appendChild(replyBtn);
                actions.appendChild(likeBtn);
                card.appendChild(actions);
            }
            
            // 显示回复（超过3条折叠）
            if (c.replies && c.replies.length > 0) {
                const repliesContainer = document.createElement('div');
                repliesContainer.style.cssText = 'margin-top:10px;padding-left:40px;border-left:2px solid #eee;margin-left:16px;';
                
                const MAX_VISIBLE_REPLIES = 2; // 默认显示2条回复
                const replies = c.replies;
                
                if (replies.length > MAX_VISIBLE_REPLIES) {
                    // 先显示前2条
                    replies.slice(0, MAX_VISIBLE_REPLIES).forEach(r => {
                        repliesContainer.appendChild(createCommentCard(r, workId, chapterId, true));
                    });
                    
                    // 隐藏的回复容器
                    const hiddenReplies = document.createElement('div');
                    hiddenReplies.style.display = 'none';
                    replies.slice(MAX_VISIBLE_REPLIES).forEach(r => {
                        hiddenReplies.appendChild(createCommentCard(r, workId, chapterId, true));
                    });
                    repliesContainer.appendChild(hiddenReplies);
                    
                    // 展开/收起按钮
                    const toggleBtn = document.createElement('div');
                    toggleBtn.style.cssText = 'color:#bd1c2b;font-size:12px;cursor:pointer;padding:8px 0;';
                    toggleBtn.textContent = `展开 ${replies.length - MAX_VISIBLE_REPLIES} 条回复 ▼`;
                    toggleBtn.onclick = (e) => {
                        e.stopPropagation();
                        if (hiddenReplies.style.display === 'none') {
                            hiddenReplies.style.display = 'block';
                            toggleBtn.textContent = '收起回复 ▲';
                        } else {
                            hiddenReplies.style.display = 'none';
                            toggleBtn.textContent = `展开 ${replies.length - MAX_VISIBLE_REPLIES} 条回复 ▼`;
                        }
                    };
                    repliesContainer.appendChild(toggleBtn);
                } else {
                    replies.forEach(r => {
                        repliesContainer.appendChild(createCommentCard(r, workId, chapterId, true));
                    });
                }
                
                card.appendChild(repliesContainer);
            }
            
            return card;
        }
        
        // 显示回复输入框
        function showReplyInput(parentCard, parentComment, workId, chapterId) {
            // 移除已有的回复框
            const existing = parentCard.querySelector('.reply-box');
            if (existing) { existing.remove(); return; }
            
            const box = document.createElement('div');
            box.className = 'reply-box';
            box.style.cssText = 'margin-top:10px;padding:10px;background:#fff;border-radius:6px;margin-left:40px;border:1px solid #eee;';
            box.innerHTML = `
                <textarea placeholder="回复 ${parentComment.userName || '匿名'}..." style="width:100%;height:50px;border:1px solid #ddd;border-radius:4px;padding:6px;font-size:13px;resize:none;box-sizing:border-box;user-select:text;-webkit-user-select:text;"></textarea>
                <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px;">
                    <button class="cancel-btn" style="padding:4px 10px;border:1px solid #ddd;background:#fff;border-radius:4px;cursor:pointer;font-size:12px;">取消</button>
                    <button class="submit-btn" style="padding:4px 10px;border:none;background:#bd1c2b;color:#fff;border-radius:4px;cursor:pointer;font-size:12px;">回复</button>
                </div>
            `;
            
            const textarea = box.querySelector('textarea');
            const cancelBtn = box.querySelector('.cancel-btn');
            const replySubmitBtn = box.querySelector('.submit-btn');
            
            cancelBtn.onclick = () => box.remove();
            replySubmitBtn.onclick = async () => {
                const content = textarea.value.trim();
                if (!content || !currentContext) return;
                
                replySubmitBtn.textContent = '发送中...';
                replySubmitBtn.disabled = true;
                
                try {
                    await apiRequest(apiBase + '/api/v1/comments', {
                        method: 'POST',
                        body: JSON.stringify({
                            siteId, workId, chapterId,
                            paraIndex: currentContext.paraIndex,
                            content,
                            parentId: parentComment.id
                        })
                    });
                    box.remove();
                    await loadContainerComments(workId, chapterId);
                    const root = document.querySelector(`[data-chapter-id="${chapterId}"]`);
                    if (root) updateContainerBadges(root, chapterId);
                    showComments(workId, chapterId, currentContext.paraIndex);
                    showToast('✅ 回复成功');
                } catch (e) {
                    console.error(e);
                    showToast('❌ 回复失败');
                    replySubmitBtn.textContent = '回复';
                    replySubmitBtn.disabled = false;
                }
            };
            
            parentCard.appendChild(box);
            textarea.focus();
        }
    }

    // ==================== 辅助函数 ====================

    // 知乎特定选择器
    const ZHIHU_SELECTORS = [
        '.RichContent-inner .RichText',
        '.AnswerItem .RichText',
        '.Post-RichTextContainer .RichText',
        '.RichText.ztext.Post-RichText',
        '.RichText.ztext',
    ];

    const DEFAULT_SELECTORS = [
        'article',
        '.article',
        '.article-content',
        '.post-content',
        '.entry-content',
        '.content',
        '.post',
        '.markdown-body',
        'main',
        '[role="main"]',
        '.main-content',
        '#content',
        '.rich_media_content', // 微信公众号
        // 小说网站常用选择器
        '#read',           // 笔趣阁等
        '#chaptercontent',
        '#content',
        '#booktxt',
        '#htmlContent',
        '.chapter-content',
        '.read-content',
        '.novel-content',
        '.book-content',
        '.text-content',
        '.nr_nr',
        '#nr',
        '#nr1',
        '.nr',
        '#TextContent',
        '.readcontent',
        '#booktext',
        '.booktext',
        '#contentbox',
        '.contentbox',
        'div[id*="content"]',
        'div[class*="content"]',
        'div[id*="chapter"]',
        'div[class*="chapter"]',
        'div[id*="read"]',
    ];

    // 查找所有内容容器（支持知乎多个回答）
    function findAllContentContainers() {
        const containers = [];
        
        // 优先使用用户自定义选择器
        if (config.selector) {
            const els = document.querySelectorAll(config.selector);
            els.forEach(el => {
                if (el.querySelectorAll('p').length >= 1) {
                    containers.push(el);
                }
            });
            if (containers.length > 0) return containers;
        }

        const isZhihu = location.hostname.includes('zhihu.com');
        
        // 知乎特殊处理：查找所有回答
        if (isZhihu) {
            console.log('[ParaNote] Detected Zhihu, finding all answers...');
            for (const selector of ZHIHU_SELECTORS) {
                const els = document.querySelectorAll(selector);
                els.forEach(el => {
                    if (el.querySelectorAll('p').length >= 1 && !containers.includes(el)) {
                        containers.push(el);
                    }
                });
            }
            if (containers.length > 0) {
                console.log(`[ParaNote] Found ${containers.length} Zhihu containers`);
                return containers;
            }
        }

        // 通用选择器（只返回第一个）
        for (const selector of DEFAULT_SELECTORS) {
            try {
                const el = document.querySelector(selector);
                if (el) {
                    // 优先检查 <p> 标签
                    if (el.querySelectorAll('p').length >= 2) {
                        return [el];
                    }
                    // 有些小说网站用 <br> 分隔文本，检查文本长度
                    if (el.textContent && el.textContent.trim().length > 200) {
                        return [el];
                    }
                }
            } catch (e) {
                // 忽略无效选择器
            }
        }
        
        // 最后尝试：查找包含大量文本的 div
        const allDivs = document.querySelectorAll('div');
        for (const div of allDivs) {
            const text = div.textContent?.trim() || '';
            const childDivs = div.querySelectorAll('div').length;
            // 文本长度大于500且子div少于5个（避免选中整个页面）
            if (text.length > 500 && childDivs < 5 && div.querySelectorAll('a').length < 10) {
                console.log('[ParaNote] Found content by text length heuristic');
                return [div];
            }
        }
        
        return containers;
    }

    function findContentContainer() {
        const containers = findAllContentContainers();
        return containers[0] || null;
    }

    function generateWorkId(url) {
        return 'w_' + simpleHash(url);
    }

    function generateChapterId(path) {
        return 'c_' + simpleHash(path);
    }

    function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    // ==================== UI 组件 ====================

    function addFloatingButton() {
        if (document.getElementById('paranote-fab')) return;

        const fab = document.createElement('button');
        fab.id = 'paranote-fab';
        fab.innerHTML = '📝';
        fab.title = 'ParaNote 已启用 (点击禁用)';
        
        Object.assign(fab.style, {
            position: 'fixed',
            bottom: '80px',
            right: '20px',
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            border: 'none',
            background: 'linear-gradient(135deg, #f56c6c, #e74c3c)',
            color: '#fff',
            fontSize: '24px',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(245, 108, 108, 0.4)',
            zIndex: '2147483646',
            transition: 'transform 0.2s, box-shadow 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        });

        fab.addEventListener('mouseenter', () => {
            fab.style.transform = 'scale(1.1)';
            fab.style.boxShadow = '0 6px 20px rgba(245, 108, 108, 0.5)';
        });

        fab.addEventListener('mouseleave', () => {
            fab.style.transform = 'scale(1)';
            fab.style.boxShadow = '0 4px 15px rgba(245, 108, 108, 0.4)';
        });

        fab.addEventListener('click', toggleParaNote);

        document.body.appendChild(fab);
    }

    function showToast(message) {
        // 移除旧的 toast
        const oldToast = document.getElementById('paranote-toast');
        if (oldToast) oldToast.remove();

        const toast = document.createElement('div');
        toast.id = 'paranote-toast';
        toast.textContent = message;
        
        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '140px',
            right: '20px',
            background: '#333',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: '8px',
            fontSize: '14px',
            zIndex: '2147483647',
            opacity: '0',
            transform: 'translateY(10px)',
            transition: 'opacity 0.3s, transform 0.3s',
        });

        document.body.appendChild(toast);

        // 动画显示
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        // 3秒后消失
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ==================== 初始化 ====================

    function init() {
        // 检查是否在自动启用列表中
        const domain = window.location.hostname;
        if (config.autoEnable.includes(domain)) {
            // 延迟启用，等待页面加载完成
            setTimeout(enableParaNote, 1500);
        }

        // 添加快捷键 Alt+P 切换
        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.key === 'p') {
                e.preventDefault();
                toggleParaNote();
            }
        });

        console.log('[ParaNote] UserScript loaded. Press Alt+P or use menu to enable.');
    }

    // 等待页面加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
