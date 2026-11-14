/**
 * @author Masato
 * @name 黑丝_白丝
 * @team xinz
 * @origin Masato
 * @version 1.0.1
 * @description 黑丝白丝图片
 * @rule ^([\s\S]+)丝$
 * @admin false
 * @public false
 * @priority 9999
 * @disable false
 */

const axios = require('axios').default

module.exports = async s => {
	s.delMsg(s.getMsgId(), { wait: 3})
	let par = encodeURI(s.param(1))
	let res = await axios.request({
		url: "https://api.xn--7gqa009h.top/api/bshs?msg=" + par + "%E4%B8%9D",
		json: true
	})
	console.log(res)
	if(res.data) {
		let title = res.data.bt
		let pic = res.data.url
		await s.reply({
			type: "image",
			path: pic,
			msg: title
		})
	}
	else {
		return await s.reply("接口访问异常~")
	}
}