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
   * @type {import('../user') | import('../channel').Channel}
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
    const u = await server.findUser(target, true);
    if (!u) {
      return user.send(server, ERR_NOSUCHNICK, [user.nickname, target, ':No such nick']);
    } else {
      dest = u;
      modeIsCode = RPL_UMODEIS;
      isChannel = false;
    }
  }
  logger.trace("modes?", modes);
  if (!modes) {
    // bare /MODE: return current modes
    const modeString = dest.modes.toString()
    logger.trace("Sending mode string:", modeString);
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
  logger.trace("modes before?", dest.modes.toJSON());
  let modeValid = false;
  let modesChanged = false;
  const updated = () => {
    modesChanged = true;
  }
  await Promise.all([!viewOnly && chars1, !viewOnly && chars2, viewOnly && modes].filter(Boolean).map(async modes => {
    logger.trace("Modes:", modes);
    const action = modes[0]
    const modeChars = defaultReply ? modes.slice(1).split('') : modes.split('');

    if ((await server.validateMode(user, { isChannel, target: dest }, action, modeChars, params))) {
      modeValid = true;
      logger.debug("Mode chars:", modeChars);
      modeChars.forEach((mode, i) => {
        if (action === '+') {
          const paramAlreadySet = params.find(param => dest.modes.has(mode, param));
          if (paramAlreadySet) return user.send(server, "FAIL", ['MODE', 'INVALID_MODE', `:${dest.name} already has param (${paramAlreadySet}) for mode (${mode}) set.`]);
          updated();
          dest.modes.add(mode, params, i);
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
            // dest.modes.markUpdated();
          }
          if (isChannel && mode == 'I') {
            params.forEach(invited => {
              dest.meta.invited.set(invited, {
                by: user.nickname,
                at: Date.now() / 1000
              })
            })
            // dest.modes.markUpdated();
          }
        } else if (action === '-') {
          const paramAlreadyUnset = params.find(param => !dest.modes.has(mode,param));
          if (paramAlreadyUnset) return user.send(server, "FAIL", ['MODE', 'INVALID_MODE', `:${dest.name} does not have (${paramAlreadyUnset}) set for mode (${mode}).`]);
          updated();
          dest.modes.unset(mode, params)
          if (isChannel && mode == 'W') {
            dest.modes.listModes['x'] = [];
            // dest.modes.markUpdated();

          }
          if (isChannel && mode == 'b') {
            params.forEach(banned => {
              dest.meta.banned.delete(banned);
            });
            // dest.modes.markUpdated();
          }
          if (isChannel && mode == 'I') {
            params.forEach(invited => {
              dest.meta.invited.delete(invited);
            })
            // dest.modes.markUpdated();
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

    } else {
      logger.trace("Mode not valid:", { user: user.nickname, isChannel, dest: target, action, modeChars })
    }
  }));
  if (modesChanged) {
    await dest.modes.save();
    logger.trace("modes after?", dest.modes.toJSON());

  }
  modeValid && modesChanged && defaultReply && dest.send(user, 'MODE', [target, modes, ...params], tags)

}
