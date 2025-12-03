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
    },

    async exportAll() {
      try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        const files = await fs.readdir(DATA_DIR);
        const allComments = [];
        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          const filePath = path.join(DATA_DIR, file);
          try {
             const content = JSON.parse(await fs.readFile(filePath, 'utf8'));
             if (Array.isArray(content)) {
               allComments.push(...content);
             }
          } catch(e) { 
              console.error(`Failed to read ${file}`, e); 
          }
        }
        return allComments;
      } catch (e) {
        console.error("Export failed", e);
        return [];
      }
    },

    async importAll(comments) {
      if (!Array.isArray(comments)) throw new Error("Invalid data format: expected array");
      
      // Group by file key
      const groups = {};
      for (const c of comments) {
        if (!c.siteId || !c.workId || !c.chapterId) continue;
        const key = `${c.siteId}__${c.workId}__${c.chapterId}`; 
        if (!groups[key]) groups[key] = [];
        groups[key].push(c);
      }

      await fs.mkdir(DATA_DIR, { recursive: true });
      
      let count = 0;
      for (const [key, list] of Object.entries(groups)) {
          if (list.length === 0) continue;
          const { siteId, workId, chapterId } = list[0];
          const safeName = `${encodeURIComponent(siteId)}__${encodeURIComponent(workId)}__${encodeURIComponent(chapterId)}.json`;
          const filePath = path.join(DATA_DIR, safeName);
          
          let existing = [];
          try {
             existing = JSON.parse(await fs.readFile(filePath, 'utf8'));
          } catch {}
          
          const combined = [...existing];
          for (const newItem of list) {
             const idx = combined.findIndex(x => x.id === newItem.id);
             if (idx !== -1) {
                 combined[idx] = newItem; 
             } else {
                 combined.push(newItem); 
             }
          }
          
          await fs.writeFile(filePath, JSON.stringify(combined), 'utf8');
          count += list.length;
      }
      return { success: true, count };
    }
  };
}
