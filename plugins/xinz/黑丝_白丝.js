/**
 * @author Masato
 * @name 黑丝_白丝
 * @team xinz
 * @origin Masato
 * @description 黑丝白丝图片
 * @rule ^([\s\S]+)丝$
 * @admin false
 * @public false
 * @priority 9999
 * @disable false
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @updated 2026-11-28
 * @classification ["工具"]
 */

const axios = require('axios').default

const jsonSchema = BncrCreateSchema.object({
    apiBase: BncrCreateSchema.string().setTitle('接口地址').setDefault('https://api.xn--7gqa009h.top'),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

module.exports = async s => {
    await ConfigDB.get();
    const apiBase = (ConfigDB.userConfig && ConfigDB.userConfig.apiBase) || 'https://api.xn--7gqa009h.top';
	s.delMsg(s.getMsgId(), { wait: 3 })
	try {
		const par = encodeURI(s.param(1))
		const res = await axios.request({
			url: `${apiBase}/api/bshs?msg=${par}%E4%B8%9D`,
			timeout: 10000,
			json: true
		})
		if (res.data && res.data.url) {
			await s.reply({ type: 'image', path: res.data.url, msg: res.data.bt || '' })
		} else {
			await s.reply('接口访问异常~')
		}
	} catch (e) {
		console.error('[黑丝_白丝] 请求失败:', e.message)
		await s.reply('接口访问异常~')
	}
}
