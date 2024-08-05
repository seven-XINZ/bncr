/**作者
 * @author seven
 * 插件名
 * @name 舔狗日记
 * 组织名  预留字段，未来发布插件会用到
 * @team xinz
 * 版本号
 * @version 1.0.5
 * 说明
 * @platform tgBot qq ssh HumanTG wxQianxun wxXyo wechaty
 * @description 舔狗日记
 * 触发正则   在bncr 所有的rule都被视为正则
 * @rule ^(舔狗|舔狗日记|我舔)$
 * // 是否管理员才能触发命令
 * @admin flase
 * // 是否发布插件，预留字段，可忽略
 * @public false
 * // 插件优先级，越大优先级越高  如果两个插件正则一样，则优先级高的先被匹配
 * @priority 9999
 * // 是否禁用插件
 * @disable false
 * // 是否服务模块，true不会作为插件加载，会在系统启动时执行该插件内容
 * @service false
 */

const request = require('request');

const apiKey = "62f7df1333f54e1b3a1f406b6c8d160e";

module.exports = async s => {
    code = s.param(1);
    //you code
    request.post({
        url: 'https://apis.tianapi.com/tiangou/index',
        form: {
            key: apiKey
        }
    },async function (err, response, tianapi_data) {
        if (err) {
            console.log(err);
        } else {
            var data = JSON.parse(tianapi_data);
            var list = data.result;
            data =
            list.content
        }
        await s.reply(data);
        //console.log(data);
    })
    //插件运行结束时 如果返回 'next' ，则继续向下匹配插件 否则只运行当前插件
    return 'next'  //继续向下匹配插件
}