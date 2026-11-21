/**
 * @author OpenClaw
 * @name 表情包管理
 * @team xinz
 * @origin 娱乐
 * @version 1.1.0
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

const jsonSchema = BncrCreateSchema.object({
    searchApi: BncrCreateSchema.string().setTitle('表情搜索接口').setDescription('留空则只支持收藏/发送已保存表情；接口需返回 JSON 数组或 {data:[...]}').setDefault(''),
    resultLimit: BncrCreateSchema.number().setTitle('搜索返回条数').setDefault(5),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

module.exports = async sender => {
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    const resultLimit = Number(cfg.resultLimit) || 5;

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
        
        if (!cfg.searchApi) {
            await sender.reply('⚠️ 未配置表情搜索接口\n请在后台「插件配置编辑器」填写搜索接口地址，或直接收藏已有表情');
            return;
        }
        await sender.reply(`🔍 正在搜索 ${keyword} 相关的表情包...`);
        
        try {
            const results = await searchEmoji(keyword, cfg.searchApi, resultLimit);
            
            if (results.length === 0) {
                await sender.reply(`❌ 未找到 ${keyword} 相关的表情包`);
                return;
            }
            
            // 显示前几个结果
            let reply = `🎭 找到 ${results.length} 个表情包:\n\n`;
            results.slice(0, resultLimit).forEach((item, index) => {
                reply += `${index + 1}. ${item.name}\n`;
            });
            
            reply += '\n发送「发送表情 数字」发送对应表情，或输入「保存表情」收藏';
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
            await sender.reply('❌ 请输入表情关键词\n例如：发送表情 开心\n或者发送「发送表情 1」发送搜索到的第一个表情');
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

async function searchEmoji(keyword, api, limit) {
    const url = `${api}${api.includes('?') ? '&' : '?'}msg=${encodeURIComponent(keyword)}&limit=${limit}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`接口 HTTP ${resp.status}`);
    const json = await resp.json();
    const list = Array.isArray(json) ? json : (json.data || json.result || []);
    return list.map(item => ({
        name: item.name || item.title || item.msg || '表情',
        url: item.url || item.image || item.imageUrl || item.path || '',
    })).filter(item => item.url).slice(0, limit);
}
