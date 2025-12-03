(function () {
  const script = document.currentScript;
  if (!script) return;

  const siteId = script.dataset.siteId || "default-site";
  const apiBase =
    script.dataset.apiBase || (script.src && new URL(script.src).origin.replace(/\/$/, "")) || "";

  const root = document.querySelector("[data-na-root]");
  if (!root || !apiBase) return;

  const workId = root.dataset.workId || "default-work";
  const chapterId = root.dataset.chapterId || root.dataset.ChapterId || "default-chapter";
  const paras = root.querySelectorAll("p");

  if (!paras.length) return;

  let currentParaIndex = null;

  // 检测是否为移动端
  const isMobile = window.innerWidth <= 768 || "ontouchstart" in window;

  // 创建遮罩层（移动端用）
  const overlay = document.createElement("div");
  overlay.className = "na-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    top: "0",
    left: "0",
    right: "0",
    bottom: "0",
    background: "rgba(0,0,0,0.5)",
    zIndex: 99998,
    display: "none",
  });
  overlay.onclick = function () {
    sidebar.container.style.display = "none";
    overlay.style.display = "none";
  };
  document.body.appendChild(overlay);

  // 创建右侧评论面板
  const sidebar = createSidebar();
  document.body.appendChild(sidebar.container);

  function createSidebar() {
    const container = document.createElement("div");
    container.className = "na-sidebar";
    
    // 移动端和桌面端不同的样式
    if (isMobile) {
      Object.assign(container.style, {
        position: "fixed",
        bottom: "0",
        left: "0",
        right: "0",
        width: "100%",
        maxHeight: "80vh",
        background: "#fff",
        borderTop: "1px solid #eee",
        borderTopLeftRadius: "16px",
        borderTopRightRadius: "16px",
        boxShadow: "0 -2px 16px rgba(0,0,0,0.2)",
        fontSize: "14px",
        display: "none",
        flexDirection: "column",
        zIndex: 99999,
        overflow: "hidden",
      });
    } else {
      Object.assign(container.style, {
        position: "fixed",
        top: "100px",
        right: "20px",
        width: "340px",
        maxHeight: "calc(100vh - 120px)",
        background: "#fff",
        border: "1px solid #e5e5e5",
        borderRadius: "4px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
        fontSize: "14px",
        display: "none",
        flexDirection: "column",
        zIndex: 99999,
        overflow: "hidden",
      });
    }

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    Object.assign(header.style, {
      padding: isMobile ? "14px 16px" : "12px 16px",
      borderBottom: "1px solid #e5e5e5",
      background: "#fafafa",
      fontWeight: "500",
      fontSize: isMobile ? "15px" : "14px",
      color: "#333",
    });
    
    const titleWrapper = document.createElement("div");
    titleWrapper.style.display = "flex";
    titleWrapper.style.alignItems = "center";
    
    const title = document.createElement("span");
    title.textContent = "评论";
    title.style.fontWeight = "500";
    
    // 评论数量显示（起点风格）
    const countSpan = document.createElement("span");
    countSpan.className = "na-comment-header-count";
    countSpan.style.color = "#999";
    countSpan.style.fontSize = isMobile ? "13px" : "12px";
    countSpan.style.fontWeight = "400";
    countSpan.style.marginLeft = "6px";
    
    titleWrapper.appendChild(title);
    titleWrapper.appendChild(countSpan);
    header.appendChild(titleWrapper);
    
    // 关闭按钮（起点风格：简洁的 X）
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = "×";
    Object.assign(closeBtn.style, {
      background: "transparent",
      border: "none",
      fontSize: isMobile ? "24px" : "22px",
      cursor: "pointer",
      color: "#999",
      padding: "0",
      width: isMobile ? "28px" : "26px",
      height: isMobile ? "28px" : "26px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "2px",
      transition: "all 0.15s",
      lineHeight: "1",
    });
    closeBtn.onmouseenter = function () {
      closeBtn.style.background = "#e8e8e8";
      closeBtn.style.color = "#666";
    };
    closeBtn.onmouseleave = function () {
      closeBtn.style.background = "transparent";
      closeBtn.style.color = "#999";
    };
    closeBtn.onclick = function () {
      container.style.display = "none";
      overlay.style.display = "none";
    };
    header.appendChild(closeBtn);

    const list = document.createElement("div");
    Object.assign(list.style, {
      padding: isMobile ? "0" : "0",
      flex: "1",
      overflowY: "auto",
      minHeight: isMobile ? "200px" : "100px",
      background: "#fff",
    });

    const textarea = document.createElement("textarea");
    Object.assign(textarea.style, {
      width: "100%",
      height: isMobile ? "80px" : "60px",
      boxSizing: "border-box",
      margin: isMobile ? "8px 16px 4px" : "4px 12px",
      padding: "8px",
      border: "1px solid #ddd",
      borderRadius: "4px",
      fontSize: "14px",
      fontFamily: "inherit",
    });

    const btn = document.createElement("button");
    btn.textContent = "发表评论";
    Object.assign(btn.style, {
      width: "calc(100% - " + (isMobile ? "32px" : "24px") + ")",
      margin: isMobile ? "0 16px 16px" : "0 12px 8px",
      padding: isMobile ? "12px 0" : "6px 0",
      border: "none",
      background: "#f56c6c",
      color: "#fff",
      cursor: "pointer",
      borderRadius: "4px",
      fontSize: isMobile ? "16px" : "14px",
      fontWeight: "500",
    });

    btn.onclick = async function () {
      const content = textarea.value.trim();
      if (!content || currentParaIndex == null) return;
      try {
        const headers = { "Content-Type": "application/json" };
        // 如果宿主站点注入了 PARANOTE_TOKEN，则自动带上
        if (typeof window !== "undefined" && window.PARANOTE_TOKEN) {
          headers["X-Paranote-Token"] = window.PARANOTE_TOKEN;
        }

        await fetch(apiBase + "/comments", {
          method: "POST",
          headers,
          body: JSON.stringify({
            siteId,
            workId,
            chapterId,
            paraIndex: currentParaIndex,
            content,
          }),
        });
        textarea.value = "";
        // 重新加载所有评论并更新计数
        await loadAllComments();
        updateCommentCounts();
        await loadComments(currentParaIndex, list, sidebar.headerCount);
      } catch (e) {
        console.error("post comment failed", e);
      }
    };

    // 输入区域容器（起点风格：简洁）
    const inputArea = document.createElement("div");
    Object.assign(inputArea.style, {
      padding: isMobile ? "14px 16px" : "12px 16px",
      borderTop: "1px solid #e5e5e5",
      background: "#fafafa",
    });
    
    // 用户头像占位符（起点风格：小头像）
    const inputHeader = document.createElement("div");
    inputHeader.style.cssText = "display: flex; align-items: center; margin-bottom: 10px;";
    
    const inputAvatar = document.createElement("div");
    inputAvatar.style.cssText = `
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #f0f0f0;
      color: #666;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 500;
      font-size: 14px;
      margin-right: 10px;
      flex-shrink: 0;
      border: 1px solid #e5e5e5;
    `;
    inputAvatar.textContent = "我";
    
    const inputLabel = document.createElement("span");
    inputLabel.style.cssText = "color: #999; font-size: 13px;";
    inputLabel.textContent = "写下你的想法...";
    
    inputHeader.appendChild(inputAvatar);
    inputHeader.appendChild(inputLabel);
    
    // 调整 textarea 样式（起点风格）
    textarea.placeholder = "写下你的想法...";
    Object.assign(textarea.style, {
      width: "100%",
      height: isMobile ? "90px" : "70px",
      boxSizing: "border-box",
      margin: "0",
      padding: "10px 12px",
      border: "1px solid #e0e0e0",
      borderRadius: "4px",
      fontSize: "13px",
      fontFamily: "inherit",
      background: "#fff",
      resize: "none",
      transition: "border-color 0.15s",
    });
    
    textarea.addEventListener("focus", function () {
      textarea.style.borderColor = "#f56c6c";
      textarea.style.outline = "none";
    });
    textarea.addEventListener("blur", function () {
      textarea.style.borderColor = "#e0e0e0";
    });
    
    // 调整按钮样式（起点风格：红色按钮）
    Object.assign(btn.style, {
      width: "100%",
      margin: "10px 0 0",
      padding: isMobile ? "10px 0" : "8px 0",
      border: "none",
      background: "#f56c6c",
      color: "#fff",
      cursor: "pointer",
      borderRadius: "4px",
      fontSize: isMobile ? "15px" : "14px",
      fontWeight: "500",
      transition: "all 0.15s",
    });
    
    btn.addEventListener("mouseenter", function () {
      btn.style.background = "#ff4757";
    });
    btn.addEventListener("mouseleave", function () {
      btn.style.background = "#f56c6c";
    });
    
    inputArea.appendChild(inputHeader);
    inputArea.appendChild(textarea);
    inputArea.appendChild(btn);
    
    container.append(header, list, inputArea);
    return { container, list, headerCount: header.querySelector(".na-comment-header-count") };
  }

  // 缓存所有段落的评论数据
  let allCommentsData = null;

  async function loadAllComments() {
    try {
      const url =
        apiBase +
        "/comments?siteId=" +
        encodeURIComponent(siteId) +
        "&workId=" +
        encodeURIComponent(workId) +
        "&chapterId=" +
        encodeURIComponent(chapterId);
      const res = await fetch(url);
      const data = await res.json();
      allCommentsData = data.commentsByPara || {};
      return allCommentsData;
    } catch (e) {
      console.error("load comments failed", e);
      return {};
    }
  }

  async function loadComments(paraIndex, listEl, headerCountEl) {
    const arr = (allCommentsData || {})[String(paraIndex)] || [];

    listEl.innerHTML = "";
    
    // 更新头部评论数
    if (headerCountEl) {
      headerCountEl.textContent = arr.length > 0 ? arr.length + "条" : "";
    }
    
    if (!arr.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding: 60px 20px; text-align: center; color: #999; font-size: 13px; background: #fff;";
      empty.innerHTML = '<div style="margin-bottom: 8px; font-size: 32px; opacity: 0.5;">💬</div><div>还没有人发表评论</div>';
      listEl.appendChild(empty);
      return;
    }
    
    arr.forEach(function (c, idx) {
      const item = document.createElement("div");
      item.className = "na-comment-item";
      Object.assign(item.style, {
        padding: isMobile ? "14px 16px" : "12px 16px",
        borderBottom: idx < arr.length - 1 ? "1px solid #f0f0f0" : "none",
        background: "#fff",
        transition: "background 0.15s",
      });
      
      // 用户信息行（起点风格：简洁）
      const userRow = document.createElement("div");
      userRow.style.cssText = "display: flex; align-items: center; margin-bottom: 8px;";
      
      // 用户头像（起点风格：小圆形）
      const avatar = document.createElement("div");
      const name = c.userName || c.userId || "匿名";
      const firstChar = name.length > 0 ? name.charAt(0) : "匿";
      avatar.style.cssText = `
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: #f0f0f0;
        color: #666;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 500;
        font-size: 12px;
        margin-right: 8px;
        flex-shrink: 0;
        border: 1px solid #e5e5e5;
      `;
      avatar.textContent = firstChar;
      
      // 用户名和元信息（起点风格）
      const userInfo = document.createElement("div");
      userInfo.style.cssText = "flex: 1; min-width: 0;";
      
      const userName = document.createElement("span");
      userName.style.cssText = "font-weight: 500; color: #333; font-size: 13px; margin-right: 8px;";
      userName.textContent = name;
      
      const meta = document.createElement("span");
      meta.style.cssText = "font-size: 11px; color: #999;";
      const date = c.createdAt ? new Date(c.createdAt).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }) : "";
      meta.textContent = date;
      
      userInfo.appendChild(userName);
      userInfo.appendChild(meta);
      userRow.appendChild(avatar);
      userRow.appendChild(userInfo);
      
      // 评论内容（起点风格：简洁排版）
      const content = document.createElement("div");
      content.style.cssText = "color: #333; font-size: 13px; line-height: 1.7; margin-left: 36px; word-break: break-word; padding-top: 4px;";
      content.textContent = c.content;
      
      item.appendChild(userRow);
      item.appendChild(content);
      
      // hover 效果（桌面端，起点风格：轻微背景变化）
      if (!isMobile) {
        item.addEventListener("mouseenter", function () {
          item.style.background = "#fafafa";
        });
        item.addEventListener("mouseleave", function () {
          item.style.background = "#fff";
        });
      }
      
      listEl.appendChild(item);
    });
  }

  // 更新段落评论数显示（起点风格：红色边框小方框）
  function updateCommentCounts() {
    paras.forEach(function (p, idx) {
      const count = (allCommentsData || {})[String(idx)]?.length || 0;
      let badge = p.querySelector(".na-comment-count");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "na-comment-count";
        p.appendChild(badge);
      }
      // 起点风格：红色边框 + 白色背景 + 红色数字，小方框样式
      Object.assign(badge.style, {
        display: "inline-block",
        marginLeft: isMobile ? "8px" : "6px",
        padding: count > 0 ? "0 4px" : "0",
        fontSize: isMobile ? "11px" : "10px",
        color: count > 0 ? "#f56c6c" : "transparent",
        background: count > 0 ? "#fff" : "transparent",
        border: count > 0 ? "1px solid #f56c6c" : "none",
        borderRadius: "2px",
        cursor: "pointer",
        fontWeight: "500",
        minWidth: count > 0 ? "20px" : "0",
        height: count > 0 ? "18px" : "0",
        lineHeight: count > 0 ? "18px" : "0",
        textAlign: "center",
        verticalAlign: "middle",
        touchAction: "manipulation",
        transition: "all 0.15s ease",
        boxSizing: "border-box",
      });
      badge.textContent = count > 0 ? count : "";
      badge.title = count > 0 ? count + " 条评论" : "点击评论";
      
      // hover 效果（起点风格：轻微背景色变化）
      if (!isMobile && count > 0) {
        badge.addEventListener("mouseenter", function () {
          badge.style.background = "#fff5f5";
          badge.style.borderColor = "#ff4757";
        });
        badge.addEventListener("mouseleave", function () {
          badge.style.background = "#fff";
          badge.style.borderColor = "#f56c6c";
        });
      }
    });
  }

  // 为每个段落添加点击事件和评论数显示
  paras.forEach(function (p, idx) {
    p.dataset.naIndex = String(idx);
    Object.assign(p.style, {
      cursor: "pointer",
      position: "relative",
      padding: isMobile ? "8px 0" : "4px 0", // 移动端增大点击区域
      borderRadius: "4px",
      transition: "all 0.2s",
      WebkitTapHighlightColor: "transparent", // 移除移动端点击高亮
      touchAction: "manipulation", // 移动端优化触摸
    });

    // 桌面端 hover 效果（更柔和）
    if (!isMobile) {
      p.addEventListener("mouseenter", function () {
        if (currentParaIndex !== idx) {
          p.style.background = "rgba(0, 0, 0, 0.02)";
        }
      });
      p.addEventListener("mouseleave", function () {
        if (currentParaIndex !== idx) {
          p.style.background = "transparent";
          p.style.textDecoration = "none";
        }
      });
    }

    // 统一的点击/触摸处理
    const handleClick = async function (e) {
      // 如果点击的是评论数标签，不阻止默认行为
      if (e.target.classList.contains("na-comment-count")) {
        e.stopPropagation();
        return;
      }
      
      // 移除之前选中段落的下划线
      if (currentParaIndex !== null && paras[currentParaIndex]) {
        paras[currentParaIndex].style.textDecoration = "none";
        paras[currentParaIndex].style.background = "transparent";
      }
      
      // 给当前段落加下划线（起点风格：红色下划线）
      currentParaIndex = idx;
      p.style.textDecoration = "underline";
      p.style.textDecorationColor = "#f56c6c";
      p.style.textDecorationThickness = isMobile ? "2px" : "1.5px";
      p.style.textUnderlineOffset = "2px";
      p.style.background = "transparent";
      
      // 显示侧边栏和遮罩
      sidebar.container.style.display = "flex";
      if (isMobile) {
        overlay.style.display = "block";
        // 移动端滚动到顶部
        sidebar.container.scrollTop = 0;
      }
      await loadComments(idx, sidebar.list, sidebar.headerCount);
    };

    p.onclick = handleClick;
    // 移动端也支持 touchstart（防止双击缩放）
    if (isMobile) {
      p.addEventListener("touchend", function (e) {
        e.preventDefault();
        handleClick(e);
      }, { passive: false });
    }
  });

  // 初始化：加载所有评论并更新计数
  loadAllComments().then(function () {
    updateCommentCounts();
  });
})();


