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
module.exports = async function mode(
  {
    user,
    server,
    tags,
    parameters: [
      target,
      modes = '',
      ...params
    ]
  }
) {
  if (modes && !user) return;
  const leadChar = target[0];
  /**
   * @type {import('../user') | import('../channel').Channel}
   */
  let dest;
  let modeIsCode, isChannel = true;
  let name;
  if (server.chanTypes.indexOf(leadChar) !== -1) {
    const channel = await server.findChannel(target)
    if (!channel) {
      return user.send(server, ERR_NOSUCHCHANNEL,
        [user.nickname, target, ':No such channel'])

    } else {
      dest = channel;
      name = channel.name;
      modeIsCode = RPL_CHANNELMODEIS;
    }
  } else {
    const u = await server.findUser(target, true);
    if (!u) {
      return user.send(
        server,
        ERR_NOSUCHNICK,
        [
          user.nickname,
          target,
          ':No such nick'
        ]
      );
    } else {
      // to handle labeled response proxy users
      dest = user.is(u) ? user : u;
      name = dest.nickname;
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
  let chars1, chars2;
  if (i1 > i2)
    [chars1, chars2] = [modes.slice(i1), modes.slice(i2, i1)];
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

  await ([
    !viewOnly && chars1,
    !viewOnly && chars2,
    viewOnly && modes
  ].filter(Boolean)
    .reduce(async (chain, modes) => {
      await chain
      logger.trace("Modes:", modes);
      const action = viewOnly ? null : modes[0];
      const modeChars = (
        viewOnly ? modes :
          modes.slice(1)
      ).split('');
      if (
        (
          await server.validateMode(
            user,
            {
              isChannel,
              target: dest
            },
            action,
            modeChars,
            params
          )
        )
      ) {
        modeValid = true;
        logger.debug("Mode chars:", modeChars);
        await modeChars.reduce(async (chain, mode, i) => {
          await chain;
          logger.debug("Mode:", mode)
          logger.debug("Action:", action);
          if (action === '+') {
            const paramAlreadySet = params.length ?
              params.find(param =>
                dest.modes.has(mode, param)
              ) :
              dest.modes.has(mode);
            if (paramAlreadySet)
              return user.send(
                server, "FAIL", [
                'MODE',
                'INVALID_MODE',
                `:${name} already has param ` +
                `(${paramAlreadySet}) for mode (${mode}) set.`
              ]
              );
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
            const paramAlreadyUnset = params.length ?
              params.find(
                param => !dest.modes.has(mode, param)
              ) : !dest.modes.has(mode);
            if (paramAlreadyUnset)
              return user.send(
                server,
                "FAIL",
                ['MODE',
                  'INVALID_MODE',
                  `:${name} does not have ` +
                  `(${paramAlreadyUnset}) set for mode ` +
                  `(${mode}).`
                ]
              );
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
              await ((dest.modes.retrieve('I') || [])
                .reduce(async (chain, nick) => {
                  await chain;
                  const audit = dest?.meta?.invited?.get(nick);
                  let { by, at } = (audit || {});
                  by = by || 'n/a';
                  at = at || Date.now() / 1000;
                  return user.send(
                    server,
                    RPL_INVITELIST,
                    [
                      mode,
                      target,
                      nick,
                      by,
                      at
                    ]
                  )
                }, Promise.resolve()));
              return user.send(
                server,
                RPL_ENDOFINVITELIST,
                [
                  mode,
                  target,
                  ":End of list"
                ])
            } else if (mode == 'b') {

              await ((dest.modes.retrieve('b') || [])
                .reduce(async (chain, nickmask) => {
                  await chain;
                  const audit = dest?.meta?.banned?.get(nickmask);
                  let { by, at } = (audit || {});
                  by = by || 'n/a';
                  at = at || Date.now() / 1000;
                  return user.send(
                    server,
                    RPL_BANLIST,
                    [
                      mode,
                      target,
                      nickmask,
                      by,
                      at
                    ]
                  )
                }, Promise.resolve()));
              return user.send(
                server,
                RPL_ENDOFBANLIST,
                [
                  mode,
                  target,
                  ":End of list"
                ])

            }
          }
        }, Promise.resolve());

      } else {
        logger.trace(
          "Mode not valid:",
          {
            user: user.nickname,
            isChannel,
            dest: target,
            action,
            modeChars
          }
        )
      }
    }, Promise.resolve()));
  if (modesChanged) {
    await dest.modes.save();
    logger.trace("modes after?", dest.modes.toJSON());

  }

  if (modeValid && modesChanged && !viewOnly)
    await dest.send(user, 'MODE', [target, modes, ...params], tags);
  if (!user.principal)
    return server.failAndSendSignUp(user, 'MODE');
}
