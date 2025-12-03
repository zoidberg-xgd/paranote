// 文件存储实现，实现 Storage 接口约定。

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = new URL("./data", import.meta.url);

function getFilePath(siteId, workId, chapterId) {
  const safeName = `${encodeURIComponent(siteId)}__${encodeURIComponent(
    workId,
  )}__${encodeURIComponent(chapterId)}.json`;
  return path.join(DATA_DIR.pathname, safeName);
}

async function readAll(siteId, workId, chapterId) {
  const file = getFilePath(siteId, workId, chapterId);
  try {
    const txt = await fs.readFile(file, "utf8");
    return JSON.parse(txt);
  } catch {
    return [];
  }
}

async function writeAll(siteId, workId, chapterId, comments) {
  const dir = DATA_DIR.pathname;
  await fs.mkdir(dir, { recursive: true });
  const file = getFilePath(siteId, workId, chapterId);
  await fs.writeFile(file, JSON.stringify(comments), "utf8");
}

export function createFileStorage() {
  return {
    async listComments({ siteId, workId, chapterId }) {
      const all = await readAll(siteId, workId, chapterId);
      // Sort by heat (likes) desc, then time desc
      all.sort((a, b) => {
        const likesA = a.likes || 0;
        const likesB = b.likes || 0;
        if (likesA !== likesB) return likesB - likesA;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

      const grouped = {};
      for (const c of all) {
        const key = String(c.paraIndex);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(c);
      }
      return grouped;
    },

    async createComment({
      siteId,
      workId,
      chapterId,
      paraIndex,
      content,
      userName,
      userId,
      userAvatar,
    }) {
      const all = await readAll(siteId, workId, chapterId);
      const now = new Date().toISOString();

      const comment = {
        id: crypto.randomUUID(),
        siteId,
        workId,
        chapterId,
        paraIndex,
        userName: userName || "匿名",
        userId,
        userAvatar,
        content,
        likes: 0,
        createdAt: now,
      };

      all.push(comment);
      await writeAll(siteId, workId, chapterId, all);
      return comment;
    },

    async likeComment({ siteId, workId, chapterId, commentId }) {
      const all = await readAll(siteId, workId, chapterId);
      const comment = all.find((c) => c.id === commentId);
      if (comment) {
        comment.likes = (comment.likes || 0) + 1;
        await writeAll(siteId, workId, chapterId, all);
        return comment;
      }
      return null;
    },
  };
}


