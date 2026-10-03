import fetch from 'node-fetch'
import os from 'os';
import { prepareWAMessageMedia } from 'baileys';
import db from '#db';

export function getMemoryStats({
  rssBytes = process.memoryUsage().rss,
  systemTotalBytes = os.totalmem(),
  constrainedBytes = process.constrainedMemory?.() || 0
} = {}) {
  const constrained = Number.isFinite(constrainedBytes) && constrainedBytes > 0 && constrainedBytes < systemTotalBytes;
  const limitBytes = constrained ? constrainedBytes : systemTotalBytes;
  return {
    usedBytes: rssBytes,
    limitBytes,
    percent: limitBytes > 0 ? rssBytes / limitBytes * 100 : 0,
    limitKind: constrained ? 'contenedor' : 'sistema'
  };
}

function formatMemory(bytes) {
  const gb = 1024 ** 3;
  return bytes >= gb ? `${(bytes / gb).toFixed(2)} GB` : `${(bytes / 1048576).toFixed(2)} MB`;
}

export default {
  command: ['infobot', 'botinfo'],
  category: 'main',
  description: 'Obtener información del bot.',
  run: async ({ msg, sock, usedPrefix, command, text }) => {
    const botId = sock.user.id.split(':')[0] + "@s.whatsapp.net";
    const botSettings = db.getSettings(botId) || {};
    const botname = botSettings.botname || 'Bot';
    const namebot = botSettings.namebot || 'Bot';
    const monedas = botSettings.currency || 'Yenes';
    const banner = botSettings.banner || '';
    const prefijo = botSettings.prefix;
    const owner = botSettings.owner || '';
    const canalId = botSettings.newsletter_id || '';
    const canalName = botSettings.nameid || '';
    const link = botSettings.link || '';
    let desar = 'Oculto';

    if (owner && !isNaN(owner.replace(/@s\.whatsapp\.net$/, ''))) {
      const userData = db.getUser(owner);
      desar = userData?.genre || 'Oculto';
    }

    const platform = os.type();
    const now = new Date();
    const colombianTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const nodeVersion = process.version;
    const sistemaUptime = rTime(os.uptime());
    const uptime = process.uptime();
    const uptimeDate = new Date(colombianTime.getTime() - uptime * 1000);
    const formattedUptimeDate = uptimeDate.toLocaleString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).replace(/^./, m => m.toUpperCase());

    const isOficialBot = botId === ((global.sock?.user?.id?.split(':')[0] ?? null) && ((global.sock?.user?.id?.split(':')[0] ?? null) && (global.sock.user.id.split(':')[0] + '@s.whatsapp.net')));
    const botType = isOficialBot ? 'Principal/Owner' : 'Sub Bot';
    const memory = getMemoryStats();
    const ram = `${formatMemory(memory.usedBytes)} / ${formatMemory(memory.limitBytes)} (${memory.percent.toFixed(2)}%)`;

    try {
      const message = `✐ Información del bot *${botname}!*

✿ *Nombre Corto ›* ${namebot}
✿ *Nombre Largo ›* ${botname}
✦ *Moneda ›* ${monedas}
✦ *Prefijo${Array.isArray(prefijo) && prefijo.length > 1 ? 's' : ''} ›* ${prefijo === 1 ? '`sin prefijos`' : (Array.isArray(prefijo) ? prefijo : [prefijo || '/']).map(p => `\`${p}\``).join(', ')}

❒ *Tipo ›* ${botType}
❒ *Plataforma ›* ${platform}
❒ *NodeJS ›* ${nodeVersion}
❒ *RAM Utilizada ›* ${ram}
❒ *Activo desde ›* ${formattedUptimeDate}
❒ *Sistema Activo ›* ${sistemaUptime}
❒ *${desar === 'Hombre' ? 'Dueño' : desar === 'Mujer' ? 'Dueña' : 'Dueño(a)'} ›* ${owner ? (!isNaN(owner.replace(/@s\.whatsapp\.net$/, '')) ? `@${owner.split('@')[0]}` : owner) : "Oculto por privacidad"}`.trim();

      await sock.sendMessage(msg.chat, banner.includes('.mp4') || banner.includes('.webm') ? {
        video: { url: banner },
        gifPlayback: true,
        caption: message.trim(),
        contextInfo: {
          mentionedJid: [owner, msg.sender],
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: canalId,
            serverMessageId: '0',
            newsletterName: canalName
          }
        }
      } : {
        text: message.trim(),
        linkPreview: link && banner ? (await prepareWAMessageMedia({
          image: { url: banner }
        }, {
          upload: sock.waUploadToServer,
          mediaTypeOverride: 'thumbnail-link'
        }).then(({ imageMessage }) => ({
          'canonical-url': link,
          'matched-text': link,
          title: botname,
          description: `${namebot}, mᥲძᥱ ᥕі𝗍һ ᑲᥡ ⁱᵃᵐ|𝔇ĕ𝐬†𝓻⊙γ𒆜`,
          jpegThumbnail: imageMessage?.jpegThumbnail ? Buffer.from(imageMessage.jpegThumbnail) : undefined,
          highQualityThumbnail: imageMessage || undefined
        }))) : undefined,
        contextInfo: {
          mentionedJid: [owner, msg.sender],
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: canalId,
            serverMessageId: '0',
            newsletterName: canalName
          }
        }
      }, { quoted: msg });
    } catch (e) {
      return msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`);
    }
  }
};

function rTime(seconds) {
  seconds = Number(seconds);
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const dDisplay = d > 0 ? d + (d === 1 ? " día, " : " días, ") : "";
  const hDisplay = h > 0 ? h + (h === 1 ? " hora, " : " horas, ") : "";
  const mDisplay = m > 0 ? m + (m === 1 ? " minuto, " : " minutos, ") : "";
  const sDisplay = s > 0 ? s + (s === 1 ? " segundo" : " segundos") : "";
  return dDisplay + hDisplay + mDisplay + sDisplay;
}