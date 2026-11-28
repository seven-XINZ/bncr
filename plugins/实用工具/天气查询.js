/**
 * @author OpenClaw
 * @name 天气查询
 * @team xinz
 * @origin 实用工具
 * @description 查询天气信息，支持城市名查询
 * @platform tgBot qqBot wxKeAImao wxQianxun
 * @rule ^(天气 | 气温 | 天气情况) (.+)$
 * @priority 100
 * @disable true
 * @admin false
 * @public false
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @updated 2026-11-28
 * @classification ["数据"]
 */

const jsonSchema = BncrCreateSchema.object({
    apiBase: BncrCreateSchema.string().setTitle('天气接口地址').setDefault('https://wttr.in'),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

module.exports = async sender => {
    await ConfigDB.get();
    const apiBase = (ConfigDB.userConfig && ConfigDB.userConfig.apiBase) || 'https://wttr.in';
    const city = sender.param(2);
    
    if (!city) {
        await sender.reply('请告诉我你要查询哪个城市的天气，例如：天气 北京');
        return;
    }

    try {
        // 使用 wttr.in API 查询天气
        const response = await fetch(`${apiBase}/${encodeURIComponent(city)}?format=3&lang=zh`, { signal: AbortSignal.timeout(10000) });
        const weather = await response.text();
        
        await sender.reply(`🌤️ ${city} 的天气：\n\n${weather}`);
    } catch (error) {
        await sender.reply(`❌ 查询天气失败：${error.message}\n请检查城市名是否正确`);
    }
};
