// 非常简单的文件存储实现，用于 demo。
// 将每个 (siteId, workId, chapterId) 的所有评论存成一个 JSON 数组。

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

export async function listComments({ siteId, workId, chapterId }) {
  const all = await readAll(siteId, workId, chapterId);
  const grouped = {};
  for (const c of all) {
    const key = String(c.paraIndex);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  }
  return grouped;
}

export async function createComment({
  siteId,
  workId,
  chapterId,
  paraIndex,
  content,
  userName,
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
    content,
    createdAt: now,
  };

  all.push(comment);
  await writeAll(siteId, workId, chapterId, all);
  return comment;
}


