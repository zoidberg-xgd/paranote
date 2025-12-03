(function () {
  const script = document.currentScript;
  if (!script) return;

  console.log("ParaNote: Script loaded");

  const siteId = script.dataset.siteId || "default-site";
  
  // Allow explicit empty string for relative paths
  let apiBase = script.getAttribute("data-api-base");
  if (apiBase === null) {
      apiBase = (script.src && new URL(script.src).origin.replace(/\/$/, "")) || "";
  }

  function init() {
      const root = document.querySelector("[data-na-root]");
      console.log("ParaNote: Checking root...", root);
      
      if (!root) {
          console.log("ParaNote: Root not found, waiting for DOMContentLoaded...");
          if (document.readyState === "loading") {
              document.addEventListener("DOMContentLoaded", init);
          } else {
              console.warn("ParaNote: DOM loaded but root still missing");
          }
          return;
      }
      
      // Removed check for apiBase since empty string is now valid (relative path)

      // Check if already initialized
      if (root.dataset.paranoteInitialized) {
          console.log("ParaNote: Already initialized");
          return;
      }
      root.dataset.paranoteInitialized = "true";

      const workId = root.dataset.workId || "default-work";
      const chapterId = root.dataset.chapterId || root.dataset.ChapterId || "default-chapter";
      const paras = root.querySelectorAll("p");

      console.log(`ParaNote: Found ${paras.length} paragraphs`);

      if (!paras.length) {
          console.warn("ParaNote: No paragraphs found in root");
          return;
      }
      
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
        
        // Hypothesis 风格配色
        const styles = {
            bg: "#f7f7f7",
            cardBg: "#ffffff",
            text: "#333",
            meta: "#707070",
            border: "#dbdbdb",
            primary: "#bd1c2b", // Hypothesis 红色
            shadow: "0 4px 12px rgba(0,0,0,0.15)"
        };

        // 注入 Keyframe 动画
        const styleTag = document.createElement('style');
        styleTag.textContent = `
            @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
            @keyframes slideLeft { from { transform: translateX(100%); } to { transform: translateX(0); } }
        `;
        document.head.appendChild(styleTag);

        // 移动端和桌面端不同的样式
        if (isMobile) {
          Object.assign(container.style, {
            position: "fixed",
            bottom: "0",
            left: "0",
            right: "0",
            width: "100%",
            maxHeight: "85vh",
            background: styles.bg,
            borderTop: `1px solid ${styles.border}`,
            borderTopLeftRadius: "12px",
            borderTopRightRadius: "12px",
            boxShadow: "0 -4px 20px rgba(0,0,0,0.15)",
            fontSize: "14px",
            display: "none",
            flexDirection: "column",
            zIndex: 99999,
            overflow: "hidden",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
            animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
          });
        } else {
          Object.assign(container.style, {
            position: "fixed",
            top: "0",
            right: "0",
            width: "380px", // 更宽一点
            height: "100vh", // 全高
            background: styles.bg,
            borderLeft: `1px solid ${styles.border}`,
            boxShadow: "-2px 0 12px rgba(0,0,0,0.05)",
            fontSize: "14px",
            display: "none",
            flexDirection: "column",
            zIndex: 99999,
            overflow: "hidden",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
            animation: "slideLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
          });
        }

        // 顶部栏
        const header = document.createElement("div");
        Object.assign(header.style, {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          borderBottom: `1px solid ${styles.border}`,
          background: styles.cardBg,
          color: styles.text,
          flexShrink: 0
        });
        
        const titleWrapper = document.createElement("div");
        titleWrapper.style.display = "flex";
        titleWrapper.style.alignItems = "center";
        titleWrapper.style.gap = "8px";
        
        const titleIcon = document.createElement("span");
        titleIcon.innerHTML = "📝"; // 图标
        
        const title = document.createElement("span");
        title.textContent = "Annotations";
        title.style.fontWeight = "600";
        title.style.fontSize = "15px";
        
        // 评论数量显示
        const countSpan = document.createElement("span");
        countSpan.className = "na-comment-header-count";
        Object.assign(countSpan.style, {
            background: "#eee",
            color: "#666",
            padding: "2px 8px",
            borderRadius: "10px",
            fontSize: "12px",
            fontWeight: "500"
        });
        
        titleWrapper.append(titleIcon, title, countSpan);
        header.appendChild(titleWrapper);
        
        // 关闭按钮
        const closeBtn = document.createElement("button");
        closeBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        Object.assign(closeBtn.style, {
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "#999",
          padding: "4px",
          display: "flex",
          borderRadius: "4px",
          transition: "background 0.2s"
        });
        closeBtn.onmouseenter = () => closeBtn.style.background = "#f0f0f0";
        closeBtn.onmouseleave = () => closeBtn.style.background = "transparent";
        closeBtn.onclick = function () {
          container.style.display = "none";
          overlay.style.display = "none";
        };
        header.appendChild(closeBtn);

        // 列表区域
        const list = document.createElement("div");
        Object.assign(list.style, {
          padding: "16px",
          flex: "1",
          overflowY: "auto",
          background: "#f7f7f7", // 灰色背景
          display: "flex",
          flexDirection: "column",
          gap: "12px" // 卡片间距
        });

        // 输入区域
        const inputArea = document.createElement("div");
        Object.assign(inputArea.style, {
          padding: "16px",
          borderTop: `1px solid ${styles.border}`,
          background: styles.cardBg,
          flexShrink: 0
        });

        const textarea = document.createElement("textarea");
        textarea.placeholder = "添加评论...";
        Object.assign(textarea.style, {
          width: "100%",
          minHeight: "80px",
          boxSizing: "border-box",
          padding: "12px",
          border: `1px solid ${styles.border}`,
          borderRadius: "6px",
          fontSize: "14px",
          fontFamily: "inherit",
          resize: "vertical",
          outline: "none",
          transition: "border-color 0.2s, box-shadow 0.2s",
          marginBottom: "10px"
        });
        textarea.onfocus = () => {
            textarea.style.borderColor = styles.primary;
            textarea.style.boxShadow = `0 0 0 2px rgba(189, 28, 43, 0.1)`;
        };
        textarea.onblur = () => {
            textarea.style.borderColor = styles.border;
            textarea.style.boxShadow = "none";
        };

        const btnRow = document.createElement("div");
        btnRow.style.display = "flex";
        btnRow.style.justifyContent = "flex-end";

        const btn = document.createElement("button");
        btn.textContent = "发布";
        Object.assign(btn.style, {
          padding: "8px 20px",
          border: "none",
          background: styles.primary,
          color: "#fff",
          cursor: "pointer",
          borderRadius: "20px", // 圆角按钮
          fontSize: "14px",
          fontWeight: "600",
          transition: "opacity 0.2s",
          boxShadow: "0 2px 4px rgba(189, 28, 43, 0.3)"
        });
        btn.onmouseenter = () => btn.style.opacity = "0.9";
        btn.onmouseleave = () => btn.style.opacity = "1";

        btn.onclick = async function () {
          const content = textarea.value.trim();
          if (!content || currentParaIndex == null) return;
          
          // 获取当前段落的上下文指纹 (前32个字符)
          const pText = paras[currentParaIndex] ? getParaText(paras[currentParaIndex]) : "";
          const contextText = pText.slice(0, 32);

          try {
            btn.textContent = "发送中...";
            btn.disabled = true;
            const headers = { "Content-Type": "application/json" };
            if (typeof window !== "undefined" && window.PARANOTE_TOKEN) {
              headers["X-Paranote-Token"] = window.PARANOTE_TOKEN;
            }

            await fetch(apiBase + "/api/v1/comments", {
              method: "POST",
              headers,
              body: JSON.stringify({
                siteId,
                workId,
                chapterId,
                paraIndex: currentParaIndex,
                content,
                contextText, // 发送指纹
              }),
            });
            textarea.value = "";
            await loadAllComments();
            updateCommentCounts();
            await loadComments(currentParaIndex, list, sidebar.headerCount);
          } catch (e) {
            console.error("post comment failed", e);
            alert("发送失败");
          } finally {
            btn.textContent = "发布";
            btn.disabled = false;
          }
        };
        
        btnRow.appendChild(btn);
        inputArea.append(textarea, btnRow);
        
        container.append(header, list, inputArea);
        return { container, list, headerCount: countSpan };
      }

      // Helper to get pure text content excluding the badge
      function getParaText(p) {
          if (!p) return "";
          // Clone to not modify DOM
          const clone = p.cloneNode(true);
          const badge = clone.querySelector(".na-comment-count");
          if (badge) badge.remove();
          return clone.textContent.trim();
      }

      // 缓存所有段落的评论数据
      let allCommentsData = null;

      // 模糊定位算法：将评论重新挂载到正确的段落
      function reanchorComments(serverData) {
          const correctedData = {};
          const allComments = [];
          
          // 1. 扁平化所有评论
          Object.values(serverData).forEach(list => allComments.push(...list));
          
          // 2. 重新分配
          allComments.forEach(c => {
              let targetIndex = c.paraIndex;
              
              // 检查是否需要重定位
              // 如果有上下文指纹，且当前位置的内容不匹配，则搜索全篇
              if (c.contextText) {
                  const currentText = getParaText(paras[targetIndex]);
                  
                  // 如果当前段落不存在，或者开头不匹配，说明段落变动了
                  if (!currentText.startsWith(c.contextText)) {
                      // 简单的全篇搜索 (Fuzzy Search)
                      // 优化：先搜索附近，再搜索全篇。这里简化为直接搜索全篇。
                      let bestMatchIndex = -1;
                      
                      for (let i = 0; i < paras.length; i++) {
                          const pText = getParaText(paras[i]);
                          if (pText.startsWith(c.contextText)) {
                              bestMatchIndex = i;
                              break; // 找到了！
                          }
                      }
                      
                      if (bestMatchIndex !== -1) {
                          targetIndex = bestMatchIndex;
                          // console.log(`Re-anchored comment ${c.id} from ${c.paraIndex} to ${targetIndex}`);
                      } else {
                          // 如果找不到匹配的段落，就变成"孤儿评论"，或者保留在原位(虽然错位)
                          // 这里选择保留在原位，或者放到第0段，或者标记为失效。
                          // 为了体验，暂且保留原位，标红？不，还是原位吧。
                      }
                  }
              }
              
              const key = String(targetIndex);
              if (!correctedData[key]) correctedData[key] = [];
              correctedData[key].push(c);
          });
          
          return correctedData;
      }

      async function loadAllComments() {
        try {
          const url =
            apiBase +
            "/api/v1/comments?siteId=" +
            encodeURIComponent(siteId) +
            "&workId=" +
            encodeURIComponent(workId) +
            "&chapterId=" +
            encodeURIComponent(chapterId);
          const res = await fetch(url);
          const data = await res.json();
          
          // 执行模糊定位纠正
          allCommentsData = reanchorComments(data.commentsByPara || {});
          return allCommentsData;
        } catch (e) {
          console.error("load comments failed", e);
          return {};
        }
      }

      // 简单的 JWT 解析函数
      function parseJwt(token) {
        try {
          const base64Url = token.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
              return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(''));
          return JSON.parse(jsonPayload);
        } catch (e) {
          return null;
        }
      }

      async function loadComments(paraIndex, listEl, headerCountEl) {
        const arr = (allCommentsData || {})[String(paraIndex)] || [];

        listEl.innerHTML = "";
        
        // 检查当前用户权限
        let isAdmin = false;
        let token = null;
        if (typeof window !== "undefined" && window.PARANOTE_TOKEN) {
          token = window.PARANOTE_TOKEN;
          const payload = parseJwt(token);
          if (payload && (payload.role === 'admin' || payload.isAdmin === true)) {
            isAdmin = true;
          }
        }
        
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
          item.className = "na-comment-card";
          Object.assign(item.style, {
            padding: "12px",
            marginBottom: "0", // gap 由父容器控制
            background: "#fff",
            borderRadius: "8px",
            border: "1px solid #eee",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            transition: "transform 0.2s, box-shadow 0.2s",
            position: "relative"
          });
          
          if (!isMobile) {
              item.addEventListener("mouseenter", () => {
                  item.style.transform = "translateY(-1px)";
                  item.style.boxShadow = "0 4px 8px rgba(0,0,0,0.08)";
              });
              item.addEventListener("mouseleave", () => {
                  item.style.transform = "none";
                  item.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
              });
          }
          
          // 用户信息行
          const userRow = document.createElement("div");
          userRow.style.cssText = "display: flex; align-items: center; margin-bottom: 8px;";
          
          // 用户头像 (多彩)
          const avatar = document.createElement("div");
          const name = c.userName || c.userId || "匿名";
          const firstChar = name.length > 0 ? name.charAt(0).toUpperCase() : "?";
          
          // 根据名字生成固定颜色
          let hash = 0;
          for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
          const hue = hash % 360;
          
          avatar.style.cssText = `
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: hsl(${hue}, 60%, 85%);
            color: hsl(${hue}, 60%, 30%);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            font-size: 14px;
            margin-right: 10px;
            flex-shrink: 0;
            border: 1px solid rgba(0,0,0,0.05);
          `;
          avatar.textContent = firstChar;
          
          const userInfo = document.createElement("div");
          userInfo.style.cssText = "flex: 1; min-width: 0; display: flex; flex-direction: column;";
          
          const userName = document.createElement("span");
          userName.style.cssText = "font-weight: 600; color: #333; font-size: 13px;";
          userName.textContent = name;
          
          const meta = document.createElement("span");
          meta.style.cssText = "font-size: 11px; color: #999; margin-top: 2px;";
          const date = c.createdAt ? new Date(c.createdAt).toLocaleString("zh-CN", {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
          }) : "";
          meta.textContent = date;
          
          userInfo.appendChild(userName);
          userInfo.appendChild(meta);
          userRow.appendChild(avatar);
          userRow.appendChild(userInfo);
          
          // 评论内容
          const content = document.createElement("div");
          content.style.cssText = "color: #444; font-size: 14px; line-height: 1.6; word-break: break-word; padding-left: 42px;";
          
          // 处理引用内容 (简单markdown blockquote)
          let contentText = c.content;
          if (contentText.startsWith("> ")) {
              const parts = contentText.split("\n");
              const quoteText = parts[0].substring(2);
              const mainText = parts.slice(1).join("\n").trim();
              
              const blockquote = document.createElement("div");
              blockquote.style.cssText = "border-left: 3px solid #bd1c2b; padding-left: 8px; color: #777; margin-bottom: 6px; font-size: 13px; background: #f9f9f9; padding: 4px 8px; border-radius: 0 4px 4px 0;";
              blockquote.textContent = quoteText;
              content.appendChild(blockquote);
              
              const p = document.createElement("div");
              p.textContent = mainText;
              content.appendChild(p);
          } else {
              content.textContent = contentText;
          }
          
          // 操作栏（点赞 + 删除）
          const actionContainer = document.createElement("div");
          actionContainer.style.cssText = "display: flex; justify-content: flex-end; align-items: center; margin-top: 8px; padding-left: 42px;";
          
          // 删除按钮
          if (isAdmin) {
            const delBtn = document.createElement("button");
            delBtn.innerHTML = "🗑️";
            delBtn.title = "删除";
            delBtn.style.cssText = "border:none; background:transparent; cursor:pointer; color:#aaa; font-size:14px; margin-right: 12px; transition:color 0.2s;";
            delBtn.onmouseenter = () => delBtn.style.color = "#bd1c2b";
            delBtn.onmouseleave = () => delBtn.style.color = "#aaa";
            delBtn.onclick = async function() {
              if(!confirm("确定删除这条评论吗？")) return;
              try {
                 const headers = { "Content-Type": "application/json" };
                 if (token) headers["X-Paranote-Token"] = token;
                 
                 const res = await fetch(apiBase + "/api/v1/comments", {
                     method: "DELETE",
                     headers,
                     body: JSON.stringify({ siteId, workId, chapterId, commentId: c.id })
                 });
                 if(res.ok) {
                     await loadAllComments();
                     updateCommentCounts();
                     await loadComments(paraIndex, listEl, headerCountEl);
                 } else {
                     alert("删除失败");
                 }
              } catch(e) { console.error(e); }
            };
            actionContainer.appendChild(delBtn);
          }
          
          // 点赞按钮
          const likeBtn = document.createElement("button");
          const likes = c.likes || 0;
          likeBtn.innerHTML = `<span style="font-size:14px">❤️</span> <span style="margin-left:4px; font-size:12px;">${likes || ''}</span>`;
          likeBtn.style.cssText = "border:none; background:transparent; cursor:pointer; color:#aaa; display:flex; align-items:center; padding: 2px 6px; transition:color 0.2s; border-radius:4px;";
          
          likeBtn.onmouseenter = () => { likeBtn.style.color = "#bd1c2b"; likeBtn.style.background = "#fff0f0"; };
          likeBtn.onmouseleave = () => { likeBtn.style.color = "#aaa"; likeBtn.style.background = "transparent"; };

          likeBtn.onclick = async function() {
              try {
                 const headers = { "Content-Type": "application/json" };
                 if (token) headers["X-Paranote-Token"] = token;
                 
                 const res = await fetch(apiBase + "/api/v1/comments/like", {
                     method: "POST",
                     headers,
                     body: JSON.stringify({ siteId, workId, chapterId, commentId: c.id })
                 });
                 
                 if(res.status === 401) return alert("请登录后再点赞");
                 if(res.status === 400) return alert("您已经点过赞了");

                 if(res.ok) {
                     const data = await res.json();
                     likeBtn.innerHTML = `<span style="font-size:14px">❤️</span> <span style="margin-left:4px; font-weight:bold; color:#bd1c2b">${data.likes}</span>`;
                     likeBtn.style.color = "#bd1c2b";
                 }
              } catch(e) { console.error(e); }
          };

          actionContainer.appendChild(likeBtn);
          
          item.appendChild(userRow);
          item.appendChild(content);
          item.appendChild(actionContainer);
          
          listEl.appendChild(item);
        });
      }

      // 更新段落评论数显示
      function updateCommentCounts() {
        paras.forEach(function (p, idx) {
          const count = (allCommentsData || {})[String(idx)]?.length || 0;
          let badge = p.querySelector(".na-comment-count");
          if (!badge) {
            badge = document.createElement("span");
            badge.className = "na-comment-count";
            p.appendChild(badge);
          }

          // 样式逻辑：默认为灰色，只有当前选中段落(currentParaIndex)才显示红色
          const isActive = (currentParaIndex === idx);
          
          // 统一风格：全部显示数字，不再使用 emoji
          // 未选中：灰色(#999)，选中：红色(#f56c6c)
          const color = isActive ? "#f56c6c" : "#999";
          const borderColor = isActive ? "#f56c6c" : "#e0e0e0"; // 平时边框淡一点
          
          Object.assign(badge.style, {
            display: "inline-block",
            marginLeft: isMobile ? "8px" : "6px",
            padding: "0 4px",
            fontSize: isMobile ? "11px" : "10px",
            color: color,
            background: "#fff",
            border: `1px solid ${borderColor}`,
            borderRadius: "2px",
            cursor: "pointer",
            fontWeight: "500",
            minWidth: "18px",
            height: "18px",
            lineHeight: "16px", // adjust for border
            textAlign: "center",
            verticalAlign: "middle",
            touchAction: "manipulation",
            transition: "all 0.15s ease",
            boxSizing: "border-box",
          });
          
          badge.textContent = count;
          badge.title = count + " 条评论";
          
          // 移除之前的特殊样式 override
          badge.style.fontSize = isMobile ? "11px" : "10px";
          
          if (!isMobile) {
            badge.onmouseenter = function () {
              badge.style.borderColor = "#f56c6c";
              badge.style.color = "#f56c6c";
            };
            badge.onmouseleave = function () {
              badge.style.borderColor = borderColor;
              badge.style.color = color;
            };
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
          // 移除之前选中段落的下划线
          if (currentParaIndex !== null && paras[currentParaIndex]) {
            paras[currentParaIndex].style.textDecoration = "none";
            paras[currentParaIndex].style.background = "transparent";
          }

          // 如果点击的是当前已经打开的段落，则执行关闭逻辑
          if (currentParaIndex === idx && sidebar.container.style.display !== "none") {
              currentParaIndex = null;
              updateCommentCounts();
              sidebar.container.style.display = "none";
              if (isMobile) overlay.style.display = "none";
              return;
          }
          
          // 给当前段落加下划线（起点风格：红色下划线）
          currentParaIndex = idx;
          p.style.textDecoration = "underline";
          p.style.textDecorationColor = "#f56c6c";
          p.style.textDecorationThickness = isMobile ? "2px" : "1.5px";
          p.style.textUnderlineOffset = "2px";
          p.style.background = "transparent";
          
          // 更新所有徽章样式（当前选中的变红）
          updateCommentCounts();

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
            // e.preventDefault(); // 保持默认行为以免影响选中
            // handleClick(e);
          }, { passive: false });
        }
      });

      // 初始化：加载所有评论并更新计数
      loadAllComments().then(function () {
        updateCommentCounts();
      });
  } // End of init

  init();

})();
