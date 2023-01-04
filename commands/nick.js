const escapeLib = import('escape-string-regexp');
const { mkLogger } = require('../logger');
const Message = require('../message');
const logger = mkLogger('ircs:commands:nick');
const User = require('../models/user');
const {
  ERR_NONICKNAMEGIVEN,
  ERR_NICKNAMEINUSE
} = require('../replies')
const debug = logger.debug;

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
  const regex = new RegExp('^' + escape(lnick) + '$', 'i');
  try {

    const existingUser = await User.findOne({ _id: { $not: { $eq: user?.principal?._id } }, nickname: regex });
    if (existingUser) {
      return user.send(server, ERR_NICKNAMEINUSE,
        [user.nickname, nickname, ':Nickname is already in use'])
    }
    user.nickname = nickname;
    const msg = new Message(user, 'NICK', [nickname], tags);
    user.send(msg)
    user.channels.forEach(chan => chan.broadcast(msg));
  } catch (e) {
    logger.fatal(e);
  }
}
