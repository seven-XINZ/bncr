/**
 * This file is part of the Bncr project.
 * @author 3zang
 * @name wechatFerry
 * @origin 3zang
 * @team 3zang
 * @version 1.0.2
 * @description wechatFerry适配器 wcf微信地址:https://github.com/lich0821/WeChatFerry/releases/tag/v39.0.14
 * @adapter true
 * @public true
 * @disable false
 * @priority 2
 * @Copyright ©2024 3zang. All rights reserved
 * @classification ["娱乐"]
 * Unauthorized copying of this file, via any medium is strictly prohibited
 */
/* 配置构造器 */
const jsonSchema = BncrCreateSchema.object({
  enable: BncrCreateSchema.boolean().setTitle('是否开启适配器').setDescription(`设置为关则不加载该适配器`).setDefault(false),
  sendUrl: BncrCreateSchema.string().setTitle('上报地址').setDescription(`wechatFerry的地址`).setDefault('http://192.168.0.134:10010/'),
  fileServer: BncrCreateSchema.string().setTitle('文件服务器地址').setDescription(`和微信在同一机器的文件服务器地址,需单独部署`).setDefault('http://192.168.0.134:3000/'),
});
/* 配置管理器 */
const ConfigDB = new BncrPluginConfig(jsonSchema);
module.exports = async () => {
  /* 读取用户配置 */
  await ConfigDB.get();
  /* 如果用户未配置,userConfig则为空对象{} */
  if (!Object.keys(ConfigDB.userConfig).length) {
    sysMethod.startOutLogs('未启用wechatFerry适配器,退出.');
    return;
  }
  if (!ConfigDB.userConfig.enable) return sysMethod.startOutLogs('未启用wechatFerry 退出.');
  let wechatFerryUrl = ConfigDB.userConfig.sendUrl;
  let fileServer = ConfigDB.userConfig.fileServer;
  if (!wechatFerryUrl) return console.log('wechatFerry:配置文件未设置sendUrl');
  if (!fileServer) console.log('wechatFerry:配置文件未设置文件服务器地址:fileServer');
  //这里new的名字将来会作为 sender.getFrom() 的返回值
  const wechatFerry = new Adapter('wechatFerry');
  // 包装原生require   你也可以使用其他任何请求工具 例如axios
  const request = require('util').promisify(require('request'));
  // wx数据库
  const wxDB = new BncrDB('wechatFerryUrl');
  /**向/api/系统路由中添加路由 */
  router.get('/api/bot/ferry', (req, res) => res.send({ msg: '这是wechatFerryUrl Api接口，你的get请求测试正常~，请用post交互数据' }));
  router.post('/api/bot/ferry', async (req, res) => {
    try {
      const body = req.body;
      let msgInfo = null;
      //私聊
      if (body.is_group == false) {
        msgInfo = {
          userId: body.sender || '',
          userName: body.sender || '',
          groupId: '0',
          groupName: '',
          msg: body.content || '',
          msgId: body.id || '',
          fromType: `Social`,
        };
        //群
      } else if (body.is_group == true) {
        msgInfo = {
          userId: body.sender || '',
          userName: body.sender || '',
          groupId: body.roomid.replace('@chatroom', '') || '0',
          groupName: body.content.group_name || '',
          msg: body.content || '',
          msgId: body.id || '',
          fromType: `Social`,
        };
      }
      msgInfo && wechatFerry.receive(msgInfo);
      res.send({ status: 200, data: '', msg: 'ok' });
    } catch (e) {
      console.error('ferry:', e);
      res.send({ status: 400, data: '', msg: e.toString() });
    }
  });
  wechatFerry.reply = async function (replyInfo) {
    //console.log('replyInfo', replyInfo);
    let body = null;
    const to_Wxid = +replyInfo.groupId ? replyInfo.groupId + '@chatroom' : replyInfo.userId;
    switch (replyInfo.type) {
      case 'text':
        replyInfo.msg = replyInfo.msg.replace(/\n/g, '\r');
        body = {
          receiver: to_Wxid,
          aters: "",
          msg: replyInfo.msg,
          api: 'text',
        };
        break;
      case 'image':
        body = {
          receiver: to_Wxid,
          path: fileServer ? await getLocalPath(replyInfo.path, "img") : replyInfo.path,
          api: 'image',
        };
        break;
      case 'video':
        body = {
          receiver: to_Wxid,
          path: fileServer ? await getLocalPath(replyInfo.path, "video") : replyInfo.path,
          suffix: "mp4",
          api: 'file',
        };
        break;
      default:
        return;
        break;
    }

    body && (await requestFerry(body));
    console.log('body',body);
    return '';
  };
  /* 推送消息方法 */
  wechatFerry.push = async function (replyInfo) {
    return this.reply(replyInfo);
  };
  // 伪装消息
  wechatFerry.inlinemask = async function (msgInfo) {
    return wechatFerry.receive(msgInfo);
  };
  /* 发送消息请求体 */
  async function requestFerry(body) {
    return (
      await request({
        url: wechatFerryUrl + body.api,
        method: 'post',
        body: body,
        json: true,
      })
    ).body;
  }

  /* 获取windows文件路径 */
  async function getLocalPath(url, type) {
    let req = { url: url, type: type }
    console.log("开始下载:",type,"文件:",url)
    return (
      await request({
        url: `${fileServer}download`,
        method: 'post',
        body: req,
        json: true,
      })
    ).body.path;
  }
  return wechatFerry;
};
