/**
 * @author 咸鱼
 * @name cd
 * @team xinz
 * @version v1.0.0
 * @description 菜单功能
 * @rule ^(菜单)$
 * @priority 10
 * @admin false
 * @public true
 * @encrypt false
 * @disable false
 * @classification ["功能插件"]  
 */

module.exports = async s => {
    // 定义菜单内容
    const txt = `
    `;

    // 回复菜单内容
    s.reply("——功能列表——\n" +
                "ChatGPT \n" +
                "城市天气 \n" +
                "二维码生成 \n" +
                "摸鱼日报 \n" +
                "热点趋势 \n" +
                "60秒读懂世界 \n" +
                "欢迎使用鑫仔机器人,友善使用,请勿滥用 ~㊗️🎊家人们发大财,心想事成,身体健康");
}
