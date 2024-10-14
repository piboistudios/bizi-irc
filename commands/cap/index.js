const {
  ERR_INVALIDCAPCMD, RPL_WELCOME
} = require('../../replies');
const list = require('./list');
const logger = require('../../logger').mkLogger('ircs:commands:cap')
const ls = require('./ls');
const req = require('./req');
/**
 * 
 * @param {{
 *  user: import('../../user'),
 *  server: import('../../server')
 * }} param0 
 * @returns 
 */
module.exports = function cap({ user, server, parameters: [verb, ...args] }) {
  // nickname = nickname.trim()

  logger.debug('CAP', verb, args);

  switch (verb.toUpperCase()) {
    case 'LS':
      // if (args.length < 1) return user.send(server, ERR_INVALIDCAPCMD, [':Invalid arguments']);
      ls(user, server, args[0])
      break;
    case 'REQ':
      if (args.length < 1) return user.send(server, ERR_INVALIDCAPCMD, [':Expected capabilities but received none']);
      req(user, server, args[0].split(' ').map(cap => cap.indexOf('-') === 0 ? { op: 'remove', cap: cap.slice(1) } : { op: 'add', cap }), args[0]);
      break;
    case 'LIST':
      list(user, server);
      break;
    case 'END':
      logger.trace("ENDING CAP", user.principal);
      logger.trace("USER", user);

      user.cap.registered = true;
  }
  // if (!nickname || nickname.length === 0) {
  //   return user.send(server, ERR_NONICKNAMEGIVEN, ['No nickname given']);
  // }

  // if (nickname === user.nickname) {
  //   // ignore
  //   return
  // }

  // const lnick = nickname.toLowerCase()
  // if (server.users.some((us) => us.nickname &&
  //   us.nickname.toLowerCase() === lnick &&
  //   us !== user)) {
  //   return user.send(server, ERR_NICKNAMEINUSE,
  //     [user.nickname, nickname, ':Nickname is already in use'])
  // }
  // user.nickname = nickname;
  // user.send(user, 'NICK', [nickname])
  // user.channels.forEach(chan => chan.broadcast(user, 'NICK', [nickname]));
}
