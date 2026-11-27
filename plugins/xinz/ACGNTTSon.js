/** 
 * @author Aming
 * @name ACGNTTSon
 * @team xinz
 * @version 1.0.1
 * @description A plugin for handling ACGN TTS functionalities.
 * @rule ^(生成音频|获取角色列表|检查token) ([^ \n]+)$
 * @admin true
 * @public false
 * @priority 1
 * @disable false
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
sysMethod.testModule(['fluent-ffmpeg'], { install: true });
const ffmpeg = require('fluent-ffmpeg');

/* 配置：TTS 服务地址与 Token 由用户在面板填写，源码不留明文 */
const jsonSchema = BncrCreateSchema.object({
    baseUrl: BncrCreateSchema.string()
        .setTitle('TTS 服务地址')
        .setDescription('ACGN TTS 服务的 baseUrl，例如 https://example.com/flashsummary')
        .setDefault('https://api.ttson.cn/flashsummary'),
    token: BncrCreateSchema.string()
        .setTitle('Token')
        .setDescription('服务访问 Token')
        .setDefault('')
});

const ConfigDB = new BncrPluginConfig(jsonSchema);

class ACGNTTSon {
    constructor(baseUrl, token, tempDirPath) {
        this.baseUrl = baseUrl;
        this.tempDirPath = tempDirPath;
        this.token = token;
        this.characterList = null;
    }

    setToken(token) {
        this.token = this._extractToken(token);
    }

    _extractToken(token) {
        if (token.includes("http")) {
            return token.split("=")[1];
        }
        return token;
    }

    async checkToken() {
        if (!this.token) {
            throw new Error("未设置Token。请使用set_token方法设置Token。");
        }

        const url = `${this.baseUrl}/getTokenData?token=${this.token}`;
        const headers = {
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0"
        };

        const response = await axios.get(url, { headers });
        if (response.status === 200) {
            return `Token有效，您的会员将于 ${response.data.data.expiry_date} 到期。`;
        } else {
            return `Token（${this.token}）` + response.data;
        }
    }

    async generateAudio(text, characterId) {
        if (!this.token) {
            throw new Error("未设置Token。请使用set_token方法设置Token。");
        }

        const audioUrl = await this._getAudioUrl(text, characterId);
        if (audioUrl) {
            const fileName = audioUrl.split('/').pop().split('.')[0].slice(0, 8);
            const savePath = path.join(this.tempDirPath, `${fileName}.mp3`);
            if (await this._downloadAudio(audioUrl, savePath)) {
                return await this._convertToSilk(savePath);
            }
        }
        return null;
    }

    async getCharacterList(filePath = null) {
        const url = `${this.baseUrl}/voices?language=zh-CN&tag_id=1`;
        const headers = {
            "User-Agent": "Mozilla/5.0"
        };

        const response = await axios.get(url, { headers });
        if (response.status === 200) {
            this.characterList = this._processCharacters(response.data.data);
            if (filePath) {
                if (!fs.existsSync(filePath)) {
                    fs.mkdirSync(filePath, { recursive: true });
                }
                this._saveData(path.join(filePath, 'acgn_ttson_character_list.json'), this.characterList);
            }
            return this.characterList;
        } else {
            throw new Error(`获取角色列表失败: ${response.status}`);
        }
    }

    async _convertToSilk(mp3Path) {
        const silkPath = mp3Path.replace('.mp3', '.silk');
        return new Promise((resolve, reject) => {
            ffmpeg(mp3Path)
                .toFormat('silk')
                .on('end', () => {
                    resolve(silkPath);
                })
                .on('error', (err) => {
                    reject(`转换失败: ${err.message}`);
                })
                .save(silkPath);
        });
    }

    async _getAudioUrl(text, voiceId) {
        if (!this.token) {
            throw new Error("未设置Token。请使用set_token方法设置Token。");
        }

        const url = `${this.baseUrl}/tts?token=${this.token}`;
        const payload = {
            voice_id: voiceId,
            text: text,
            format: "mp3",
            to_lang: "auto",
            auto_translate: 0,
            voice_speed: "0%",
            speed_factor: 1,
            rate: "1.0",
            client_ip: "ACGN",
            emotion: 1
        };

        const response = await axios.post(url, payload, {
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0"
            }
        });

        if (response.status === 200) {
            return `${response.data.url}:${response.data.port}/flashsummary/retrieveFileData?stream=True&token=${this.token}&voice_audio_path=${response.data.voice_path}`;
        } else {
            throw new Error(await response.data);
        }
    }

    async _downloadAudio(url, savePath) {
        try {
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            if (response.status === 200) {
                fs.writeFileSync(savePath, response.data);
                return true;
            } else {
                throw new Error(`下载音频出错: ${response.status}`);
            }
        } catch (error) {
            throw new Error(`下载音频出错: ${error.message}`);
        }
    }

    _processCharacters(data) {
        return data.map(item => ({
            character_name: item.voice_name.split('|')[0],
            id: parseInt(item.id),
            tags: item.tags[0].tag_name
        }));
    }

    _saveData(filePath, data) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 4), { encoding: 'utf-8' });
    }

    async updateUserPreference(userId, characterId) {
        if (this.characterList === null) {
            throw new Error("角色列表尚未加载。请先加载角色列表。");
        }

        const character = this.characterList.find(char => char.id === characterId);
        if (!character) {
            throw new Error(`在角色列表中未找到角色 ID ${characterId}。`);
        }

        const userPreferencesFile = path.join(this.tempDirPath, `userData_${userId}.json`);
        let preferences = {};

        if (fs.existsSync(userPreferencesFile)) {
            try {
                preferences = JSON.parse(fs.readFileSync(userPreferencesFile, { encoding: 'utf-8' }));
            } catch (e) {
                console.error('偏好文件解析失败，已重置:', e.message);
                preferences = {};
            }
        }

        preferences.acgn_ttson = {
            character_id: characterId,
            character_name: character.character_name
        };

        fs.writeFileSync(userPreferencesFile, JSON.stringify(preferences, null, 4), { encoding: 'utf-8' });
        return `用户 ${userId} 的偏好已保存为：角色 ${character.character_name}（ID：${characterId}）`;
    }
}

// Export the plugin function
module.exports = async (sender) => {
    await ConfigDB.get();
    console.log("ACGNTTSon 插件已加载");

    const { baseUrl, token } = ConfigDB.userConfig;
    if (!baseUrl) {
        return await sender.reply('请先在插件配置中填写 TTS 服务地址。');
    }
    const tempDirPath = sender.temp_dir_path || path.join(os.tmpdir(), 'acgn_ttson');
    const acgnTTSon = new ACGNTTSon(baseUrl, token, tempDirPath);
    const command = sender.getMsg();
    console.log("接收到的命令:", command);

    try {
        if (command.startsWith('生成音频')) {
            const text = command.split(' ').slice(1).join(' ');
            console.log("生成音频文本:", text);
            const audioPath = await acgnTTSon.generateAudio(text, sender.getUserId());
            await sender.reply(`音频生成成功: ${audioPath}`);
        } else if (command.startsWith('获取角色列表')) {
            const characters = await acgnTTSon.getCharacterList();
            await sender.reply(`角色列表: ${JSON.stringify(characters)}`);
        } else if (command.startsWith('检查token')) {
            const tokenResponse = await acgnTTSon.checkToken();
            await sender.reply(tokenResponse);
        } else {
            await sender.reply("无效的命令，请使用: 生成音频 <文本>, 获取角色列表, 或 检查token <token>");
        }
    } catch (error) {
        console.error("处理命令时出错:", error);
        await sender.reply(`处理命令时出错: ${error.message}`);
    }

    return 'next'; // Continue to next plugin
};
