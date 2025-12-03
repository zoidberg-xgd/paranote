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

  // 创建右侧评论面板
  const sidebar = createSidebar();
  document.body.appendChild(sidebar.container);

  function createSidebar() {
    const container = document.createElement("div");
    container.className = "na-sidebar";
    Object.assign(container.style, {
      position: "fixed",
      top: "80px",
      right: "20px",
      width: "320px",
      maxHeight: "70vh",
      background: "rgba(255,255,255,0.98)",
      border: "1px solid #eee",
      borderRadius: "8px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      fontSize: "14px",
      display: "none",
      flexDirection: "column",
      zIndex: 99999,
      overflow: "hidden",
    });

    const header = document.createElement("div");
    header.textContent = "段落评论";
    Object.assign(header.style, {
      padding: "8px 12px",
      borderBottom: "1px solid #eee",
      background: "#fafafa",
      fontWeight: "bold",
    });

    const list = document.createElement("div");
    Object.assign(list.style, { padding: "8px 12px", flex: "1", overflowY: "auto" });

    const textarea = document.createElement("textarea");
    Object.assign(textarea.style, {
      width: "100%",
      height: "60px",
      boxSizing: "border-box",
      margin: "4px 0",
    });

    const btn = document.createElement("button");
    btn.textContent = "发表评论";
    Object.assign(btn.style, {
      width: "100%",
      padding: "6px 0",
      border: "none",
      background: "#f56c6c",
      color: "#fff",
      cursor: "pointer",
    });

    btn.onclick = async function () {
      const content = textarea.value.trim();
      if (!content || currentParaIndex == null) return;
      try {
        await fetch(apiBase + "/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteId,
            workId,
            chapterId,
            paraIndex: currentParaIndex,
            content,
          }),
        });
        textarea.value = "";
        await loadComments(currentParaIndex, list);
      } catch (e) {
        console.error("post comment failed", e);
      }
    };

    container.append(header, list, textarea, btn);
    return { container, list };
  }

  async function loadComments(paraIndex, listEl) {
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
      const arr = (data.commentsByPara || {})[String(paraIndex)] || [];

      listEl.innerHTML = "";
      if (!arr.length) {
        listEl.textContent = "还没有评论，来写第一条吧～";
        return;
      }
      arr.forEach(function (c) {
        const item = document.createElement("div");
        item.textContent = (c.userName || "匿名") + "：" + c.content;
        item.style.marginBottom = "6px";
        listEl.appendChild(item);
      });
    } catch (e) {
      console.error("load comments failed", e);
      listEl.textContent = "加载评论失败";
    }
  }

  // 为每个段落添加图标
  paras.forEach(function (p, idx) {
    p.dataset.naIndex = String(idx);
    const badge = document.createElement("span");
    badge.textContent = "💬";
    badge.className = "na-badge";
    Object.assign(badge.style, {
      cursor: "pointer",
      marginLeft: "6px",
      fontSize: "13px",
      opacity: 0.6,
    });

    badge.addEventListener("mouseenter", function () {
      badge.style.opacity = "1";
    });
    badge.addEventListener("mouseleave", function () {
      badge.style.opacity = "0.6";
    });

    badge.onclick = async function () {
      currentParaIndex = idx;
      sidebar.container.style.display = "flex";
      await loadComments(idx, sidebar.list);
    };

    p.appendChild(badge);
  });
})();


