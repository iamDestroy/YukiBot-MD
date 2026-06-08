import yts from 'yt-search'
import fetch from 'node-fetch'
import { extractImageThumb } from 'baileys'

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
          views = Number(video_info.views || 0).toLocaleString('es-HN')
          published = video_info.ago || 'Desconocido'

          const info_message = `➩ Descargando › *${title}*

> ❖ Canal › *${channel}*
> ⴵ Duración › *${duration}*
> ❀ Vistas › *${views}*
> ✩ Publicado › *${published}*
> ❒ Calidad › *${download_quality}*
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
        return msg.reply('《✧》No se encontro un video válido de YouTube.')
      }

      let video = null

      try {
        video = await getVideoFromYoutubei(url)
      } catch (e) {
        return msg.reply(`《✧》No se pudo descargar el *video*, intenta más tarde.\n> ${e.message}`)
      }

      if (!video?.url) {
        return msg.reply('《✧》No se pudo descargar el *video*, intenta más tarde.')
      }

      title = video.title || title
      channel = video.channel || channel
      duration = video.duration || duration

      const final_video_id = video.video_id || getVideoId(url)
      thumbnail = thumbnail || video.thumbnail || makeYoutubeThumbnail(final_video_id)

      const file_size = video.size_bytes || parseFileSize(video.size)
      const size_text = file_size ? formatBytes(file_size) : (video.size || 'Desconocido')
      const send_as_document = file_size ? file_size > max_video_size : false
      const file_name = sanitizeFileName(video.filename || video.title || title) + '.mp4'

      const caption = `乂 *Video descargado*

> ❒ Calidad › *${video.quality || download_quality}*
> ❒ Tamaño › *${size_text}*`

      if (send_as_document) {
        const thumb_buffer = await makeJpegThumbnail(thumbnail, final_video_id).catch(() => null)

        await sendVideoAsDocument(sock, msg, video.url, file_name, caption, thumb_buffer)
        return
      }

      try {
        await sock.sendMessage(msg.chat, {
          video: { url: video.url },
          fileName: file_name,
          mimetype: 'video/mp4',
          caption
        }, { quoted: msg })
      } catch {
        const thumb_buffer = await makeJpegThumbnail(thumbnail, final_video_id).catch(() => null)

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

const download_quality = '360p'
const max_video_size = 68 * 1024 * 1024

const youtubei = {
  endpoint: 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
  visitor_id:
    'Cgs4ZmxfcDk4Vnk0VSjLvdrQBjIKCgJJRBIEGgAgXmLfAgrcAjE4LllUPWNsWWh5eHVVeE04N1AzV0tnZzZJeFpkV3lGOEVRNnJaei1DQ3hRTkdHV1NFcjg1MmpVQmZ6UzMtOE5zTVVSZ3EzbHFXUHFRZERyV0M3a2g2TlFEdUZybmJRbjkyc1JGVGxVd3MyZG5RMmFmVG95TlJnTXJReTdMNlRTOEVqcTFhaW5OQnJhOU9uRnJRa01IOGpVTzdiR3UwQVpqdjI0UURqNkdmeE1VcWVZc184cGxfOUNNVExVRG9HQ09sa1NPOUVHZG5CcWdUVzVRZ080OGRyQWxDeVRHUF9MRnhBNjVYZVVRR1FBeGxmU0ZSckhhRHI0cDROLWV2cmp0VDdEc3pKU3Q1clhSYkNmWWQ0YjJqbFN5NVh0ejMyajk5NWdkSGhLU1htcTcydHNGeDNUOW5xZXQ3UlZvV2JNbmNGWDBKTldqbXZyQzg0VHhqY1hCVFlnQ2dLQQ==',
  client_name: 'ANDROID_VR',
  client_version: '1.65.10',
  itag: 18
}

const defaults = {
  user_agent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
}

const headers = {
  image() {
    return {
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'user-agent': defaults.user_agent
    }
  }
}

const isYTUrl = (url = '') =>
  /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/i.test(url)

const getVideoId = (text = '') => {
  const raw = String(text || '').trim()

  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) {
    return raw
  }

  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/
  ]

  for (const pattern of patterns) {
    const match = raw.match(pattern)

    if (match?.[1]) {
      return match[1]
    }
  }

  return null
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

async function getVideoFromYoutubei(url) {
  const video_id = getVideoId(url)

  if (!video_id) {
    throw new Error('No se encontró un video_id válido')
  }

  const response = await fetch(youtubei.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Visitor-Id': youtubei.visitor_id
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: youtubei.client_name,
          clientVersion: youtubei.client_version
        }
      },
      videoId: video_id
    })
  })

  const text = await response.text()

  if (!response.ok) {
    throw new Error(`YouTube player HTTP ${response.status}: ${text.slice(0, 300)}`)
  }

  let json = null

  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Respuesta JSON inválida: ${text.slice(0, 300)}`)
  }

  const formats = json?.streamingData?.formats || []
  const stream = formats.find(item => Number(item?.itag) === youtubei.itag && item?.url)

  if (!stream?.url) {
    const status = json?.playabilityStatus?.status || 'UNKNOWN'
    const reason = json?.playabilityStatus?.reason || 'Sin razón'
    throw new Error(`No se encontró URL directa con itag ${youtubei.itag}. Estado: ${status}. ${reason}`)
  }

  const size_bytes =
    parseFileSize(stream.contentLength) ||
    await getRemoteFileSize(stream.url).catch(() => null)

  return {
    url: stream.url,
    title: json?.videoDetails?.title || null,
    channel: json?.videoDetails?.author || null,
    thumbnail: makeYoutubeThumbnail(video_id),
    duration: json?.videoDetails?.lengthSeconds
      ? formatDuration(Number(json.videoDetails.lengthSeconds))
      : null,
    video_id,
    filename: json?.videoDetails?.title || video_id,
    quality: stream.qualityLabel || download_quality,
    format: 'mp4',
    size: size_bytes ? formatBytes(size_bytes) : null,
    size_bytes,
    source: `https://youtu.be/${video_id}`,
    view: null
  }
}

async function getRemoteFileSize(url) {
  const response = await fetch(url, {
    method: 'HEAD',
    headers: {
      'user-agent': defaults.user_agent
    }
  })

  const length = response.headers.get('content-length')
  const bytes = Number(length)

  return Number.isFinite(bytes) && bytes > 0 ? bytes : null
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

async function makeJpegThumbnail(thumbnail, video_id) {
  const urls = [
    thumbnail,
    makeYoutubeThumbnail(video_id, 'maxresdefault'),
    makeYoutubeThumbnail(video_id, 'hqdefault'),
    makeYoutubeThumbnail(video_id, 'mqdefault')
  ].filter(Boolean)

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: headers.image()
      })

      if (!res.ok) {
        continue
      }

      const image_buffer = Buffer.from(await res.arrayBuffer())

      if (!image_buffer.length) {
        continue
      }

      const { buffer } = await extractImageThumb(image_buffer, 300)

      if (buffer?.length) {
        return buffer
      }
    } catch {}
  }

  return null
}

function makeYoutubeThumbnail(video_id, quality = 'hqdefault') {
  if (!video_id) return null
  return `https://i.ytimg.com/vi/${video_id}/${quality}.jpg`
}

async function sendVideoAsDocument(sock, msg, url, fileName, caption, jpegThumbnail) {
  await sock.sendMessage(msg.chat, {
    document: { url },
    mimetype: 'video/mp4',
    fileName,
    caption,
    ...(jpegThumbnail ? {
      jpegThumbnail,
      thumbnailWidth: 300,
      thumbnailHeight: 300
    } : {})
  }, { quoted: msg })
}

function parseFileSize(size) {
  if (size === null || typeof size === 'undefined') return null

  if (typeof size === 'number') {
    return Number.isFinite(size) && size > 0 ? Math.round(size) : null
  }

  const raw = String(size).trim()
  if (!raw) return null

  if (/^\d+$/.test(raw)) {
    const bytes = Number(raw)
    return Number.isFinite(bytes) && bytes > 0 ? bytes : null
  }

  const match = raw.match(/([\d.,]+)\s*(bytes?|b|kb|kib|mb|mib|gb|gib)?/i)
  if (!match) return null

  let value_text = match[1]

  if (value_text.includes(',') && value_text.includes('.')) {
    value_text = value_text.replace(/,/g, '')
  } else {
    value_text = value_text.replace(',', '.')
  }

  const value = Number(value_text)
  if (!Number.isFinite(value) || value <= 0) return null

  const unit = String(match[2] || 'b').toLowerCase()

  const multipliers = {
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

  return Math.round(value * (multipliers[unit] || 1))
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

function formatDuration(seconds = 0) {
  seconds = Math.floor(Number(seconds) || 0)

  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  return `${m}:${String(s).padStart(2, '0')}`
}
