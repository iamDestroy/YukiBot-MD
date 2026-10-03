import { normalizeJid, resolveParticipantJid, resolveJidSync, deleteCachedMeta, getCachedMeta, setCachedMeta } from '#serialize';
import chalk from 'chalk';
import moment from 'moment-timezone';
import db from '#db';

function getGroupAdmins(participants) {
  return (participants ?? []).filter(p => p.admin === 'admin' || p.admin === 'superadmin').map(p => p.id).filter(Boolean);
}

function resolveEventParticipant(p, sock) {
  if (typeof p === 'string') return resolveJidSync(p, sock) || p;
  return resolveParticipantJid(p, sock) || normalizeJid(p.id || p.phoneNumber || p.jid || p.lid || '') || '';
}

export default async (sock, msg) => {
  sock.ev.on('group-participants.update', async (anu) => {
    try {
      if (['add', 'remove', 'leave', 'promote', 'demote'].includes(anu.action)) {
        deleteCachedMeta(anu.id);
      }
      const metadata = await (async () => {
        const cached = getCachedMeta(anu.id);
        if (cached) return cached;
        for (let i = 0; i < 3; i++) {
          const m = await sock.groupMetadata(anu.id).catch(() => null);
          if (m) { setCachedMeta(anu.id, m); return m; }
          await new Promise(r => setTimeout(r, 1500));
        }
        return null;
      })();
      const groupAdmins = metadata ? getGroupAdmins(metadata.participants) : [];
      const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      const chat = db.getChat(anu.id) || {};
      const settings = db.getSettings(botId) || {};
      const primaryBotId = chat?.primaryBot;
      const now = new Date();
      const colombianTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
      const tiempo = colombianTime.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/,/g, '');
      const tiempo2 = moment.tz('America/Bogota').format('hh:mm A');
      const memberCount = metadata?.participants?.length || 0;
      const isSelf = (settings.self ?? false) || (chat.isMute ?? false);
      if (isSelf) return;
      for (const p of anu.participants) {
        const jid = resolveEventParticipant(p, sock);
        if (!jid) continue;
        const phone = jid.split('@')[0];
        const needsPhoto = metadata && (!primaryBotId || primaryBotId === botId) && ((anu.action === 'add' && chat.welcome) || (['remove', 'leave'].includes(anu.action) && chat.goodbye));
        const pp = needsPhoto ? await sock.profilePictureUrl(jid, 'image').catch(() => 'https://files.yuki-wabot.my.id/cdn/2PVh.jpeg') : null;
        if (anu.action === 'add' && chat?.welcome && (!primaryBotId || primaryBotId === botId)) {
          if (!metadata) continue;
          let caption;
          if (chat.sWelcome && chat.sWelcome.trim() !== '') {
            caption = chat.sWelcome.replace(/@user/g, `@${phone}`).replace(/@group/g, metadata.subject).replace(/@desc/g, metadata.desc || 'Sin descripción').replace(/@members/g, memberCount).replace(/@time/g, `${tiempo} ${tiempo2}`);
          } else {
            caption = `╭┈──̇─̇─̇────̇─̇─̇──◯◝\n┊「 *Bienvenido (⁠ ⁠ꈍ⁠ᴗ⁠ꈍ⁠)* 」\n┊︶︶︶︶︶︶︶︶︶︶︶\n┊  *Nombre ›* @${phone}\n┊  *Grupo ›* ${metadata.subject}\n┊┈─────̇─̇─̇─────◯◝\n┊➤ *Usa /menu para ver los comandos.*\n┊➤ *Ahora somos ${memberCount} miembros.*\n┊ ︿︿︿︿︿︿︿︿︿︿︿\n╰─────────────────╯`;
          }
          await sock.sendMessage(anu.id, { image: { url: pp }, caption, mentions: [jid] });
        }
        if ((anu.action === 'remove' || anu.action === 'leave') && chat?.goodbye && (!primaryBotId || primaryBotId === botId)) {
          if (!metadata) continue;
          let caption;
          if (chat.sGoodbye && chat.sGoodbye.trim() !== '') {
            caption = chat.sGoodbye.replace(/@user/g, `@${phone}`).replace(/@group/g, metadata.subject).replace(/@desc/g, metadata.desc || 'Sin descripción').replace(/@members/g, memberCount).replace(/@time/g, `${tiempo} ${tiempo2}`);
          } else {
            caption = `╭┈──̇─̇─̇────̇─̇─̇──◯◝\n┊「 *Hasta pronto (⁠╥⁠﹏⁠╥⁠)* 」\n┊︶︶︶︶︶︶︶︶︶︶︶\n┊  *Nombre ›* @${phone}\n┊  *Grupo ›* ${metadata.subject}\n┊┈─────̇─̇─̇─────◯◝\n┊➤ *Ojalá que vuelva pronto.*\n┊➤ *Ahora somos ${memberCount} miembros.*\n┊ ︿︿︿︿︿︿︿︿︿︿︿\n╰─────────────────╯`;
          }
          await sock.sendMessage(anu.id, { image: { url: pp }, caption, mentions: [jid] });
        }
        if (anu.action === 'remove' || anu.action === 'leave') {
          const user = db.getChatUser(anu.id, jid);
          if (user && typeof user.afk === 'number' && user.afk > -1) {
            db.setChatUser(anu.id, jid, 'afk', -1);
            db.setChatUser(anu.id, jid, 'afkReason', '');
          }
        }
        if (anu.action === 'promote' && chat?.alerts && (!primaryBotId || primaryBotId === botId)) {
          const authorJid = normalizeJid(anu.author) || anu.author;
          await sock.sendMessage(anu.id, { text: `「✎」 *@${phone}* ha sido promovido a Administrador por *@${authorJid.split('@')[0]}.*`, mentions: [jid, authorJid, ...groupAdmins] });
        }
        if (anu.action === 'demote' && chat?.alerts && (!primaryBotId || primaryBotId === botId)) {
          const authorJid = normalizeJid(anu.author) || anu.author;
          await sock.sendMessage(anu.id, { text: `「✎」 *@${phone}* ha sido degradado de Administrador por *@${authorJid.split('@')[0]}.*`, mentions: [jid, authorJid, ...groupAdmins] });
        }
      }
    } catch (err) {
      console.log(chalk.gray(`[ EVENT ERROR ]  → ${err}`));
    }
  });
};
