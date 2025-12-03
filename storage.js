import { createFileStorage } from "./storage-file.js";
// 我们使用动态导入来避免硬依赖
// import { createMongoStorage, initMongo } from "./storage-mongo.js";

let implementation = null;

export async function initStorage() {
  const type = process.env.STORAGE_TYPE || "file";
  console.log(`Using storage: ${type}`);
  
  if (type === "mongo") {
    // 动态导入，这样如果不使用 mongo，甚至不需要安装 mongoose
    const { createMongoStorage, initMongo } = await import("./storage-mongo.js");
    await initMongo();
    implementation = createMongoStorage();
  } else {
    implementation = createFileStorage();
  }
}

function getImpl() {
  if (!implementation) {
    // 默认回退到文件存储 (主要方便测试)
    implementation = createFileStorage();
  }
  return implementation;
}

export async function listComments(...args) {
  return getImpl().listComments(...args);
}

export async function createComment(...args) {
  return getImpl().createComment(...args);
}

export async function likeComment(...args) {
  return getImpl().likeComment(...args);
}

export async function deleteComment(...args) {
  return getImpl().deleteComment(...args);
}
