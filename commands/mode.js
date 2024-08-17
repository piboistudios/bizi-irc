const { mkLogger } = require('../logger');
const Message = require('../message');
const {
  ERR_CHANOPRIVSNEEDED,
  ERR_NOSUCHCHANNEL,
  RPL_CHANNELMODEIS,
  ERR_NOSUCHNICK,
  RPL_UMODEIS,
  RPL_INVITELIST,
  RPL_ENDOFINVITELIST,
  RPL_ENDOFBANLIST,
  RPL_BANLIST
} = require('../replies')
const logger = mkLogger('ircs:commands:mode');
/**
  * @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} param0 
 * @returns 
 */
module.exports = async function mode({ user, server, tags, parameters: [target, modes = '', ...params] }) {
  if (modes && !user) return;
  const leadChar = target[0];
  /**
   * @type {import('../user') | import('../channel')}
   */
  let dest;
  let modeIsCode, isChannel = true;

  if (server.chanTypes.indexOf(leadChar) !== -1) {
    const channel = await server.findChannel(target)
    if (!channel) {
      return user.send(server, ERR_NOSUCHCHANNEL,
        [user.nickname, target, ':No such channel'])

    } else {
      dest = channel;
      modeIsCode = RPL_CHANNELMODEIS;
    }
  } else {
    const u = await server.findUser(target);
    if (!u) {
      return user.send(server, ERR_NOSUCHNICK, [user.nickname, target, ':No such nick']);
    } else {
      dest = u;
      modeIsCode = RPL_UMODEIS;
      isChannel = false;
    }
  }

  if (!modes) {
    // bare /MODE: return current modes
    const modeString = dest.modes.toString()
    user.send(server, modeIsCode,
      [user.nickname, target, ...modeString.split(' ')])
    return
  }

  const i1 = modes.indexOf('+');
  const i2 = modes.indexOf('-');
  let viewOnly = i1 === -1 && i2 === -1;
  let defaultReply = !viewOnly;
  let chars1, chars2, anyChars;
  if (i1 > i2) [chars1, chars2] = [modes.slice(i1), modes.slice(i2, i1)];
  else
    [chars1, chars2] = [modes.slice(i2), modes.slice(i1, i2)];
  params = [...new Set(params)];
  logger.trace()
  await Promise.all([!viewOnly && chars1, !viewOnly && chars2, viewOnly && modes].filter(Boolean).map(async modes => {
    logger.trace("Modes:", modes);
    const action = modes[0]
    const modeChars = defaultReply ? modes.slice(1).split('') : modes.split('');
    if (isChannel && action) {
      const channel = dest;
      if (!channel.hasOp(user)) {
        user.send(server, ERR_CHANOPRIVSNEEDED,
          [user.nickname, channel.name, ':You\'re not channel operator'])
        return
      }
    }
    if (await server.validateMode(user, dest, modeChars, isChannel)) {
      logger.debug("Mode chars:", modeChars);
      modeChars.forEach((mode) => {
        if (action === '+') {
          dest.modes.add(mode, params);
          // if (isChannel && mode === 'b') {
          //   params.forEach(banned => {
          //     user.onReceive(new Message(user, 'KICK', [target, banned, ":banned"]))
          //   });
          // }
          if (isChannel && mode == 'b') {
            params.forEach(banned => {
              dest.meta.banned.set(banned, {
                by: user.nickname,
                at: Date.now() / 1000
              })
            });
            dest.changes('meta', true);
          }
          if (isChannel && mode == 'I') {
            params.forEach(invited => {
              dest.meta.invited.set(invited, {
                by: user.nickname,
                at: Date.now() / 1000
              })
            })
            dest.changes('meta', true);
          }
        } else if (action === '-') {
          dest.modes.unset(mode, params)
          if (isChannel && mode == 'b') {
            params.forEach(banned => {
              dest.meta.banned.delete(banned);
            });
            dest.changes('meta', true);
          }
          if (isChannel && mode == 'I') {
            params.forEach(invited => {
              dest.meta.invited.delete(invited);
            })
            dest.changes('meta', true);
          }
        } else if (isChannel) {
          if (mode === 'I') {
            (dest.modes.retrieve('I') || []).forEach(nick => {
              const audit = dest?.meta?.invited?.get(nick);
              let { by, at } = (audit || {});
              by = by || 'n/a';
              at = at || Date.now() / 1000;
              user.send(server, RPL_INVITELIST, [mode, target, nick, by, at])
            });
            user.send(server, RPL_ENDOFINVITELIST, [mode, target, ":End of list"]);
          } else if (mode == 'b') {

            (dest.modes.retrieve('b') || []).forEach(nickmask => {
              const audit = dest?.meta?.banned?.get(nickmask);
              let { by, at } = (audit || {});
              by = by || 'n/a';
              at = at || Date.now() / 1000;
              user.send(server, RPL_BANLIST, [mode, target, nickmask, by, at])
            });
            user.send(server, RPL_ENDOFBANLIST, [mode, target, ":End of list"]);

          }
        }
      })

    }
  }));
  if (isChannel && !viewOnly) {
    await dest.modes.save();

  }
  defaultReply && dest.send(user, 'MODE', [target, modes, ...params], tags)

}
