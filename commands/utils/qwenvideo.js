import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'

class QwenImage {
constructor() {
this.headers = {
accept: '/',
'accept-encoding': 'gzip, deflate, br',
'accept-language': 'en-US,en;q=0.9',
authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3NTI0YWVhLTNjMjEtNDgwMi05YWY0LTdjZThkNmEwZTE3MSIsImV4cCI6MTc1MDA5MTA2OX0.sDC1jJ4WPlyGzgVi6x6m4vQ31miAOxa1MedflPNKG38',
'bx-v': '2.5.28',
'content-type': 'application/json',
cookie: '_gcl_aw=GCL.1744865954.EAIaIQobChMI04zMmaTejAMVibpLBR0vgx8VEAAYASAAEgK8aPD_BwE; _gcl_gs=2.1.k1$i1744865952$u64539133; _gcl_au=1.1.1153047962.1744865954; _bl_uid=7jmmh9e2ksXwg25g02g8jXsjmn64; acw_tc=0a03e55a17474990039571388e56a2dd601a641b88c7c4cf572eed257291c4; x-ap=ap-southeast-5; token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3NTI0YWVhLTNjMjEtNDgwMi05YWY0LTdjZThkNmEwZTE3MSIsImV4cCI6MTc1MDA5MTA3OH0.W87CVNXvRVE2ZZ2SaAGAThhRC0Ro_4vnENwoXxfC698; ssxmod_itna=Yqfx0D9DBAeeT4eIqmq4iu0xYTxewDAQDXDUdnq7U=GcD8OD0PO+6r5GkUnEAQ05Gq0Q45omR=DlgG0AiDCuPGfDQcYHOQQbhi5YzB7Oi3tK122GmqTst=+x3b8izRu4adC0=6D74i8Nxi1DG5DGexDRxikD7v4pE0YDeeDtx0rlxirP4D3DeaGrDDkDQKDXEA+D0bhbUx+iO8vDiPD=xi3PzD4j40TDD5W7F7IWaAiuCkbF8fEDCIAhWYDoZeE2noAwz8fytRDHmeBwAPCmdyyYYexeGD4BirrSYnwBiDtBCw/pEa6msTOUGOlRY79u+KcjFQ9R=+uCzYSe4iiGx8v4G5qu2tUiNG0w/RYYiN0DiYGzYGDD; ssxmod_itna2=Yqfx0D9DBAeeT4eIqmq4iu0xYTxewDAQDXDUdnq7U=GcD8OD0PO+6r5GkUnEAQ05Gq0Q45omRYD==R0YwKQGnxGae+O80xTODGNqT1iDyWeKWG1DP4CEKzCguiCBPQ+ytntiBGxjLwGQlDw4hATY4AY0dIRv/AS0er0hPdwUxW7r4U72xbAifUQude8L4VRfuUmD0/gufFDLKI45mQ7GQUDx9AB4XCAR0W7md7f7huOvdSx4P/pG+k4+re9DxD; SERVERID=c6e9a4f4599611ff2779ff17d05dde80|1747499111|1747499003; tfstk=gJZsWaZHGrsngaovhVXEFMViEDoX59Sy6KMYE-KwHcntGKN4eqHwbO4bRSPs6lot6BHjIAhxHnetGmNrHVKxkh3bAAkjHdet6DdLaSYOIVHx9pHiXq4Zgfljc-V5L_SP4R2imcCPagoivBStqhLvDIuppYojBzxEkO2immCFsrBzxRVi6QFaBmBIvxMtBm3tH2BIhYGxDf3v9eH-9mnxMVhppxkSBCLtk9wKtxnxMS3OdDhnHeCNlvISZR6i-qIseK6gQXtvDkMCdbyswvcQAAgsXyhBDYrICVG8QutYbQM7PkgzWOQt9l28uo3pd9n0LzNbkJBWyjaaUlgSciOSKyeujre1A_etfXmtEy1Wjcy7J8qimK8ibzyzm4EOfQcErxwSAkCpxjz8eDsrS3lWUXLXofKxdbWCdEYme5JLx5-2leutKvvNd9T4KVHndbWCdEYmWvD3u96BuJf..; isg=BBAQ2i6nTLt-yhCXMHk2N4Wb4Vxi2fQjOuiJTgrh1Ws-RaLvsOi0sns7GFMA1az7',
host: 'chat.qwen.ai',
origin: 'https://chat.qwen.ai',
referer: 'https://chat.qwen.ai/',
'sec-ch-ua': '"Chromium";v="137", "Not/A)Brand";v="24"',
'sec-ch-ua-mobile': '?1',
'sec-ch-ua-platform': '"Android"',
'sec-fetch-dest': 'empty',
'sec-fetch-mode': 'cors',
'sec-fetch-site': 'same-origin',
source: 'h5',
'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
version: '0.0.101',
'x-request-id': uuidv4()
}
}

async getTask(prompt, size, type) {
const resp = await axios.post('https://chat.qwen.ai/api/chat/completions', {
stream: false,
chat_type: type,
sub_chat_type: type,
model: 'qwen3-235b-a22b',
size,
messages: [{ role: 'user', content: prompt }],
session_id: uuidv4(),
chat_id: uuidv4(),
id: uuidv4()
}, {
headers: this.headers
})

if (resp.status !== 200) throw new Error('Gagal mendapatkan task.')
return resp.data.messages[1].extra.wanx.task_id

}

async checkTask(id) {
while (true) {
const { data } = await axios.get(`https://chat.qwen.ai/api/v1/tasks/status/${id}`, {
headers: this.headers
})
if (data.task_status === 'running') {
await new Promise(res => setTimeout(res, 1000))
continue
}
if (data.task_status === 'success') return data.content
throw new Error('Gagal menyelesaikan task')
}
}

async create(prompt, { size = '1:1', type = 't2v' } = {}) {
const allowedSize = ['1:1', '3:4', '4:3', '16:9', '9:16']
const allowedType = ['t2i', 't2v']

if (!prompt) throw new Error('Prompt tidak boleh kosong')
if (!allowedSize.includes(size)) throw new Error(`Ukuran hanya boleh: ${allowedSize.join(', ')}`)
if (!allowedType.includes(type)) throw new Error(`Tipe hanya boleh: ${allowedType.join(', ')}`)

const id = await this.getTask(prompt, size, type)
const result = await this.checkTask(id)
return result

}
}

export default {
command: ['qwen'],
category: 'ai',
run: async (client, m, args, usedPrefix, command) => {
const text = args.join(' ').trim()

if (!text.includes('|')) {
return m.reply('《✧》 Formato incorrecto.\nEjemplo:\n.qwen video|prompt\n.qwen image|prompt')
}

const [mode, ...rest] = text.split('|')
const prompt = rest.join('|').trim()
const type = mode.toLowerCase().includes('video') ? 't2v' : 't2i'

const qwen = new QwenImage()


try {
const result = await qwen.create(prompt, { type })
await client.sendMessage(m.chat, {
[type === 't2i' ? 'image' : 'video']: { url: result },
caption: `*Qwen AI - ${type === 't2i' ? 'Image' : 'Video'}*\nPrompt: ${prompt}`
}, { quoted: m })
} catch (e) {
await m.reply('《✧》 Error al obtener resultado de Qwen.\n' + e.message)
}
}
}