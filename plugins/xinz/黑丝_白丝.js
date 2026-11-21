/**
 * @author Masato
 * @name 黑丝_白丝
 * @team xinz
 * @origin Masato
 * @version 1.0.2
 * @description 黑丝白丝图片
 * @rule ^([\s\S]+)丝$
 * @admin false
 * @public false
 * @priority 9999
 * @disable false
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
