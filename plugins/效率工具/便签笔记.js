/**
 * @author OpenClaw
 * @name 便签笔记
 * @team xinz
 * @origin 效率工具
 * @version 1.0.0
 * @description 快速记录便签和笔记，支持分类和标签
 * @platform tgBot qqBot wxKeAImao wxQianxun
 * @rule ^(便签 | 笔记 | 记录) (.+)$
 * @rule ^(我的便签 | 我的笔记 | 查看便签 | 笔记列表)$
 * @rule ^(删除便签 | 删除笔记) (.+)$
 * @rule ^(便签分类 | 笔记分类)$
 * @priority 100
 * @disable false
 * @admin false
 * @public false
 */

module.exports = async sender => {
    const cmd = sender.getMsg();
    const db = new BncrDB('notes');
    const userId = sender.getUserId();
    
    // 添加便签/笔记
    if (cmd.match(/^(便签 | 笔记 | 记录)/) && !cmd.match(/^(我的便签 | 我的笔记 | 查看便签 | 笔记列表 | 删除便签 | 删除笔记 | 便签分类 | 笔记分类)$/)) {
        const noteText = sender.param(2);
        
        if (!noteText) {
            await sender.reply('❌ 请记录内容\n例如：便签 明天记得买牛奶\n笔记 工作 项目进度更新\n记录 灵感 新的想法');
            return;
        }
        
        // 解析分类和标签
        let category = '默认';
        let tags = [];
        let content = noteText;
        
        // 检查是否有分类标记
        if (noteText.includes('[') && noteText.includes(']')) {
            const match = noteText.match(/^\[([^\]]+)\](.*)/);
            if (match) {
                const parts = match[1].split(' ');
                category = parts[0];
                tags = parts.slice(1);
                content = match[2].trim();
            }
        }
        
        const notes = await db.get(`notes_${userId}`, []);
        const newNote = {
            id: Date.now(),
            content: content,
            category: category,
            tags: tags,
            createdAt: new Date().toISOString()
        };
        
        notes.push(newNote);
        await db.set(`notes_${userId}`, notes);
        
        await sender.reply(`✅ 已记录：${content}\n分类：${category}\n当前共有 ${notes.length} 条笔记`);
        return;
    }
    
    // 查看便签列表
    if (cmd.match(/^(我的便签 | 我的笔记 | 查看便签 | 笔记列表)$/)) {
        const notes = await db.get(`notes_${userId}`, []);
        
        if (notes.length === 0) {
            await sender.reply('📝 暂无笔记\n输入"便签 内容"添加新笔记');
            return;
        }
        
        let reply = `📋 我的笔记 (${notes.length}条)\n\n`;
        
        // 按分类分组
        const byCategory = {};
        notes.forEach(note => {
            if (!byCategory[note.category]) {
                byCategory[note.category] = [];
            }
            byCategory[note.category].push(note);
        });
        
        Object.entries(byCategory).forEach(([category, notes]) => {
            reply += `📁 ${category} (${notes.length}条):\n`;
            notes.slice(0, 3).forEach(note => {
                const tagStr = note.tags.length > 0 ? ` ${note.tags.map(t => `#${t}`).join(' ')}` : '';
                reply += `  • ${note.content}${tagStr}\n`;
            });
            if (notes.length > 3) {
                reply += `  ... 还有 ${notes.length - 3} 条\n`;
            }
            reply += '\n';
        });
        
        await sender.reply(reply);
        return;
    }
    
    // 删除便签
    if (cmd.match(/^(删除便签 | 删除笔记)/)) {
        const target = sender.param(2);
        
        if (!target) {
            await sender.reply('❌ 请指定要删除的笔记\n例如：删除便签 1\n删除笔记 明天记得买牛奶');
            return;
        }
        
        const notes = await db.get(`notes_${userId}`, []);
        
        // 按编号删除
        if (/^\d+$/.test(target)) {
            const index = parseInt(target) - 1;
            if (notes[index]) {
                notes.splice(index, 1);
                await db.set(`notes_${userId}`, notes);
                await sender.reply('✅ 已删除该笔记');
                return;
            }
        } else {
            // 按内容删除
            const index = notes.findIndex(n => n.content === target || n.content.includes(target));
            if (index !== -1) {
                notes.splice(index, 1);
                await db.set(`notes_${userId}`, notes);
                await sender.reply('✅ 已删除该笔记');
                return;
            }
        }
        
        await sender.reply('❌ 未找到该笔记');
        return;
    }
    
    // 查看分类
    if (cmd === '便签分类' || cmd === '笔记分类') {
        const notes = await db.get(`notes_${userId}`, []);
        
        if (notes.length === 0) {
            await sender.reply('📭 暂无笔记');
            return;
        }
        
        const byCategory = {};
        notes.forEach(note => {
            byCategory[note.category] = (byCategory[note.category] || 0) + 1;
        });
        
        let reply = '📁 笔记分类统计:\n\n';
        Object.entries(byCategory).sort((a, b) => b[1] - a[1]).forEach(([category, count]) => {
            reply += `${category}: ${count}条\n`;
        });
        
        await sender.reply(reply);
        return;
    }
};
