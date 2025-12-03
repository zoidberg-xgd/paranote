import mongoose from 'mongoose';

// 定义评论 Schema
const commentSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true }, // 保持与文件版一致的 ID 格式
  siteId: { type: String, required: true, index: true },
  workId: { type: String, required: true, index: true },
  chapterId: { type: String, required: true, index: true },
  paraIndex: { type: Number, required: true },
  content: { type: String, required: true },
  // 用户信息
  userId: String,
  userName: String,
  userAvatar: String,
  ip: String,
  
  // 模糊定位
  contextText: String,
  
  // 互动数据
  likes: { type: Number, default: 0 },
  likedBy: [String], // 存储点赞用户的 ID 或 IP
  
  createdAt: { type: Date, default: Date.now }
});

// 复合索引加速查询
commentSchema.index({ siteId: 1, workId: 1, chapterId: 1 });

let CommentModel;

export async function initMongo() {
  if (!process.env.MONGO_URI) {
    throw new Error('Missing MONGO_URI environment variable');
  }
  
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');
    CommentModel = mongoose.model('Comment', commentSchema);
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
}

export function createMongoStorage() {
  return {
    async listComments({ siteId, workId, chapterId }) {
      if (!CommentModel) throw new Error('MongoDB not initialized');
      
      const comments = await CommentModel.find({ siteId, workId, chapterId })
        .sort({ createdAt: 1 }) // 按时间正序
        .lean();

      // 转换为前端需要的格式: { "0": [...], "1": [...] }
      const commentsByPara = {};
      for (const c of comments) {
        // 转换 _id 为 string (虽然我们用的是自定义 id 字段，但 mongoose 会自动加 _id)
        const safeComment = {
          ...c,
          _id: undefined, 
          createdAt: c.createdAt.toISOString()
        };
        
        if (!commentsByPara[c.paraIndex]) {
          commentsByPara[c.paraIndex] = [];
        }
        commentsByPara[c.paraIndex].push(safeComment);
      }
      
      return commentsByPara;
    },

    async createComment(data) {
      if (!CommentModel) throw new Error('MongoDB not initialized');
      
      // id 在 server.js 里生成好了传进来，或者在这里生成也可以。
      // 假设 server.js 传了 id
      const doc = new CommentModel(data);
      await doc.save();
      
      const plain = doc.toObject();
      return {
        ...plain,
        _id: undefined,
        createdAt: plain.createdAt.toISOString()
      };
    },

    async likeComment({ siteId, workId, chapterId, commentId, userId, ip }) {
        if (!CommentModel) throw new Error('MongoDB not initialized');

        const comment = await CommentModel.findOne({ id: commentId });
        if (!comment) return null;

        const identifier = userId || ip;
        // 检查是否赞过 (简单实现，如果是数组可能很大，但在段落评论场景通常还好)
        if (comment.likedBy.includes(identifier)) {
            return comment; // 已经赞过
        }

        comment.likes += 1;
        comment.likedBy.push(identifier);
        await comment.save();
        return comment;
    },
    
    async deleteComment({ siteId, commentId }) {
        if (!CommentModel) throw new Error('MongoDB not initialized');
        // 管理员删除
        await CommentModel.deleteOne({ id: commentId, siteId });
        return true;
    },

    async exportAll() {
        if (!CommentModel) throw new Error('MongoDB not initialized');
        const comments = await CommentModel.find({}).lean();
        return comments.map(c => {
            const { _id, __v, ...rest } = c;
            return {
                ...rest,
                createdAt: c.createdAt ? c.createdAt.toISOString() : undefined
            };
        });
    },

    async importAll(comments) {
        if (!CommentModel) throw new Error('MongoDB not initialized');
        if (!Array.isArray(comments)) throw new Error("Invalid data format");
        
        // Use bulkWrite for efficiency and upsert behavior
        const ops = comments.map(c => ({
            updateOne: {
                filter: { id: c.id },
                update: { $set: c },
                upsert: true
            }
        }));
        
        if (ops.length > 0) {
            await CommentModel.bulkWrite(ops);
        }
        return { success: true, count: ops.length };
    }
  };
}
