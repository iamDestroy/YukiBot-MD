import yts from 'yt-search'
import fetch from 'node-fetch'

const cmd = {
  command: ['play2', 'mp4', 'ytmp4', 'ytvideo', 'playvideo'],
  category: 'downloads',
  description: 'Descargar un vídeo de YouTube.',

  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      if (!args[0]) {
        return msg.reply('《✧》Por favor, menciona el nombre o URL del video que deseas descargar')
      }

      const input = args.join(' ').trim()
      const url = await getYoutubeUrl(input)
      const data = await getFareVideo(url)

      if (!data?.status || !data?.descarga?.url) {
        return msg.reply('《✧》No se pudo descargar el *video*, intenta más tarde.')
      }

      const title = data.titulo || 'video'
      const channel = data.canal?.nombre || 'Desconocido'
      const duration = data.duracion || 'Desconocido'
      const views = Number(data.vistas || 0).toLocaleString('es-HN')
      const thumbnail = data.miniatura || null
      const download = data.descarga
      const quality = download.calidad || '360p'
      const file_name = sanitizeFileName(title) + '.mp4'

      const size_bytes =
        parseFileSize(download.tamaño) ||
        await getRemoteFileSize(download.url).catch(() => null)

      const size_text = size_bytes
        ? formatBytes(size_bytes)
        : download.tamaño || 'Desconocido'

      const send_as_document = size_bytes ? size_bytes > max_video_size : false

      const info_message = `➩ Descargando › *${title}*

> ❖ Canal › *${channel}*
> ⴵ Duración › *${duration}*
> ❀ Vistas › *${views}*
> ❒ Calidad › *${quality}*
> ❒ Tamaño › *${size_text}*
> ❒ Enlace › *${url}*`

      if (thumbnail) {
        await sock.sendMessage(msg.chat, {
          image: { url: thumbnail },
          caption: info_message
        }, { quoted: msg })
      } else {
        await msg.reply(info_message)
      }

      const caption = `乂 *Video descargado*

> ❒ Calidad › *${quality}*
> ❒ Tamaño › *${size_text}*`

      if (send_as_document) {
        await sock.sendMessage(msg.chat, {
          document: { url: download.url },
          mimetype: 'video/mp4',
          fileName: file_name,
          caption
        }, { quoted: msg })
        return
      }

      try {
        await sock.sendMessage(msg.chat, {
          video: { url: download.url },
          mimetype: 'video/mp4',
          fileName: file_name,
          caption,
          ...(thumbnail ? { jpegThumbnail: await getThumbnail(thumbnail).catch(() => null) } : {})
        }, { quoted: msg })
      } catch {
        await sock.sendMessage(msg.chat, {
          document: { url: download.url },
          mimetype: 'video/mp4',
          fileName: file_name,
          caption
        }, { quoted: msg })
      }
    } catch (e) {
      await msg.reply(
        `> An unexpected error occurred while executing command *${usedPrefix + command}*.\n> [Error: *${e.message}*]`
      )
    }
  }
}

export default cmd

const api_url = 'https://fare.ink/dl/ytv?url='
const max_video_size = 50 * 1024 * 1024

async function getYoutubeUrl(input) {
  const id = getVideoId(input)

  if (id) return `https://youtu.be/${id}`
  if (isYTUrl(input)) return input

  const search = await yts(input)
  const video = search.videos?.[0] || search.all?.find(v => v.type === 'video')

  if (!video?.url) {
    throw new Error('No se encontró un video válido de YouTube')
  }

  return video.url
}

async function getFareVideo(url) {
  const res = await fetch(api_url + encodeURIComponent(url), {
    headers: {
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0'
    }
  })

  const text = await res.text()

  if (!res.ok) {
    throw new Error(`Fare API HTTP ${res.status}: ${text.slice(0, 200)}`)
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Respuesta inválida de Fare API: ${text.slice(0, 200)}`)
  }
}

async function getRemoteFileSize(url) {
  const head = await fetch(url, {
    method: 'HEAD',
    headers: {
      'user-agent': 'Mozilla/5.0'
    }
  }).catch(() => null)

  let length = head?.headers?.get('content-length')
  let bytes = Number(length)

  if (Number.isFinite(bytes) && bytes > 0) {
    return bytes
  }

  const range = await fetch(url, {
    method: 'GET',
    headers: {
      range: 'bytes=0-0',
      'user-agent': 'Mozilla/5.0'
    }
  }).catch(() => null)

  const content_range = range?.headers?.get('content-range')
  const match = content_range?.match(/\/(\d+)$/)

  if (match?.[1]) {
    bytes = Number(match[1])
    if (Number.isFinite(bytes) && bytes > 0) return bytes
  }

  length = range?.headers?.get('content-length')
  bytes = Number(length)

  return Number.isFinite(bytes) && bytes > 0 ? bytes : null
}

async function getThumbnail(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0'
    }
  })

  if (!res.ok) return null

  const buffer = Buffer.from(await res.arrayBuffer())
  return buffer.length ? buffer : null
}

const isYTUrl = url =>
  /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/i.test(url)

function getVideoId(text = '') {
  const raw = String(text || '').trim()

  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw

  return raw.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/)|[?&]v=)([a-zA-Z0-9_-]{11})/
  )?.[1] || null
}

function sanitizeFileName(name = 'video') {
  return String(name)
    .replace(/\.(mp4|mkv|webm|mov|avi)$/i, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'video'
}

function parseFileSize(size) {
  if (!size) return null

  const raw = String(size).trim()
  const match = raw.match(/([\d.,]+)\s*(bytes?|b|kb|kib|mb|mib|gb|gib)/i)

  if (!match) return null

  let value_text = match[1]

  if (value_text.includes(',') && value_text.includes('.')) {
    value_text = value_text.replace(/,/g, '')
  } else {
    value_text = value_text.replace(',', '.')
  }

  const value = Number(value_text)

  if (!Number.isFinite(value) || value <= 0) return null

  const unit = match[2].toLowerCase()

  const mult = {
    b: 1,
    byte: 1,
    bytes: 1,
    kb: 1024,
    kib: 1024,
    mb: 1024 ** 2,
    mib: 1024 ** 2,
    gb: 1024 ** 3,
    gib: 1024 ** 3
  }

  return Math.round(value * (mult[unit] || 1))
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