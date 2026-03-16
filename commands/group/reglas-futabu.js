export default {
  command: ['reglas', 'rules', 'reglasgrupo', 'rulesgrupo', 'rulesgroup', 'regla'],
  category: 'grupo',
  
  run: async (client, m, args, usedPrefix, command, text) => {
    if (!m.isGroup) return m.reply('❌ Este comando solo se puede usar en grupos.')
    
    // 1. Aquí pones el Link directo de tu imagen (debe terminar en .jpg o .png preferiblemente)
    const imagenUrl = 'https://i.imgur.com/cGvNorx.jpeg'; 

    const reglas = `╰Futabu Club╯

۞ Warn = Advertencia

📝| Reglas:

❖ *Respeto* 
➥ Se debe respetar a todo miembro del grupo, evitando insultos u ofensas a cualquier persona independientemente de su género, sexo, nacionalidad, condición, físico, etc.

Esto incluye insistir bromas o comentarios hacia personas no receptivas.
> ۞ SANCIÓN: 1 Warn (Situación leve), 2 Warns + Silenciar por 5m (Situación media), Ban (Situación agresiva).

❖ *Intenciones y Privados* 
➥ Este grupo no es un bar de citas, ni las personas aquí son tu fetiche. Por lo tanto, pedir privados con esa intención, hablar indiscriminadamente o presentarte buscando pareja está prohibido.

Los mensajes privados se deben pedir respetuosamente por el grupo. En caso contrario, se sancionará.
> ۞ SANCIÓN: 2 Warns (Intención leve), Ban (Intención al entrar al grupo).

❖ *Peleas o Discusiones*
➥ Los conflictos a veces ocurren. En caso de presentarse uno, es importante hablarlo en privado y con respeto. De esta forma, el grupo queda tranquilo y fuera de la discusión, evitando causar incomodidad a otros usuarios.

En caso de que el conflicto no se solucione de forma pacífica o genere líos mayores, se valorarán otras soluciones. Por favor, aportar la información a los Administradores para facilitar la resolución.
> ۞ SANCIÓN: 1 Warn (Situación leve), 2 Warns + Silenciar por 10m (Situación media), 3 Warns + Silenciar por 30m (Situación agresiva).

❖ *Doxeo*
➥ Está terminantemente prohibido compartir o revelar información privada de cualquiera persona. 

Esto incluye imágenes, direcciones, datos privados, etc.
> ۞ SANCIÓN: Ban Permanente.

❖ *Spam/Promoción*
➥ La difusión ya sea de promos, links de grupos, etc; sin el permiso de un administrador de rango alto queda prohibida y por tanto, sancionada.

Si se puede enviar links seguros, como por ejemplo de videos de YouTube, anime, páginas porno, etc. Pero con moderación.
> ۞ SANCIÓN: 2 Warns.

❖ *Acoso y/o Pedofilia*
➥ Queda prohibido hablar al privado sin permiso. Y aún más si se trata de acoso a menores.

Esto incluye hablar a Administradores al privado sin su permiso a menos que sean una intención referida a la moderación.

Cualquier tipo de acoso, especialmente a menores, tendrá consecuencias directas, sin excepciones.
> ۞ SANCIÓN: 1 Warn (Intención no menores), Ban Permanente (Intención con menores).

❖ *Flood*
➥ Se entiende como Flood romper el flujo de mensajes sano de un grupo por el exceso de estos. Es decir, inundar el grupo con mensajes repetidos y demás.

Para evitar esto y mantener un ritmo sano para todos, hay un límite de 4 stickers/emojis y mensajes repetidos.

_*IMPORTANTE*_: participar en un Flood o Inundación como por ejemplo, enviar muchos stickers o emojis  junto a otros usuarios, también se considera Flood, aunque no sean precisamente seguidos.
> ۞ SANCIÓN: 1 Warn + Silenciar por 10m`;

    // 2. Enviamos el mensaje como Imagen con Caption (Texto)
    // 'image': acepta url o buffer
    // 'caption': es el texto que acompaña la foto
    // 'quoted': m (para que responda al mensaje del usuario)
    
    await client.sendMessage(m.chat, { 
        image: { url: imagenUrl }, 
        caption: reglas 
    }, { quoted: m });
  }
}
