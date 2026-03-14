import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import fetch from 'node-fetch';
import exif from '../../lib/exif.js';
const { writeExif } = exif;

export default {
  command: ['sticker', 's'],
  category: 'utils',
  run: async (client, m, args, usedPrefix, command) => {
    try {
      if (args[0] === '-list') {
        let helpText = `ꕥ Lista de Formas y Efectos Disponibles para *imagen*:\n\n✦ *Formas:*\n- -c : Crea un sticker circular\n- -t : Crea un sticker triangular\n- -s : Crea un sticker con forma de estrella\n- -r : Crea un sticker con esquinas redondeadas\n- -h : Crea un sticker hexagonal\n- -d : Crea un sticker con forma de diamante\n- -f : Crea un sticker con un marco\n- -b : Crea un sticker con un borde\n- -w : Crea un sticker con forma de onda\n- -m : Crea un sticker espejado\n- -o : Crea un sticker octogonal\n- -y : Crea un sticker pentagonal\n- -e : Crea un sticker elíptico\n- -z : Crea un sticker en forma de cruz\n- -v : Crea un sticker con forma de corazón\n- -x : Crea un sticker expandido (cover)\n- -i : Crea un sticker expandido (contain)\n\n✧ *Efectos:*\n- -blur : Aplica un efecto de desenfoque\n- -sepia : Aplica un efecto sepia\n- -sharpen : Aplica un efecto de nitidez\n- -brighten : Aumenta el brillo\n- -darken : Disminuye el brillo\n- -invert : Invierte los colores\n- -grayscale : Aplica escala de grises\n- -rotate90 : Rota la imagen 90 grados\n- -rotate180 : Rota la imagen 180 grados\n- -flip : Invierte la imagen horizontalmente\n- -flop : Invierte la imagen verticalmente\n- -normalice : Normaliza la imagen\n- -negate : Negatiza la imagen\n- -tint : Aplica un tinte de color a la imagen (rojo por defecto)\n\n> Ejemplo: *${usedPrefix + command} -c -blur Pack | Autor*`;
        return client.reply(m.chat, helpText, m);
      }      
      const quoted = m.quoted ? m.quoted : m;
      const mime = (quoted.msg || quoted).mimetype || '';
      let user = global.db.data.users[m.sender];
      const name = user.name;
      let texto1 = user.metadatos || `Sticker`;
      let texto2 = user.metadatos2 || `ᴀꜱᴀᴋᴜʀᴀ ᴍᴀᴏ ʙᴏᴛ 👑`;
      let urlArg = null;
      let argsWithoutUrl = [];
      for (let arg of args) {
        if (isUrl(arg)) {
          urlArg = arg;
        } else {
          argsWithoutUrl.push(arg);
        }
      }
      let filteredText = argsWithoutUrl.join(' ').replace(/-\w+/g, '').trim();
      let marca = filteredText.split(/[\u2022|]/).map(part => part.trim());
      let pack = marca[0] || texto1;
      let author = marca.length > 1 ? marca[1] : texto2;
      const shapeArgs = { '-c': 'circle', '-t': 'triangle', '-s': 'star', '-r': 'roundrect', '-h': 'hexagon', '-d': 'diamond', '-f': 'frame', '-b': 'border', '-w': 'wave', '-m': 'mirror', '-o': 'octagon', '-y': 'pentagon', '-e': 'ellipse', '-z': 'cross', '-v': 'heart', '-x': 'cover', '-i': 'contain' };
      const effectArgs = { '-blur': 'blur', '-sepia': 'sepia', '-sharpen': 'sharpen', '-brighten': 'brighten', '-darken': 'darken', '-invert': 'invert', '-grayscale': 'grayscale', '-rotate90': 'rotate90', '-rotate180': 'rotate180', '-flip': 'flip', '-flop': 'flop', '-normalice': 'normalise', '-negate': 'negate', '-tint': 'tint' };
      const effects = [];
      for (const arg of argsWithoutUrl) {
        if (shapeArgs[arg]) effects.push({ type: 'shape', value: shapeArgs[arg] });
        else if (effectArgs[arg]) effects.push({ type: 'effect', value: effectArgs[arg] });
      }
      const sendWebpWithExif = async (webpBuffer) => {
        const media = { mimetype: 'webp', data: webpBuffer };
        const metadata = { packname: pack, author: author, categories: [''] };
        const stickerPath = await writeExif(media, metadata);
        await client.sendMessage(m.chat, { sticker: { url: stickerPath } }, { quoted: m });
        fs.unlinkSync(stickerPath);
      };
      const convertToGif = async (inputPath) => {
        const gifPath = `./tmp/conv-${Date.now()}.gif`;
        await new Promise((resolve, reject) => {
          const p = spawn('ffmpeg', ['-y', '-i', inputPath, '-vf', 'fps=10,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000', '-loop', '0', gifPath]);
          let err = '';
          p.stderr.on('data', (d) => err += d.toString());
          p.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(err));
          });
        });
        return gifPath;
      };
      const processWithFFmpeg = async (inputPath, isVideo = false) => {
        const outputPath = `./tmp/sticker-${Date.now()}.webp`;
        const vf = buildFFmpegFilters(effects);
        let args = [];
        if (isVideo) {
          args = ['-y', '-i', inputPath, '-vf', vf, '-an', '-fps_mode', 'passthrough', '-c:v', 'libwebp_anim', '-preset', 'picture', '-compression_level', '6', '-q:v', '70', '-loop', '0', outputPath];
        } else {
          args = ['-y', '-i', inputPath, '-vf', vf, '-an', '-fps_mode', 'passthrough', '-c:v', 'libwebp_anim', '-preset', 'picture', '-compression_level', '6', '-q:v', '70', '-loop', '0', outputPath];
        }
        await new Promise((resolve, reject) => {
          const p = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
          let err = '';
          p.stderr.on('data', (d) => err += d.toString());
          p.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(err));
          });
        });
        const data = fs.readFileSync(outputPath);
        fs.unlinkSync(outputPath);
        await sendWebpWithExif(data);
      };
      const isAnimatedWebp = (buffer) => {
        if (!Buffer.isBuffer(buffer) || buffer.length < 32) return false;
        return buffer.indexOf(Buffer.from('ANIM')) !== -1 || buffer.indexOf(Buffer.from('ANMF')) !== -1;
      };
      const handleWebpBuffer = async (buffer) => {
        const animated = isAnimatedWebp(buffer);
        const inputPath = `./tmp/in-${Date.now()}.webp`;
        fs.writeFileSync(inputPath, buffer);
        if (animated && effects.length > 0) {
          try {
            const gifPath = await convertToGif(inputPath);
            await processWithFFmpeg(gifPath, true);
            fs.unlinkSync(gifPath);
          } catch (e) {
            await sendWebpWithExif(buffer);
          }
        } else if (animated && effects.length === 0) {
          await sendWebpWithExif(buffer);
        } else {
          await processWithFFmpeg(inputPath);
        }
        fs.unlinkSync(inputPath);
      };
      if (/image/.test(mime) || /webp/.test(mime)) {
        let buffer = await quoted.download();
        if (/webp/.test(mime)) {
          await handleWebpBuffer(buffer);
        } else {
          const ext = /png/i.test(mime) ? 'png' : /jpe?g/i.test(mime) ? 'jpg' : /gif/i.test(mime) ? 'gif' : 'img';
          const inputPath = `./tmp/in-${Date.now()}.${ext}`;
          fs.writeFileSync(inputPath, buffer);
          await processWithFFmpeg(inputPath, /gif/i.test(mime));
          fs.unlinkSync(inputPath);
        }
      } else if (/video/.test(mime)) {
        if ((quoted.msg || quoted).seconds > 20) {
          return m.reply('《✧》 El video no puede ser muy largo');
        }        
        let buffer = await quoted.download();
        const inputPath = `./tmp/video-${Date.now()}.mp4`;
        fs.writeFileSync(inputPath, buffer);
        await processWithFFmpeg(inputPath, true);
        fs.unlinkSync(inputPath);
      } else if (urlArg) {
        const url = urlArg;        
        if (!url.match(/\.(jpe?g|png|gif|webp|mp4|mov|avi|mkv|webm)(\?.*)?$/i)) {
          return client.reply(m.chat, '《✧》 La URL debe ser de una imagen (jpg, png, gif, webp) o video (mp4, mov, avi, mkv, webm)', m);
        }        
        const response = await fetch(url);
        if (!response.ok) return client.reply(m.chat, '《✧》 No pude descargar ese archivo desde la URL.', m);
        const buffer = Buffer.from(await response.arrayBuffer());
        if (url.match(/\.webp(\?.*)?$/i)) {
          await handleWebpBuffer(buffer);
        } else if (url.match(/\.(jpe?g|png|gif)(\?.*)?$/i)) {
          const ext = url.match(/\.gif/i) ? 'gif' : 'img';
          const inputPath = `./tmp/url-${Date.now()}.${ext}`;
          fs.writeFileSync(inputPath, buffer);
          await processWithFFmpeg(inputPath, /gif/i.test(url));
          fs.unlinkSync(inputPath);
        } else if (url.match(/\.(mp4|mov|avi|mkv|webm)(\?.*)?$/i)) {
          const inputPath = `./tmp/urlvid-${Date.now()}.mp4`;
          fs.writeFileSync(inputPath, buffer);
          await processWithFFmpeg(inputPath, true);
          fs.unlinkSync(inputPath);
        }
      } else {
        return client.reply(m.chat, `《✧》 Por favor, envía una imagen, video, sticker o URL para hacer un sticker.\n> Usa *${usedPrefix + command} -list* para ver formas y efectos`, m);
      }
    } catch (e) {
      return m.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`);
    }
  }
};

const isUrl = (text) => {
  return text.match(new RegExp(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/, 'gi'));
};

const buildFFmpegFilters = (effects, isVideo = false) => {
  const W = 512;
  const H = 512;
  const filters = [];
  const shape = effects.find(e => e.type === 'shape')?.value;
  const effectList = effects.filter(e => e.type === 'effect').map(e => e.value);
  if (shape === 'cover') {
    filters.push(`scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`);
  } else {
    filters.push(`scale=${W}:${H}:force_original_aspect_ratio=decrease`);
    filters.push(`pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`);
  }
  filters.push('format=rgba');
  for (const effect of effectList) {
    switch (effect) {
      case 'blur': filters.push('gblur=sigma=5'); break;
      case 'sepia': filters.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131'); break;
      case 'sharpen': filters.push('unsharp=5:5:1.0:5:5:0.0'); break;
      case 'brighten': filters.push('eq=brightness=0.05'); break;
      case 'darken': filters.push('eq=brightness=-0.05'); break;
      case 'invert': case 'negate': filters.push('negate'); break;
      case 'grayscale': filters.push('hue=s=0'); break;
      case 'rotate90': filters.push('transpose=1'); break;
      case 'rotate180': filters.push('rotate=PI'); break;
      case 'flip': filters.push('hflip'); break;
      case 'flop': filters.push('vflip'); break;
      case 'normalice': filters.push('normalize'); break;
      case 'tint': filters.push('colorchannelmixer=1:0:0:0:0:0.5:0:0:0:0:0.5'); break;
    }
  }
  if (shape === 'mirror') filters.push('hflip');
  if (shape && !['cover', 'contain', 'mirror', 'border', 'frame'].includes(shape)) {
    const cx = W/2;
    const cy = H/2;
    const r = Math.min(W, H)/2;    
    let alphaExpr = '';
    switch (shape) {
      case 'circle': alphaExpr = `if(lte((X-${cx})*(X-${cx})+(Y-${cy})*(Y-${cy}),${r*r}),255,0)`; break;
      case 'triangle': alphaExpr = `if(gte(Y,${H*0.1})*lte(Y,${H*0.9})*lte(abs(X-${cx}),((${H*0.9}-Y)*0.6)),255,0)`; break;
      case 'star': alphaExpr = `if(lte(hypot(X-${cx},Y-${cy}),${W*0.25}+${W*0.1}*cos(5*atan2(Y-${cy},X-${cx}))),255,0)`; break;
      case 'roundrect': alphaExpr = `if(lte(pow(max(25-X,0,X-${W-25},25-Y,0,Y-${H-25}),2)+pow(max(50-hypot(X-25,Y-25),50-hypot(X-${W-25},Y-25),50-hypot(X-25,Y-${H-25}),50-hypot(X-${W-25},Y-${H-25})),2),0),255,0)`; break;
      case 'hexagon': alphaExpr = `if(lte(hypot(X-${cx},Y-${cy}),${W*0.4}*cos(PI/6)/cos(mod(atan2(Y-${cy},X-${cx}),PI/3)-PI/6)),255,0)`; break;
      case 'diamond': alphaExpr = `if(lte(abs(X-${cx})+abs(Y-${cy}),${r}),255,0)`; break;
      case 'wave': alphaExpr = `if(lte(abs(Y-(${cy}+${H*0.05}*sin(X*0.05))),${H*0.4}),255,0)`; break;
      case 'octagon': alphaExpr = `if(lte(hypot(X-${cx},Y-${cy}),${W*0.4}*cos(PI/8)/cos(mod(atan2(Y-${cy},X-${cx}),PI/4)-PI/8)),255,0)`; break;
      case 'pentagon': alphaExpr = `if(lte(hypot(X-${cx},Y-${cy}),${W*0.4}*cos(PI/5)/cos(mod(atan2(Y-${cy},X-${cx}),2*PI/5)-PI/5)),255,0)`; break;
      case 'ellipse': alphaExpr = `if(lte(((X-${cx})*(X-${cx}))/(${(W*0.45)*(W*0.45)})+((Y-${cy})*(Y-${cy}))/(${(H*0.4)*(H*0.4)}),1),255,0)`; break;
      case 'cross': alphaExpr = `if(gt((abs(X-${cx})<=${W*0.15})*(abs(Y-${cy})<=${H*0.45})+(abs(Y-${cy})<=${H*0.15})*(abs(X-${cx})<=${W*0.45}),0),255,0)`; break;
      case 'heart': alphaExpr = `if(lte(pow((X-${cx})/(${W*0.3})*(X-${cx})/(${W*0.3})+(Y-${cy})/(${H*0.3})*(Y-${cy})/(${H*0.3})-1,3)-((X-${cx})/(${W*0.3})*(X-${cx})/(${W*0.3}))*pow((Y-${cy})/(${H*0.3}),3),0),255,0)`; break;
    }
    if (alphaExpr) filters.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alphaExpr}'`);
  }
  if (shape === 'border') filters.push(`drawbox=x=0:y=0:w=${W}:h=${H}:color=white@0.9:t=10`);
  if (shape === 'frame') filters.push(`drawbox=x=15:y=15:w=${W-30}:h=${H-30}:color=white@0.7:t=8`);
  filters.push('format=yuva420p');
  return filters.join(',');
};
