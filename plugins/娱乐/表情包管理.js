/**
 * @author OpenClaw
 * @name 表情包管理
 * @team xinz
 * @origin 娱乐
 * @version 1.0.0
 * @description 表情包搜索、保存、发送功能
 * @platform qqBot wxKeAImao wxQianxun
 * @rule ^(搜表情 | 找表情) (.+)$
 * @rule ^(保存表情 | 收藏表情)$
 * @rule ^(我的表情 | 表情列表)$
 * @rule ^(发送表情 | 发个表情) (.+)$
 * @priority 100
 * @disable false
 * @admin false
 * @public false
 */

module.exports = async sender => {
    const cmd = sender.getMsg();
    const db = new BncrDB('emoji');
    const userId = sender.getUserId();
    
    // 搜索表情包
    if (cmd.match(/^(搜表情 | 找表情)/)) {
        const keyword = sender.param(2);
        
        if (!keyword) {
            await sender.reply('❌ 请输入要搜索的表情关键词\n例如：搜表情 开心\n搜表情 搞笑\n搜表情 猫咪');
            return;
        }
        
        await sender.reply(`🔍 正在搜索 ${keyword} 相关的表情包...`);
        
        try {
            // 这里可以调用表情包 API
            // 例如：https://api.api5.com/ 或其他表情包 API
            
            const results = await searchEmoji(keyword);
            
            if (results.length === 0) {
                await sender.reply(`❌ 未找到 ${keyword} 相关的表情包`);
                return;
            }
            
            // 显示前几个结果
            let reply = `🎭 找到 ${results.length} 个表情包:\n\n`;
            results.slice(0, 5).forEach((item, index) => {
                reply += `${index + 1}. ${item.name}\n`;
            });
            
            reply += '\n回复数字发送对应表情包，或输入"保存表情"收藏';
            await sender.reply(reply);
            
            // 临时存储搜索结果
            await db.set(`search_${userId}`, results);
            
        } catch (error) {
            await sender.reply(`❌ 搜索失败：${error.message}`);
        }
        return;
    }
    
    // 保存/收藏表情
    if (cmd === '保存表情' || cmd === '收藏表情') {
        const searchResults = await db.get(`search_${userId}`);
        
        if (!searchResults) {
            await sender.reply('❌ 请先搜索表情包\n例如：搜表情 开心');
            return;
        }
        
        const saved = await db.get(`saved_emoji_${userId}`, []);
        saved.push(...searchResults);
        await db.set(`saved_emoji_${userId}`, saved);
        
        await sender.reply(`✅ 已保存 ${searchResults.length} 个表情包到你的收藏\n当前收藏总数：${saved.length}`);
        
        await db.del(`search_${userId}`);
        return;
    }
    
    // 查看我的表情
    if (cmd === '我的表情' || cmd === '表情列表') {
        const saved = await db.get(`saved_emoji_${userId}`, []);
        
        if (saved.length === 0) {
            await sender.reply('📭 你还没有收藏任何表情包\n输入"搜表情 关键词"开始搜索');
            return;
        }
        
        let reply = `🎭 我的收藏 (${saved.length}个):\n\n`;
        saved.slice(0, 10).forEach((item, index) => {
            reply += `${index + 1}. ${item.name}\n`;
        });
        
        if (saved.length > 10) {
            reply += `\n... 还有 ${saved.length - 10} 个`;
        }
        
        await sender.reply(reply);
        return;
    }
    
    // 发送表情
    if (cmd.match(/^(发送表情 | 发个表情)/)) {
        const keyword = sender.param(2);
        
        if (!keyword) {
            await sender.reply('❌ 请输入表情关键词\n例如：发送表情 开心\n或者回复数字发送搜索到的表情');
            return;
        }
        
        // 检查是否是数字（发送搜索结果）
        if (/^\d+$/.test(keyword)) {
            const searchResults = await db.get(`search_${userId}`);
            const index = parseInt(keyword) - 1;
            
            if (!searchResults || !searchResults[index]) {
                await sender.reply('❌ 无效的表情编号');
                return;
            }
            
            const emoji = searchResults[index];
            await sender.reply({
                type: 'image',
                msg: emoji.name,
                path: emoji.url
            });
            return;
        }
        
        // 从收藏中查找
        const saved = await db.get(`saved_emoji_${userId}`, []);
        const found = saved.find(e => e.name.includes(keyword) || keyword.includes(e.name));
        
        if (!found) {
            await sender.reply(`❌ 未找到 ${keyword} 相关的表情\n请先搜索或收藏表情`);
            return;
        }
        
        await sender.reply({
            type: 'image',
            msg: found.name,
            path: found.url
        });
        return;
    }
};

async function searchEmoji(keyword) {
    // 示例：调用表情包 API
    // 这里返回模拟数据
    
    return [
        { name: `${keyword} 表情 1`, url: 'https://example.com/emoji1.jpg' },
        { name: `${keyword} 表情 2`, url: 'https://example.com/emoji2.jpg' },
        { name: `${keyword} 表情 3`, url: 'https://example.com/emoji3.jpg' }
    ];
}
