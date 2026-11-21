/**
 * @author OpenClaw
 * @name 音乐播放器
 * @team xinz
 * @origin 娱乐
 * @version 1.1.0
 * @description 搜索并发送网易云音乐音频，受版权限制的歌曲改为返回试听链接
 * @platform qqBot wxKeAImao wxQianxun
 * @rule ^(播放 | 来首) (.+)$
 * @rule ^(暂停 | 停止 | 下一首 | 上一首|音量)$
 * @priority 100
 * @disable false
 * @admin false
 * @public false
 */

const jsonSchema = BncrCreateSchema.object({
    searchApi: BncrCreateSchema.string().setTitle('搜索接口').setDefault('https://music.163.com/api/search/get/web'),
    outerApi: BncrCreateSchema.string().setTitle('音频外链接口').setDefault('https://music.163.com/song/media/outer/url'),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function searchMusic(keywords, api) {
    const url = `${api}?csrf_token=&s=${encodeURIComponent(keywords)}&type=1&offset=0&total=true&limit=5`;
    const resp = await fetch(url, {
        headers: { 'Referer': 'https://music.163.com/', 'User-Agent': UA },
        signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`搜索接口 HTTP ${resp.status}`);
    const data = await resp.json();
    const songs = data?.result?.songs || [];
    return songs.map(song => ({
        id: song.id,
        name: song.name,
        artist: (song.artists || song.ar || []).map(a => a.name).join('/'),
        album: (song.album || song.al || {}).name || '',
        duration: Math.round((song.duration || song.dt || 0) / 1000),
    }));
}

async function resolveAudioUrl(song, api) {
    const url = `${api}?id=${song.id}.mp3`;
    const resp = await fetch(url, {
        headers: { 'Referer': 'https://music.163.com/', 'User-Agent': UA },
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
    });
    const location = resp.headers.get('location');
    if (!location || /\/404|music\.163\.com\/404/.test(location)) return null;
    return location;
}

module.exports = async sender => {
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    const cmd = sender.getMsg();
    const songName = sender.param(2);

    if (cmd.match(/^(播放 | 来首)/)) {
        if (!songName) {
            await sender.reply('❌ 请输入要播放的歌曲名\n例如：播放 周杰伦 青花瓷');
            return;
        }
        await sender.reply(`🎵 正在搜索 ${songName}...`);
        try {
            const songs = await searchMusic(songName, cfg.searchApi || 'https://music.163.com/api/search/get/web');
            if (songs.length === 0) {
                await sender.reply(`❌ 未找到歌曲：${songName}`);
                return;
            }
            const song = songs[0];
            const audioUrl = await resolveAudioUrl(song, cfg.outerApi || 'https://music.163.com/song/media/outer/url');
            if (audioUrl) {
                await sender.reply({
                    type: 'record',
                    path: audioUrl,
                    msg: `${song.name} - ${song.artist}`,
                });
            } else {
                await sender.reply(`🎵 ${song.name}\n歌手：${song.artist}\n专辑：${song.album}\n\n该歌曲受版权限制无法直接发送音频，请点击试听：\nhttps://music.163.com/#/song?id=${song.id}`);
            }
        } catch (error) {
            console.error('[音乐播放器] 搜索失败:', error.message);
            await sender.reply(`❌ 播放失败：${error.message}`);
        }
        return;
    }

    if (cmd === '暂停' || cmd === '停止') {
        await sender.reply('⏹️ 本插件按单曲发送，不维护播放队列；发送「播放 歌名」可点播下一首');
        return;
    }
    if (cmd === '下一首' || cmd === '上一首' || cmd.match(/^音量/)) {
        await sender.reply('ℹ️ 当前为单曲点播模式，暂不支持播放队列和音量控制');
        return;
    }
};
