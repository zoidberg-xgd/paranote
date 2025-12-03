// 非常简单的文件存储实现，用于 demo。
// 将每个 (siteId, workId, chapterId) 的所有评论存成一个 JSON 数组。

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

function getFilePath(siteId, workId, chapterId) {
  const safeName = `${encodeURIComponent(siteId)}__${encodeURIComponent(
    workId,
  )}__${encodeURIComponent(chapterId)}.json`;
  return path.join(DATA_DIR, safeName);
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
  await fs.mkdir(DATA_DIR, { recursive: true });
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

    async createComment(data) {
      const { siteId, workId, chapterId } = data;
      const all = await readAll(siteId, workId, chapterId);
      const now = new Date().toISOString();

      // 生成 ID
      const comment = {
        id: crypto.randomUUID(),
        ...data,
        likes: 0,
        createdAt: now,
      };

      all.push(comment);
      await writeAll(siteId, workId, chapterId, all);
      return comment;
    },

    async likeComment({ siteId, workId, chapterId, commentId, userId }) {
      const all = await readAll(siteId, workId, chapterId);
      const comment = all.find((c) => c.id === commentId);
      if (comment) {
        if (userId) {
          if (!comment.likedBy) comment.likedBy = [];
          if (comment.likedBy.includes(userId)) return null;
          comment.likedBy.push(userId);
        }
        
        comment.likes = (comment.likes || 0) + 1;
        await writeAll(siteId, workId, chapterId, all);
        return comment;
      }
      return null;
    },

    async deleteComment({ siteId, workId, chapterId, commentId }) {
      const all = await readAll(siteId, workId, chapterId);
      const idx = all.findIndex((c) => c.id === commentId);
      if (idx !== -1) {
        all.splice(idx, 1);
        await writeAll(siteId, workId, chapterId, all);
        return true;
      }
      return false;
    }
  };
}
