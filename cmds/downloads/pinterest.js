import fetch from 'node-fetch'

export default {
  command: ['pinterest', 'pin'],
  category: 'downloads',
  description: 'Buscar y descarga imágenes y videos de Pinterest.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const text = args.join(' ')
    const isPinterestUrl = /^https?:\/\//.test(text)

    if (!text) {
      return msg.reply('《✧》 Por favor, ingresa un término de búsqueda o un enlace de Pinterest.')
    }

    try {
      if (isPinterestUrl) {
        const data = await getPinterestDownload(text)

        if (!data) return msg.reply('ꕥ No se pudo obtener el contenido.')

        const caption = `ㅤ۟∩　ׅ　★　ׅ　🅟𝖨𝖭 🅓ownload　ׄᰙ　\n\n${data.title ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Título* › ${data.title}\n` : ''}${data.description ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Descripción* › ${data.description}\n` : ''}${data.author ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Autor* › ${data.author}\n` : ''}${data.username ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Usuario* › ${data.username}\n` : ''}${data.followers ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Seguidores* › ${data.followers}\n` : ''}${data.uploadDate ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Fecha* › ${data.uploadDate}\n` : ''}${data.likes ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Likes* › ${data.likes}\n` : ''}${data.comments ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Comentarios* › ${data.comments}\n` : ''}${data.views ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Vistas* › ${data.views}\n` : ''}${data.saved ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Guardados* › ${data.saved}\n` : ''}${data.format ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Formato* › ${data.format}\n` : ''}𖣣ֶㅤ֯⌗ ☆  ⬭ *Enlace* › ${text}`

        if (data.type === 'video') {
          await sock.sendMessage(
            msg.chat,
            {
              video: { url: data.url },
              caption,
              mimetype: 'video/mp4',
              fileName: data.filename || 'pin.mp4'
            },
            { quoted: msg }
          )
        } else if (data.type === 'image') {
          await sock.sendMessage(
            msg.chat,
            {
              image: { url: data.url },
              caption
            },
            { quoted: msg }
          )
        } else {
          throw new Error('Contenido no soportado.')
        }
      } else {
        const results = await getPinterestSearch(text)

        if (!results || results.length === 0) {
          return msg.reply(`《✧》 No se encontraron resultados para *${text}*.`)
        }

        const medias = results
          .slice(0, 10)
          .filter(r => r.image)
          .map(r => ({
            type: r.type === 'video' ? 'video' : 'image',
            data: { url: r.image },
            caption: `ㅤ۟∩　ׅ　★　ׅ　🅟𝖨𝖭 🅢earch　ׄᰙ　\n\n${r.title ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Título* › ${r.title}\n` : ''}${r.description ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Descripción* › ${r.description}\n` : ''}${r.name ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Autor* › ${r.name}\n` : ''}${r.username ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Usuario* › ${r.username}\n` : ''}${r.followers ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Seguidores* › ${r.followers}\n` : ''}${r.likes ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Likes* › ${r.likes}\n` : ''}${r.created_at ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Fecha* › ${r.created_at}\n` : ''}${r.url ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Enlace* › ${r.url}\n` : ''}`
          }))

        if (!medias.length) {
          return msg.reply(`《✧》 No se pudieron obtener descargas válidas para *${text}*.`)
        }

        await sock.sendAlbumMessage(msg.chat, medias, { quoted: msg })
      }
    } catch (e) {
      await msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`)
    }
  }
}

async function getPinterestDownload(url) {
  const endpoint = `https://fare.ink/dl/pin?url=${encodeURIComponent(url)}`

  try {
    const res = await fetchJson(endpoint)

    if (!res.status || !res.resultado?.url) return null

    const data = res.resultado
    const filename = data.filename || ''
    const mediaUrl = data.url || ''
    const isVideo = /\.mp4(?:$|\?)/i.test(filename) || /\.mp4(?:$|\?)/i.test(mediaUrl)
    const ext = filename.split('.').pop() || (isVideo ? 'mp4' : 'jpg')

    return {
      type: isVideo ? 'video' : 'image',
      id: data.id || null,
      title: data.titulo || null,
      description: null,
      author: data.autor || null,
      username: null,
      followers: null,
      uploadDate: null,
      likes: null,
      comments: null,
      views: null,
      saved: null,
      format: ext,
      url: mediaUrl,
      thumbnail: data.thumbnail || mediaUrl,
      filename: filename || `pinterest.${ext}`
    }
  } catch {
    return null
  }
}

async function getPinterestSearch(query) {
  const endpoint = `https://fare.ink/search/pin?q=${encodeURIComponent(query)}&limit=20`

  try {
    const res = await fetchJson(endpoint)

    if (!res.status || !Array.isArray(res.results) || !res.results.length) return []

    return res.results
      .filter(d => d?.descarga)
      .map(d => {
        const tipo = String(d.tipo || '').toLowerCase()
        const descarga = d.descarga || null
        const isVideo = tipo === 'video' || /\.mp4(?:$|\?)/i.test(descarga || '')

        return {
          type: isVideo ? 'video' : 'image',
          title: d.titulo || null,
          description: null,
          name: d.autor || null,
          username: null,
          followers: null,
          likes: d.likes || null,
          created_at: null,
          image: descarga,
          url: d.url || null,
          source: d.url || null
        }
      })
  } catch {
    return []
  }
}

async function fetchJson(url, timeout = 30000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'
      }
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }

    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}