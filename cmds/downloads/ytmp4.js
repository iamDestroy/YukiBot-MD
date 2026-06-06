import yts from 'yt-search'
import fetch from 'node-fetch'
import { extractImageThumb } from '@whiskeysockets/baileys'

const cmd = {
  command: ['play2', 'mp4', 'ytmp4', 'ytvideo', 'playvideo'],
  category: 'downloads',
  description: 'Descargar un vídeo de YouTube.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      if (!args[0]) {
        return msg.reply('《✧》Por favor, menciona el nombre o URL del video que deseas descargar')
      }

      const input_text = args.join(' ').trim()
      const video_id = getVideoId(input_text)
      const query = video_id ? `https://youtu.be/${video_id}` : input_text

      let url = query
      let title = 'video'
      let thumbnail = null
      let channel = 'Desconocido'
      let duration = 'Desconocido'
      let views = '0'
      let published = 'Desconocido'

      try {
        const video_info = await getVideoInfo(query, video_id)

        if (video_info) {
          url = video_info.url || `https://youtu.be/${video_info.videoId}`
          title = video_info.title || title
          thumbnail = video_info.image || video_info.thumbnail || null
          channel = video_info.author?.name || video_info.author || 'Desconocido'
          duration = video_info.timestamp || 'Desconocido'
          views = (video_info.views || 0).toLocaleString()
          published = video_info.ago || 'Desconocido'

          const info_message = `➩ Descargando › *${title}*

> ❖ Canal › *${channel}*
> ⴵ Duración › *${duration}*
> ❀ Vistas › *${views}*
> ✩ Publicado › *${published}*
> ❒ Calidad › *${download_quality}p*
> ❒ Enlace › *${url}*`

          if (thumbnail) {
            await sock.sendMessage(msg.chat, {
              image: { url: thumbnail },
              caption: info_message
            }, { quoted: msg })
          } else {
            await msg.reply(info_message)
          }
        }
      } catch {}

      if (!isYTUrl(url)) {
        return msg.reply('《✧》No encontré un video válido de YouTube.')
      }

      const video = await getVideoFromCnv(url)

      if (!video?.url) {
        return msg.reply('《✧》No se pudo descargar el *video*, intenta más tarde.')
      }

      const file_size = await getRemoteFileSize(video.url).catch(() => null)
      const file_name = sanitizeFileName(video.filename || video.title || title) + '.mp4'
      const thumb_buffer = await makeJpegThumbnail(thumbnail).catch(() => null)

      const size_text = file_size ? formatBytes(file_size) : 'Desconocido'
      const send_as_document = file_size ? file_size > max_video_size : false

      const caption = `乂 *Video descargado*

> ❒ Calidad › *${video.quality || `${download_quality}p`}*
> ❒ Tamaño › *${size_text}*`

      if (send_as_document) {
        await sendVideoAsDocument(sock, msg, video.url, file_name, caption, thumb_buffer)
        return
      }

      try {
        await sock.sendMessage(msg.chat, {
          video: { url: video.url },
          fileName: file_name,
          mimetype: 'video/mp4',
          caption,
          ...(thumb_buffer ? { jpegThumbnail: thumb_buffer } : {})
        }, { quoted: msg })
      } catch (e) {
        await sendVideoAsDocument(sock, msg, video.url, file_name, caption, thumb_buffer)
      }

    } catch (e) {
      await msg.reply(
        `> An unexpected error occurred while executing command *${usedPrefix + command}*.\n> [Error: *${e.message}*]`
      )
    }
  }
}

export default cmd

const download_quality = '720'
const max_video_size = 68 * 1024 * 1024

const endpoints = {
  key: 'https://cnv.cx/v2/sanity/key',
  converter: 'https://cnv.cx/v2/converter'
}

const frame = {
  origin: 'https://frame.y2meta-uk.com',
  referer: 'https://frame.y2meta-uk.com/'
}

const defaults = {
  format: 'mp4',
  audio_bitrate: '128',
  filename_style: 'pretty',
  v_codec: 'h264',
  timeout: 45000,
  user_agent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
}

const headers = {
  common() {
    return {
      accept: '*/*',
      origin: frame.origin,
      referer: frame.referer,
      'user-agent': defaults.user_agent,
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'cross-site'
    }
  },

  key() {
    return {
      ...this.common(),
      'content-type': 'application/json'
    }
  },

  converter(key) {
    return {
      ...this.common(),
      key,
      'content-type': 'application/x-www-form-urlencoded'
    }
  }
}

class YtdlCnv {
  constructor(options = {}) {
    this.url = options.url || ''
    this.quality = String(options.quality || download_quality)
    this.timeout = Number(options.timeout || defaults.timeout)
  }

  extractVideoId(input) {
    const text = String(input || '').trim()

    if (/^[a-zA-Z0-9_-]{11}$/.test(text)) {
      return text
    }

    try {
      const url = new URL(text)
      const host = url.hostname.replace(/^www\./, '')

      if (host === 'youtu.be') {
        const id = url.pathname.split('/').filter(Boolean)[0]

        if (/^[a-zA-Z0-9_-]{11}$/.test(id)) {
          return id
        }
      }

      if (host.endsWith('youtube.com')) {
        const id = url.searchParams.get('v')

        if (/^[a-zA-Z0-9_-]{11}$/.test(id || '')) {
          return id
        }

        const match = url.pathname.match(/\/(shorts|embed|live|v)\/([a-zA-Z0-9_-]{11})/)

        if (match) {
          return match[2]
        }
      }
    } catch {}

    const match = text.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/|\/v\/)([a-zA-Z0-9_-]{11})/)

    if (match) {
      return match[1]
    }

    throw new Error('No se encontró un video_id válido de YouTube')
  }

  normalizeUrl(input) {
    const video_id = this.extractVideoId(input)
    return `https://youtu.be/${video_id}`
  }

  async fetchTimeout(url, options = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }
  }

  async parseJson(response) {
    const text = await response.text()

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`)
    }

    try {
      return JSON.parse(text)
    } catch {
      throw new Error(`Respuesta inválida: ${text.slice(0, 300)}`)
    }
  }

  async getKey() {
    const response = await this.fetchTimeout(endpoints.key, {
      method: 'GET',
      headers: headers.key()
    })

    const json = await this.parseJson(response)

    if (!json?.key) {
      throw new Error('La API no devolvió key')
    }

    return json.key
  }

  async convert(input = this.url) {
    const key = await this.getKey()
    const source = this.normalizeUrl(input)

    const body = new URLSearchParams({
      link: source,
      format: defaults.format,
      audioBitrate: defaults.audio_bitrate,
      videoQuality: this.quality,
      filenameStyle: defaults.filename_style,
      vCodec: defaults.v_codec
    })

    const response = await this.fetchTimeout(endpoints.converter, {
      method: 'POST',
      headers: headers.converter(key),
      body
    })

    const json = await this.parseJson(response)

    if (!json?.url) {
      throw new Error('No se recibió url de descarga')
    }

    return {
      status: true,
      result: {
        source,
        quality: `${this.quality}p`,
        format: defaults.format,
        filename: cleanExtension(json.filename || null),
        download: json.url
      }
    }
  }

  async run() {
    try {
      return await this.convert(this.url)
    } catch (error) {
      return {
        status: false,
        error: error.message
      }
    }
  }
}

const isYTUrl = (url = '') =>
  /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/i.test(url)

const getVideoId = (text = '') => {
  const match = text.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/))([a-zA-Z0-9_-]{11})/
  )

  return match?.[1] || null
}

const sanitizeFileName = (name = 'video') =>
  cleanExtension(name)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'video'

function cleanExtension(name = 'video') {
  return String(name || 'video').replace(/\.(mp4|mkv|webm|mov|avi)$/i, '')
}

async function getVideoInfo(input, video_id) {
  if (video_id) {
    try {
      const info = await yts({ videoId: video_id })

      if (info?.videoId) {
        return {
          ...info,
          url: `https://youtu.be/${info.videoId}`,
          image: info.thumbnail || info.image
        }
      }
    } catch {}
  }

  const search = await yts(input)
  const video = search.videos?.[0] || search.all?.find(v => v.type === 'video')

  return video || null
}

async function getVideoFromCnv(url) {
  const client = new YtdlCnv({
    url,
    quality: download_quality
  })

  const res = await client.run()

  if (!res?.status || !res?.result?.download) {
    throw new Error(res?.error || 'API sin resultado válido')
  }

  return {
    url: res.result.download,
    title: res.result.filename || null,
    filename: res.result.filename || null,
    quality: res.result.quality || `${download_quality}p`,
    format: res.result.format || 'mp4',
    source: res.result.source || url
  }
}

async function makeJpegThumbnail(thumbnail) {
  if (!thumbnail) return null

  const res = await fetch(thumbnail, {
    headers: {
      'user-agent': defaults.user_agent
    }
  })

  if (!res.ok) {
    throw new Error(`No se pudo descargar miniatura: HTTP ${res.status}`)
  }

  const image = Buffer.from(await res.arrayBuffer())
  const { buffer } = await extractImageThumb(image, 300)

  return buffer
}

async function getRemoteFileSize(url) {
  const head = await requestFileSize(url, 'HEAD')

  if (head) {
    return head
  }

  return await requestFileSize(url, 'GET')
}

async function requestFileSize(url, method = 'HEAD') {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)

  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        'user-agent': defaults.user_agent,
        ...(method === 'GET' ? { range: 'bytes=0-0' } : {})
      }
    })

    const content_range = res.headers.get('content-range')
    const content_length = res.headers.get('content-length')

    if (typeof res.body?.destroy === 'function') {
      res.body.destroy()
    }

    if (content_range) {
      const match = content_range.match(/\/(\d+)$/)
      const total = Number(match?.[1] || 0)

      if (total > 0) {
        return total
      }
    }

    const length = Number(content_length || 0)

    if (length > 0 && res.status !== 206) {
      return length
    }

    return null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function sendVideoAsDocument(sock, msg, url, fileName, caption, jpegThumbnail) {
  await sock.sendMessage(msg.chat, {
    document: { url },
    mimetype: 'video/mp4',
    fileName,
    caption,
    ...(jpegThumbnail ? { jpegThumbnail } : {})
  }, { quoted: msg })
}

function formatBytes(bytes = 0) {
  if (!bytes || Number.isNaN(bytes)) return 'Desconocido'

  const units = ['B', 'KB', 'MB', 'GB']
  let size = Number(bytes)
  let unit = 0

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit++
  }

  return `${size.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`
}
