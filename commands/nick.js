const escapeLib = import('escape-string-regexp');
const symbolify = require('../features/symbolify');
const { mkLogger } = require('../logger');
const Message = require('../message');
const logger = mkLogger('ircs:commands:nick');
const User = require('../models/user');
const {
  ERR_NONICKNAMEGIVEN,
  ERR_NICKNAMEINUSE
} = require('../replies')
const debug = logger.debug;
/**
 * 
 * @param {{
 *  server: import('../server')
 * }} param0 
 * @returns 
 */
module.exports = async function nick({ user, server, tags, parameters: [nickname] }) {
  nickname = nickname.trim().replace(/-at-/g, '|at|');
  const { default: escape } = await escapeLib;

  debug('NICK', user.mask(), nickname)

  if (!nickname || nickname.length === 0) {
    return user.send(server, ERR_NONICKNAMEGIVEN, [':No nickname given']);
  }

  // if (user.nickname) {
  //   // ignore
  //   return
  // }

  const lnick = nickname.toLowerCase()
  try {

    const existingUser = await server.findUser(nickname);
    if (existingUser && existingUser.principal && user.principal && existingUser.principal.uid !== user.principal.uid) {
      return user.send(server, ERR_NICKNAMEINUSE,
        [user.nickname, nickname, ':Nickname is already in use']);
    }

    const msg = new Message(user, 'NICK', [nickname], tags);
    user.send(msg)
    user.channels.forEach(chan => chan.broadcast(msg));
    user.nickname = nickname;
    if (user.principal) {
      user.principal.nickname = nickname;
      await user.principal.save();
    }
  } catch (e) {
    logger.fatal(e);
  }
}
