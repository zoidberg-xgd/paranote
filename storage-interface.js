// Storage 接口说明（文档 + 约定），方便将来替换为不同存储后端。
//
// interface Storage {
//   listComments(params: {
//     siteId: string;
//     workId: string;
//     chapterId: string;
//   }): Promise<Record<string, Comment[]>>
//
//   createComment(input: {
//     siteId: string;
//     workId: string;
//     chapterId: string;
//     paraIndex: number;
//     content: string;
//     userName?: string;
//     ip?: string;
//   }): Promise<Comment>
// }
//
// type Comment = {
//   id: string;
//   siteId: string;
//   workId: string;
//   chapterId: string;
//   paraIndex: number;
//   userName?: string;
//   content: string;
//   createdAt: string;
// }
//
// 当前项目里，server.js 不直接依赖具体实现，而是通过 getStorage()
// 取得一个 Storage 实例。将来要改成 Postgres / KV / 边缘存储，只需要：
// 1. 新建一个 XXX-storage.js，导出 createXXXStorage()，实现上述两个方法
// 2. 在 storage.js 里把默认实现从 fileStorage 换成新的即可。

export {}; // 仅用于保持 ESModule 形式


