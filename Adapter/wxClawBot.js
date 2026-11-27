/**
 * This file is part of the Bncr project.
 * @author xinz
 * @name wxClawBot
 * @origin xinz
 * @team xinz
 * @version 1.0.0
 * @description 微信 ClawBot(腾讯 iLink Bot) 适配器，扫码即用，支持文本/图片/文件与自动语音播报
 * @adapter true
 * @public false
 * @disable false
 * @priority 5
 * @Copyright ©2026 xinz All rights reserved
 * @classification ["官方适配器"]
 */
const jsonSchema = BncrCreateSchema.object({
    enable: BncrCreateSchema.boolean()
        .setTitle('是否开启适配器')
        .setDescription('关闭后不加载该适配器')
        .setDefault(true),
    channelVersion: BncrCreateSchema.string()
        .setTitle('channel_version')
        .setDescription('协议版本标识，格式必须三段数字，例如 3.0.1/bncr-1.0.0')
        .setDefault('3.0.1/bncr-1.0.0'),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

module.exports = async () => {
    await ConfigDB.get();
    const cfg = Object.keys(ConfigDB.userConfig || {}).length
        ? ConfigDB.userConfig
        : { enable: true, channelVersion: '3.0.1/bncr-1.0.0' };
    if (!cfg.enable) return sysMethod.startOutLogs('wxClawBot: 适配器未启用，已退出');

    const axios = require('axios');
    const QRCode = require('qrcode');
    const crypto = require('crypto');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const adapt = new Adapter('wxClawBot');
    const db = new BncrDB('wxClawBot');
    const ttsDB = new BncrDB('wxTTS');

    const DEFAULT_BASE = 'https://ilinkai.weixin.qq.com';
    const CDN_BASE = 'https://novac2c.cdn.weixin.qq.com/c2c';
    const CHANNEL_VERSION = cfg.channelVersion || '3.0.1/bncr-1.0.0';
    const log = (...a) => console.log('wxClawBot:', ...a);
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    let creds = await db.get('creds', null);
    let cursor = await db.get('cursor', '');
    let ctxTokens = await db.get('ctxTokens', {});
    let seenIds = new Set();
    let running = true;
    let pausedUntil = 0;
    let status = { state: creds ? 'starting' : 'needLogin', msg: '等待扫码' };
    let login = { qrcode: '', qrContent: '', state: 'none', pin: '', needPin: false, refresh: 0 };

    /* ---------- 通用请求 ---------- */
    const randUin = () => Buffer.from(String(crypto.randomBytes(4).readUInt32BE(0))).toString('base64');
    function headers(token) {
        const h = {
            'Content-Type': 'application/json',
            'iLink-App-Id': 'bot',
            'iLink-App-ClientVersion': String(0x00030001),
            'X-WECHAT-UIN': randUin(),
        };
        if (token) {
            h.AuthorizationType = 'ilink_bot_token';
            h.Authorization = 'Bearer ' + token;
        }
        return h;
    }
    const baseInfo = () => ({ channel_version: CHANNEL_VERSION, bot_agent: 'Bncr' });

    async function api(pathname, body, opt = {}) {
        const base = opt.base || (creds && creds.baseUrl) || DEFAULT_BASE;
        const token = opt.auth === null ? null : (creds && creds.token);
        const res = await axios.post(base + pathname, body, {
            headers: headers(token),
            timeout: opt.timeout || 15000,
            validateStatus: () => true,
        });
        if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
        return res.data || {};
    }

    /* ---------- 扫码登录 ---------- */
    async function fetchQr() {
        const body = { local_token_list: creds && creds.token ? [creds.token] : [] };
        const res = await axios.post(`${DEFAULT_BASE}/ilink/bot/get_bot_qrcode?bot_type=3`, body, {
            headers: headers(null),
            timeout: 20000,
            validateStatus: () => true,
        });
        const d = res.data || {};
        if (!d.qrcode) throw new Error('取二维码失败: ' + JSON.stringify(d).slice(0, 200));
        login.qrcode = d.qrcode;
        login.qrContent = d.qrcode_img_content || '';
        login.state = 'wait';
        status = { state: 'needLogin', msg: '请使用微信「设置-插件-微信 ClawBot-开始扫描」扫码' };
        log('已获取登录二维码');
    }

    async function loginLoop() {
        while (running && !creds) {
            try {
                if (!login.qrcode) {
                    if (login.refresh > 3) {
                        status = { state: 'loginFailed', msg: '二维码刷新超过 3 次，请重新访问二维码页面' };
                        login.qrcode = '';
                        login.refresh = 0;
                        await sleep(3000);
                        continue;
                    }
                    await fetchQr();
                }
                const params = { qrcode: login.qrcode };
                if (login.pin) params.verify_code = login.pin;
                const res = await axios.get(`${DEFAULT_BASE}/ilink/bot/get_qrcode_status`, {
                    params,
                    headers: {
                        'iLink-App-Id': 'bot',
                        'iLink-App-ClientVersion': String(0x00030001),
                        'X-WECHAT-UIN': randUin(),
                    },
                    timeout: 40000,
                    validateStatus: () => true,
                });
                const d = res.data || {};
                const s = String(d.status || 'wait');
                login.state = s;
                if (s.includes('need_verifycode')) {
                    login.needPin = true;
                    status = { state: 'needPin', msg: '手机微信显示了配对数字，请在该页面输入' };
                    await sleep(1500);
                    continue;
                }
                if (s === 'scaned') {
                    login.pin = '';
                    login.needPin = false;
                    status = { state: 'scaned', msg: '已扫码，请在手机确认' };
                } else if (s === 'scaned_but_redirect') {
                    status = { state: 'scaned', msg: '已扫码，正在重定向' };
                } else if (s === 'confirmed') {
                    if (!d.bot_token) {
                        status = { state: 'loginFailed', msg: 'confirmed 但未返回 token' };
                        await sleep(2000);
                        continue;
                    }
                    creds = {
                        token: d.bot_token,
                        baseUrl: String(d.baseurl || DEFAULT_BASE).replace(/\/+$/, ''),
                        botId: d.ilink_bot_id || '',
                        userId: d.ilink_user_id || '',
                        savedAt: Date.now(),
                    };
                    await db.set('creds', creds);
                    await db.set('ownerId', creds.userId);
                    cursor = '';
                    await db.set('cursor', '');
                    login = { qrcode: '', qrContent: '', state: 'none', pin: '', needPin: false, refresh: 0 };
                    status = { state: 'online', msg: '已连接' };
                    log('登录成功 botId=' + creds.botId + ' owner=' + creds.userId);
                    notify('start');
                    pollLoop();
                    return;
                } else if (s === 'binded_redirect') {
                    status = { state: 'loginFailed', msg: '该 bot 已绑定其它实例，本机未取得凭据' };
                    await sleep(5000);
                    login.qrcode = '';
                    continue;
                } else if (s === 'expired' || s === 'verify_code_blocked') {
                    login.refresh += 1;
                    login.qrcode = '';
                    login.pin = '';
                    login.needPin = false;
                }
            } catch (e) {
                status = { state: 'loginWait', msg: '网络异常，重试中: ' + e.message };
            }
            await sleep(1500);
        }
    }

    async function notify(which) {
        try {
            await api(`/ilink/bot/msg/notify${which}`, { base_info: baseInfo() }, { timeout: 10000 });
        } catch (e) {
            log(`notify${which} 失败: ` + e.message);
        }
    }

    /* ---------- 收消息 ---------- */
    function pickText(msg) {
        const items = msg.item_list || [];
        for (const it of items) {
            if (it.type === 1 && it.text_item && it.text_item.text) return it.text_item.text;
            if (it.type === 3 && it.voice_item && it.voice_item.text) return it.voice_item.text;
        }
        return '';
    }

    function handleMsg(msg) {
        if (!msg || !msg.from_user_id) return;
        if (msg.message_type === 2) return; // 自己发的
        const id = String(msg.message_id || msg.client_id || msg.seq || '');
        if (id) {
            if (seenIds.has(id)) return;
            seenIds.add(id);
            if (seenIds.size > 500) seenIds = new Set(Array.from(seenIds).slice(-300));
        }
        if (msg.context_token) {
            ctxTokens[msg.from_user_id] = msg.context_token;
            db.set('ctxTokens', ctxTokens);
        }
        const text = pickText(msg);
        if (!text) return;
        adapt.receive({
            userId: msg.from_user_id,
            userName: msg.from_user_id,
            groupId: msg.group_id || '0',
            groupName: '',
            msg: text,
            msgId: id,
            fromType: 'Social',
        });
    }

    async function pollLoop() {
        while (running) {
            if (!creds) return;
            if (Date.now() < pausedUntil) {
                await sleep(30000);
                continue;
            }
            try {
                const d = await api(
                    '/ilink/bot/getupdates',
                    { get_updates_buf: cursor, base_info: baseInfo() },
                    { timeout: 45000 }
                );
                if (d.ret === -14 || d.errcode === -14) {
                    pausedUntil = Date.now() + 3600 * 1000;
                    status = { state: 'paused', msg: 'token 失效(-14)，已冷却 1 小时，稍后需重新扫码' };
                    log('会话失效 -14，冷却 1 小时');
                    continue;
                }
                if (typeof d.get_updates_buf === 'string' && d.get_updates_buf) {
                    cursor = d.get_updates_buf;
                    db.set('cursor', cursor);
                }
                status.state = 'online';
                for (const m of d.msgs || []) handleMsg(m);
            } catch (e) {
                log('轮询异常: ' + e.message);
                await sleep(3000);
            }
        }
    }

    /* ---------- 限速发送 ---------- */
    const SEND_WINDOW = 5 * 60 * 1000;
    const SEND_MAX = 7;
    let sendLog = [];
    const sendChain = { p: Promise.resolve() };
    function queueSend(fn) {
        const run = sendChain.p.then(fn, fn);
        sendChain.p = run.catch(() => {});
        return run;
    }
    async function waitSlot() {
        for (let i = 0; i < 60; i++) {
            const now = Date.now();
            sendLog = sendLog.filter(t => now - t < SEND_WINDOW);
            if (sendLog.length < SEND_MAX) return true;
            const wait = Math.min(10000, SEND_WINDOW - (now - sendLog[0]) + 500);
            await sleep(Math.max(1000, wait));
        }
        return false;
    }

    async function aesEcbEncrypt(buf, key) {
        const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
        return Buffer.concat([cipher.update(buf), cipher.final()]);
    }

    async function uploadMedia(buf, mediaType, toUserId) {
        const aeskey = crypto.randomBytes(16);
        const filekey = crypto.randomBytes(16).toString('hex');
        const rawfilemd5 = crypto.createHash('md5').update(buf).digest('hex');
        const filesize = buf.length + (16 - (buf.length % 16) || 16); // PKCS7 填充后长度
        const d = await api('/ilink/bot/getuploadurl', {
            filekey,
            media_type: mediaType,
            to_user_id: toUserId,
            rawsize: buf.length,
            rawfilemd5,
            filesize,
            no_need_thumb: true,
            aeskey: aeskey.toString('hex'),
            base_info: baseInfo(),
        });
        const ciphertext = await aesEcbEncrypt(buf, aeskey);
        const full = String(d.upload_full_url || '').trim();
        const param = String(d.upload_param || '');
        const url = full
            ? full
            : `${CDN_BASE}/upload?encrypted_query_param=${encodeURIComponent(param)}&filekey=${encodeURIComponent(filekey)}`;
        const res = await axios.post(url, ciphertext, {
            headers: { 'Content-Type': 'application/octet-stream' },
            timeout: 60000,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            responseType: 'text',
            validateStatus: () => true,
        });
        if (res.status !== 200) throw new Error(`CDN 上传失败 HTTP ${res.status}`);
        const encParam = res.headers['x-encrypted-param'];
        if (!encParam) throw new Error('CDN 未返回 x-encrypted-param');
        return { media: { encrypt_query_param: encParam, aes_key: Buffer.from(aeskey.toString('hex')).toString('base64'), encrypt_type: 1 }, size: ciphertext.length, rawSize: buf.length };
    }

    async function sendItem(toUserId, item) {
        const token = ctxTokens[toUserId];
        const ok = await waitSlot();
        if (!ok) throw new Error('发送队列等待超时（限速 7 条/5 分钟）');
        const d = await api('/ilink/bot/sendmessage', {
            msg: {
                from_user_id: '',
                to_user_id: toUserId,
                client_id: `bncr-${crypto.randomBytes(8).toString('hex')}`,
                message_type: 2,
                message_state: 2,
                context_token: token,
                item_list: [item],
            },
            base_info: baseInfo(),
        });
        if (d.ret && d.ret !== 0) throw new Error('sendmessage ret=' + d.ret + ' ' + (d.errmsg || ''));
        sendLog.push(Date.now());
        return true;
    }

    async function loadBuf(p) {
        if (/^https?:\/\//i.test(p)) {
            const r = await axios.get(p, { responseType: 'arraybuffer', timeout: 60000, maxContentLength: Infinity });
            return Buffer.from(r.data);
        }
        if (/^file:\/\//i.test(p)) p = p.replace(/^file:\/\//, '');
        return fs.readFileSync(p);
    }

    /* ---------- 语音合成（开关由插件控制，默认关） ---------- */
    async function synth(text) {
        const c = (await ttsDB.get('config', null)) || {};
        if (!c.enabled) return null;
        const list = c.platforms || [];
        const p = list.find(x => x.name === c.active) || list[0];
        if (!p || !p.url) return null;
        if (p.api === 'ttson') {
            const token = p.key || '';
            const body = JSON.stringify({
                voice_id: Number(p.voice || 3585),
                to_lang: 'ZH',
                format: 'mp3',
                speed_factor: Number(p.speed || 1),
                pitch_factor: 0,
                volume_change_dB: 0,
                emotion: 1,
                text,
            });
            const url = `${p.url.replace(/\/+$/, '')}/flashsummary/tts?token=${encodeURIComponent(token)}`;
            const r = await axios.post(url, body, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
            const d = r.data || {};
            if (!d.voice_path) throw new Error('ttson 未返回 voice_path');
            const audio = await axios.get(
                `${d.url}:${d.port}/flashsummary/retrieveFileData?stream=True&token=${encodeURIComponent(token)}&voice_audio_path=${encodeURIComponent(d.voice_path)}`,
                { responseType: 'arraybuffer', timeout: 60000 }
            );
            return Buffer.from(audio.data);
        }
        // simple: GET url?text=&key=
        const sep = p.url.includes('?') ? '&' : '?';
        const r = await axios.get(`${p.url}${sep}text=${encodeURIComponent(text)}&key=${encodeURIComponent(p.key || '')}`, {
            responseType: 'arraybuffer',
            timeout: 60000,
        });
        return Buffer.from(r.data);
    }

    /* ---------- 对外发送 ---------- */
    adapt.reply = async function (replyInfo) {
        const info = typeof replyInfo === 'string' ? { msg: replyInfo } : replyInfo || {};
        const type = info.type || 'text';
        let toUserId = info.userId;
        if (Array.isArray(toUserId)) toUserId = toUserId[0];
        if (toUserId && typeof toUserId === 'object') toUserId = toUserId.userId || '';
        toUserId = String(toUserId || '').trim();
        if (!toUserId) toUserId = String((await db.get('ownerId', '')) || (creds && creds.userId) || '').trim();
        if (!toUserId) {
            log('reply 失败：无收件人');
            return '';
        }
        return queueSend(async () => {
            try {
                if (type === 'text') {
                    const text = String(info.msg == null ? '' : info.msg);
                    if (!text) return '';
                    try {
                        const audio = await synth(text);
                        if (audio && audio.length > 200) {
                            const up = await uploadMedia(audio, 3, toUserId);
                            await sendItem(toUserId, {
                                type: 4,
                                file_item: {
                                    media: up.media,
                                    file_name: `tts-${Date.now()}.mp3`,
                                    len: String(up.rawSize),
                                },
                            });
                            return 'voice';
                        }
                    } catch (e) {
                        log('语音合成失败，回退文本: ' + e.message);
                    }
                    const chunks = text.match(/[\s\S]{1,1800}/g) || [];
                    for (const chunk of chunks) await sendItem(toUserId, { type: 1, text_item: { text: chunk } });
                    return '';
                }
                if (type === 'image') {
                    const buf = await loadBuf(info.path || info.msg);
                    const up = await uploadMedia(buf, 1, toUserId);
                    await sendItem(toUserId, { type: 2, image_item: { media: up.media, mid_size: up.size } });
                    return '';
                }
                if (type === 'video') {
                    const buf = await loadBuf(info.path || info.msg);
                    const up = await uploadMedia(buf, 2, toUserId);
                    await sendItem(toUserId, { type: 5, video_item: { media: up.media, video_size: up.size } });
                    return '';
                }
                if (type === 'file' || type === 'record' || type === 'voice') {
                    const buf = await loadBuf(info.path || info.msg);
                    const name = info.name || String(info.path || info.msg || 'file').split(/[\\/]/).pop() || 'file.mp3';
                    const up = await uploadMedia(buf, 3, toUserId);
                    await sendItem(toUserId, {
                        type: 4,
                        file_item: { media: up.media, file_name: name, len: String(up.rawSize) },
                    });
                    return '';
                }
                return '';
            } catch (e) {
                log('reply 异常: ' + e.message);
                return '';
            }
        });
    };

    adapt.push = async function (replyInfo) {
        return adapt.reply(replyInfo);
    };
    adapt.delMsg = async function () {
        return ''; // iLink 未提供撤回接口
    };
    adapt.inlinemask = async function (msgInfo) {
        return adapt.receive(msgInfo);
    };
    adapt.Bridge = {
        status: () => ({ ...status, botId: creds && creds.botId, ownerId: creds && creds.userId }),
        ownerId: () => (creds && creds.userId) || '',
        relogin: async () => {
            creds = null;
            await db.del('creds');
            login = { qrcode: '', qrContent: '', state: 'none', pin: '', needPin: false, refresh: 0 };
            await fetchQr().catch(e => log(e.message));
            loginLoop();
            return true;
        },
    };

    /* ---------- HTTP 页面：扫码 / 状态 ---------- */
    router.get('/api/bot/wxclawbot', (req, res) => res.send({ ...status, botId: creds && creds.botId }));

    router.get('/api/bot/wxclawbot/status', (req, res) =>
        res.send({ ...status, login: login.state, needPin: login.needPin, botId: creds && creds.botId })
    );

    router.post('/api/bot/wxclawbot/pin', (req, res) => {
        const pin = String((req.body && req.body.pin) || '');
        if (!pin) return res.send({ ok: false, msg: '缺少 pin' });
        login.pin = pin;
        res.send({ ok: true, msg: '已提交配对数字' });
    });

    router.get('/api/bot/wxclawbot/qr', async (req, res) => {
        if (creds) {
            return res.send(`<meta charset="utf-8"><body style="font:16px/1.6 -apple-system;padding:24px">
                <h2>微信 ClawBot 已连接</h2><p>bot: ${creds.botId || '-'}</p>
                <p>如需重新绑定：<a href="/api/bot/wxclawbot/relogin">重新扫码</a></p></body>`);
        }
        if (!login.qrContent) await fetchQr().catch(e => log(e.message));
        if (!login.qrContent) return res.send('<meta charset="utf-8"><body>二维码获取中，请 3 秒后刷新</body>');
        const dataUrl = await QRCode.toDataURL(login.qrContent, { margin: 1, width: 320 });
        res.send(`<meta charset="utf-8"><body style="font:16px/1.6 -apple-system;padding:24px;text-align:center">
            <h3>微信扫码绑定 ClawBot</h3>
            <p style="color:#666">微信 → 我 → 设置 → 插件 → 微信 ClawBot → 开始扫描</p>
            <img src="${dataUrl}" width="320" height="320" />
            <p id="s">状态：${login.state}</p>
            <p style="color:#999">若手机显示配对数字，请填写：</p>
            <input id="pin" style="padding:8px;font-size:18px;width:160px" />
            <button onclick="fetch('/api/bot/wxclawbot/pin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:document.getElementById('pin').value})}).then(()=>alert('已提交'))">提交</button>
            <p style="margin-top:16px"><a href="/api/bot/wxclawbot/qr">刷新二维码</a> · <a href="/api/bot/wxclawbot/status">查状态</a></p>
            <script>
              setInterval(async () => {
                try {
                  const r = await (await fetch('/api/bot/wxclawbot/status')).json();
                  document.getElementById('s').textContent = '状态：' + r.login + (r.state === 'online' ? ' · 已连接' : '');
                  if (r.state === 'needPin') document.getElementById('pin').focus();
                } catch (e) {}
              }, 3000);
            </script></body>`);
    });

    router.get('/api/bot/wxclawbot/relogin', async (req, res) => {
        await adapt.Bridge.relogin().catch(e => log('relogin: ' + e.message));
        res.send('<meta charset="utf-8"><body>已重置，3 秒后跳到二维码页 <script>setTimeout(()=>location.href="/api/bot/wxclawbot/qr",3000)</script></body>');
    });

    router.get('/api/bot/wxclawbot/say', async (req, res) => {
        const text = String(req.query.text || '');
        if (!text) return res.send({ ok: false, msg: '缺少 text' });
        const r = await adapt.reply({ type: 'text', msg: text });
        res.send({ ok: true, result: r });
    });

    router.get('/api/bot/wxclawbot/ctx', (req, res) =>
        res.send({ count: Object.keys(ctxTokens).length, users: Object.keys(ctxTokens) })
    );

    /* ---------- 启动 ---------- */
    if (creds) {
        status = { state: 'online', msg: '已加载凭据，开始轮询' };
        notify('start');
        pollLoop();
        log('已加载已保存的登录凭据，开始轮询');
    } else {
        loginLoop();
        log('未发现登录凭据，请打开 http://<你的Bncr地址>:9099/api/bot/wxclawbot/qr 扫码');
    }

    return adapt;
};
