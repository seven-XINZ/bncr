/**
 * This file is part of the App project.
 * @author Aming
 * @name qq
 * @team Bncr团队
 * @version 1.0.1
 * @description 外置qq机器人适配器
 * @adapter true
 * @public false
 * @disable false
 * @priority 10000
 * @classification ["官方适配器"]
 * @Copyright ©2023 Aming and Anmours. All rights reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 */
const he = require('he');
/* 配置构造器 */
const jsonSchema = BncrCreateSchema.object({
    enable: BncrCreateSchema.boolean().setTitle('是否开启适配器').setDescription(`设置为关则不加载该适配器`).setDefault(false),
    mode: BncrCreateSchema.string().setTitle('适配器模式').setDescription(`填入ws或http,\n如果是ws模式,无界ws接收地址为ws://bncrip:9090/api/bot/qqws`).setDefault('ws'),
    sendUrl: BncrCreateSchema.string()
        .setTitle('http交互发送地址')
        .setDescription(`如果是http模式，则需要设置 sendUrl，改地址为远端qq机器人的监听地址:端口\n,无界接受地址为:http://bncrip:9090/api/bot/qqHttp`)
        .setDefault('http://192.168.31.192:9696'),
});

/* 配置管理器 */
const ConfigDB = new BncrPluginConfig(jsonSchema);

module.exports = async () => {
    await ConfigDB.get();
    /* 如果用户未配置,userConfig则为空对象{} */
    if (!Object.keys(ConfigDB.userConfig).length) {
        sysMethod.startOutLogs('未配置qq适配器,退出.');
        return;
    }
    if (!ConfigDB?.userConfig?.enable) return sysMethod.startOutLogs('未启用外置qq 退出.');
    let qq = new Adapter('qq');
    if (ConfigDB.userConfig.mode === 'ws') await ws(qq);
    else if (ConfigDB.userConfig.mode === 'http') await http(qq);
    // console.log('qq适配器..', qq);
    return qq;
};

async function ws(qq) {
    const events = require('events');
    const eventS = new events.EventEmitter();
    const { randomUUID } = require('crypto');
    const listArr = [];
    /* ws监听地址  ws://192.168.31.192:9090/api/qq/qqws */
    router.ws('/api/bot/qqws', ws => {
        ws.on('message', msg => {
            const body = JSON.parse(msg);
            /* 拒绝心跳链接消息 */
            // console.log('收到ws请求', body);
            if (body.post_type === 'meta_event') return;
            // console.log('收到ws请求', body);
            if (body.echo) {
                for (const e of listArr) {
                    if (body.echo !== e.uuid) continue;
                    if (body.status && body.status === 'ok')
                        return e.eventS.emit(e.uuid, body.data.message_id.toString());
                    else return e.eventS.emit(e.uuid, '');
                }
            }
            /* 不是消息退出 */
            if (!body.post_type || body.post_type !== 'message') return;
            let msgInfo = {
                userId: body.sender.user_id + '' || '',
                userName: body.sender.nickname || '',
                groupId: body.group_id ? body.group_id + '' : '0',
                groupName: body.group_name || '',
                msg: he.decode(body.raw_message) || '',
                msgId: body.message_id + '' || '',
            };
            // console.log('最终消息：', msgInfo);
            qq.receive(msgInfo);
        });

        // console.log('qq适配器..', qq);

        /* 发送消息方法 */
        qq.reply = async function (replyInfo) {
            try {
                let uuid = randomUUID();
                let body = {
                    action: 'send_msg',
                    params: {},
                    echo: uuid,
                };
                +replyInfo.groupId
                    ? (body.params.group_id = replyInfo.groupId)
                    : (body.params.user_id = replyInfo.userId);
                if (replyInfo.type === 'text') {
                    body.params.message = replyInfo.msg;
                } else if (replyInfo.type === 'image') {
                    body.params.message = `[CQ:image,file=${replyInfo.path}]`;
                } else if (replyInfo.type === 'video') {
                    body.params.message = `[CQ:video,file=${replyInfo.path}]`;
                } else if (replyInfo.type === 'music') {
                    body.params.message = {
                        "type": "music",
                        "data": {
                            "type": "custom",
                            "url": replyInfo.path,
                            "audio": replyInfo.path,
                            "title": replyInfo.title,
                            "image": replyInfo.image,
                            "content": replyInfo.description
                        }
                    };
                } else if (replyInfo.type === 'data') {
                    body.params.message = `${replyInfo.msg}`;
                }
                // console.log('推送消息运行了', body);
                ws.send(JSON.stringify(body));
                return new Promise((resolve, reject) => {
                    listArr.push({ uuid, eventS });
                    let timeoutID = setTimeout(() => {
                        delListens(uuid);
                        eventS.emit(uuid, '');
                    }, 60 * 1000);
                    eventS.once(uuid, res => {
                        try {
                            delListens(uuid);
                            clearTimeout(timeoutID);
                            resolve(res || '');
                        } catch (e) {
                            console.error(e);
                        }
                    });
                });
            } catch (e) {
                console.error('qq:发送消息失败', e);
            }
        };

        /* 推送消息 */
        qq.push = async function (replyInfo) {
            // console.log('replyInfo', replyInfo);
            return await this.reply(replyInfo);
        };

        /* 注入删除消息方法 */
        qq.delMsg = async function (argsArr) {
            try {
                argsArr.forEach(e => {
                    if (typeof e !== 'string' && typeof e !== 'number') return false;
                    ws.send(
                        JSON.stringify({
                            action: 'delete_msg',
                            params: { message_id: e },
                        })
                    );
                });
                return true;
            } catch (e) {
                console.log('qq撤回消息异常', e);
                return false;
            }
        };
    });

    /**向/api/系统路由中添加路由 */
    router.get('/api/bot/qqws', (req, res) =>
        res.send({ msg: '这是Bncr 外置qq Api接口，你的get请求测试正常~，请用ws交互数据' })
    );
    router.post('/api/bot/qqws', async (req, res) =>
        res.send({ msg: '这是Bncr 外置qq Api接口，你的post请求测试正常~，请用ws交互数据' })
    );

    function delListens(id) {
        listArr.forEach((e, i) => e.uuid === id && listArr.splice(i, 1));
    }
}

async function http(qq) {
    const request = require('util').promisify(require('request'));
    /* 上报地址（gocq监听地址） */
    let senderUrl = ConfigDB?.userConfig?.sendUrl;
    if (!senderUrl) {
        console.log('qq:配置文件未设置sendUrl');
        qq = null;
        return;
    }

    /* 接受消息地址为： http://bncrip:9090/api/bot/qqHttp */
    router.post('/api/bot/qqHttp', async (req, res) => {
        res.send('ok');
        const body = req.body;
        // console.log('req', req.body);
        /* 心跳消息退出 */
        if (body.post_type === 'meta_event') return;
        // console.log('收到qqHttp请求', body);
        /* 不是消息退出 */
        if (!body.post_type || body.post_type !== 'message') return;
        let msgInfo = {
            userId: body.sender['user_id'] + '' || '',
            userName: body.sender['nickname'] || '',
            groupId: body.group_id ? body.group_id + '' : '0',
            groupName: body.group_name || '',
            msg: body['raw_message'] || '',
            msgId: body.message_id + '' || '',
        };
        qq.receive(msgInfo);
    });

    /**向/api/系统路由中添加路由 */
    router.get('/api/bot/qqHttp', (req, res) =>
        res.send({ msg: '这是Bncr 外置qq Api接口，你的get请求测试正常~，请用ws交互数据' })
    );
    router.post('/api/bot/qqHttp', async (req, res) =>
        res.send({ msg: '这是Bncr 外置qq Api接口，你的post请求测试正常~，请用ws交互数据' })
    );

    /* 回复 */
    qq.reply = async function (replyInfo) {
        try {
            let action = '/send_msg',
                body = {};
            +replyInfo.groupId ? (body['group_id'] = replyInfo.groupId) : (body['user_id'] = replyInfo.userId);
            if (replyInfo.type === 'text') {
                body.message = replyInfo.msg;
            } else if (replyInfo.type === 'image') {
                body.message = `[CQ:image,file=${replyInfo.msg}]`;
            } else if (replyInfo.type === 'video') {
                body.message = `[CQ:video,file=${replyInfo.msg}]`;
            } else if (replyInfo.type === 'audio') {
                body.params.message = `[CQ:record,file=${replyInfo.path}]`;
            } else if (replyInfo.type === 'music') {
                body.params.message = {
                    "type": "music",
                    "data": {
                        "type": "custom",
                        "url": replyInfo.path,
                        "audio": replyInfo.path,
                        "title": replyInfo.title,
                        "image": replyInfo.image,
                        "content": replyInfo.description
                    }
                };
                console.log(`1: ${body.params.message}`)
            }
            let sendRes = await requestPost(action, body);
            return sendRes ? sendRes.message_id : '0';
        } catch (e) {
            console.error('qq:发送消息失败', e);
        }
    };
    /* 推送消息 */
    qq.push = async function (replyInfo) {
        return await this.reply(replyInfo);
    };

    /* 注入删除消息方法 */
    qq.delMsg = async function (argsArr) {
        try {
            argsArr.forEach(e => {
                if (typeof e === 'string' || typeof e === 'number') {
                    requestPost('/delete_msg', { message_id: e });
                }
            });
            return true;
        } catch (e) {
            console.log('qq撤回消息异常', e);
            return false;
        }
    };

    /* 请求 */
    async function requestPost(action, body) {
        return (
            await request({
                url: senderUrl + action,
                method: 'post',
                headers: { 'Content-Type': 'application/json' },
                body: body,
                json: true,
            })
        ).body;
    }
}
