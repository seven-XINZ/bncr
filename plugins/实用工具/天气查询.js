/**
 * @author OpenClaw
 * @name 天气查询
 * @team xinz
 * @origin 实用工具
 * @version 1.0.0
 * @description 查询天气信息，支持城市名查询
 * @platform tgBot qqBot wxKeAImao wxQianxun
 * @rule ^(天气 | 气温 | 天气情况) (.+)$
 * @priority 100
 * @disable false
 * @admin false
 * @public false
 */

module.exports = async sender => {
    const city = sender.param(2);
    
    if (!city) {
        await sender.reply('请告诉我你要查询哪个城市的天气，例如：天气 北京');
        return;
    }

    try {
        // 使用 wttr.in API 查询天气
        const response = await fetch(`https://wttr.in/${city}?format=3&lang=zh`);
        const weather = await response.text();
        
        await sender.reply(`🌤️ ${city} 的天气：\n\n${weather}`);
    } catch (error) {
        await sender.reply(`❌ 查询天气失败：${error.message}\n请检查城市名是否正确`);
    }
};
