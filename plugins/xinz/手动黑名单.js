/**
 * @author 咸鱼&xinz
 * @name 手动黑名单
 * @team xinz
 * @version v1.0.0
 * @description 黑白名单
 * @rule ^(拉黑|拉白) ([^ \n]+)$
 * @priority 10
 * @admin true
 * @disable false
*/
module.exports = async s => {
    param1 = s.param(1);
    param2 = s.param(2);
    const db = new BncrDB('userBlacklist');
    const db1 = new BncrDB('userBlacklistRemarks');
    const id = s.getFrom() + ":" + param2
    switch (param1) {
        case "拉黑":
            var byd = await db.set(id, 'true');
            var byd = await db1.set(id, '插件拉黑');
            await s.reply(byd ? "已拉黑" + s.getFrom() + param2 : "拉黑失败");
            break
        case "拉白":
            var byd = await db.del(id, 'true');
            await db1.del(id, 'true');
            await s.reply(byd ? "已洗白" + s.getFrom() + param2 : "拉白失败");
            break
    }
};