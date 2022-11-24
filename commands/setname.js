const {
} = require('../replies')
const { debuglog } = require('util');
const debug = debuglog('ircs:commands:setname')
/** 
 *  @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} param0 
 * @returns 
 */
module.exports = function setname({ user, server, parameters: [realname] }) {
  realname = realname.trim()

  debug('setname', user.mask(), realname)

  if (!realname || realname.length === 0) {
    return user.send(server, 'FAIL', ['SETNAME', ':Invalid real name: no real name given']);
  }
  if (realname.length > server.realnameMaxLength) {
    return user.send(server, 'FAIL', ['SETNAME', `:Invalid real name: too long (max: ${server.realnameMaxLength})`]);
  }

  user.realname = realname;
  user.send(user, 'SETNAME', [realname])
  user.channels.forEach(chan => chan.broadcast(user, 'SETNAME', [realname]));
}
