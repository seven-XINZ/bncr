/**
 * @author OpenClaw
 * @name 猜歌游戏
 * @team xinz
 * @origin 娱乐
 * @version 1.0.0
 * @description 猜歌名游戏，发送歌词猜歌名，支持积分排行
 * @platform qqBot wxKeAImao wxQianxun
 * @rule ^(开始猜歌 | 猜歌游戏)$
 * @rule ^(猜歌答案 | 公布答案)$
 * @rule ^(猜歌排行 | 猜歌排名)$
 * @priority 100
 * @disable false
 * @admin false
 * @public false
 */

const currentGame = new Map(); // 存储各群的游戏状态
const scores = new Map(); // 存储用户积分

// 歌曲库（示例，实际可以扩展）
const songLibrary = [
    { lyrics: '你是我的小呀小苹果', answer: '小苹果', artist: '筷子兄弟' },
    { lyrics: '我们一起学猫叫', answer: '学猫叫', artist: '小潘潘' },
    { lyrics: '孤勇者 谁在黑暗中发光', answer: '孤勇者', artist: '陈奕迅' },
    { lyrics: '青花瓷 素胚勾勒出青花', answer: '青花瓷', artist: '周杰伦' },
    { lyrics: '七里香 窗外的麻雀', answer: '七里香', artist: '周杰伦' },
    { lyrics: '告白气球 亲爱的', answer: '告白气球', artist: '周杰伦' },
    { lyrics: '十年 十年之前', answer: '十年', artist: '陈奕迅' },
    { lyrics: '晴天 故事的小黄花', answer: '晴天', artist: '周杰伦' },
    { lyrics: '海阔天空 今天哭得', answer: '海阔天空', artist: 'Beyond' },
    { lyrics: '夜空中最亮的星', answer: '夜空中最亮的星', artist: '逃跑计划' }
];

module.exports = async sender => {
    const cmd = sender.getMsg();
    const groupId = sender.getGroupId();
    const db = new BncrDB('game');
    
    // 开始猜歌游戏
    if (cmd === '开始猜歌' || cmd === '猜歌游戏') {
        if (currentGame.has(groupId)) {
            const game = currentGame.get(groupId);
            await sender.reply(`🎵 当前游戏进行中！\n歌词：${game.lyrics}\n已用时：${Math.floor((Date.now() - game.startTime) / 1000)}秒`);
            return;
        }
        
        // 随机选择一首歌
        const song = songLibrary[Math.floor(Math.random() * songLibrary.length)];
        
        currentGame.set(groupId, {
            song: song,
            startTime: Date.now(),
            answered: false
        });
        
        await sender.reply(`🎮 猜歌游戏开始！\n\n📝 歌词：${song.lyrics}\n\n第一个猜对的用户获得 10 积分！\n输入"猜歌答案"查看答案`);
        return;
    }
    
    // 公布答案
    if (cmd === '猜歌答案' || cmd === '公布答案') {
        const game = currentGame.get(groupId);
        if (!game) {
            await sender.reply('❌ 当前没有进行中的猜歌游戏\n输入"开始猜歌"开始游戏');
            return;
        }
        
        await sender.reply(`🎵 答案是：${game.song.answer}\n歌手：${game.song.artist}`);
        currentGame.delete(groupId);
        return;
    }
    
    // 查看排行
    if (cmd === '猜歌排行' || cmd === '猜歌排名') {
        const userScores = await db.get('guess_song_scores', {});
        const sorted = Object.entries(userScores)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        if (sorted.length === 0) {
            await sender.reply('🏆 暂无排名数据\n快来玩猜歌游戏吧！');
            return;
        }
        
        let reply = '🏆 猜歌排行榜 🏆\n\n';
        sorted.forEach(([name, score], index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            reply += `${medal} ${name}: ${score}分\n`;
        });
        
        await sender.reply(reply);
        return;
    }
    
    // 检查是否是猜歌答案（用户回复）
    if (currentGame.has(groupId)) {
        const game = currentGame.get(groupId);
        if (!game.answered && !cmd.includes('猜歌')) {
            // 用户可能在猜答案
            const userAnswer = cmd.trim();
            
            if (userAnswer === game.song.answer || 
                userAnswer.includes(game.song.answer) ||
                game.song.answer.includes(userAnswer)) {
                
                game.answered = true;
                const userId = sender.getUserId();
                const userName = sender.getUserName();
                
                // 记录积分
                const userScores = await db.get('guess_song_scores', {});
                userScores[userName] = (userScores[userName] || 0) + 10;
                await db.set('guess_song_scores', userScores);
                
                const timeUsed = Math.floor((Date.now() - game.startTime) / 1000);
                
                await sender.reply(`🎉 恭喜你猜对了！\n🎵 歌曲：${game.song.answer}\n👤 歌手：${game.song.artist}\n⏱️ 用时：${timeUsed}秒\n🏆 获得：10 积分\n\n输入"开始猜歌"继续游戏`);
                
                currentGame.delete(groupId);
            }
        }
    }
};
