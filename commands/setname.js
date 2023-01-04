const {
} = require('../replies')
const { debuglog } = require('util');
const Message = require('../message');
const debug = debuglog('ircs:commands:setname')
/** 
 *  @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} param0 
 * @returns 
 */
module.exports = function setname({ user, server, tags, parameters: [realname] }) {
  if (!user.principal) return;
  realname = realname.trim()

  debug('setname', user.mask(), realname)

  if (!realname || realname.length === 0) {
    return user.send(server, 'FAIL', ['SETNAME', ':Invalid real name: no real name given']);
  }
  if (realname.length > server.realnameMaxLength) {
    return user.send(server, 'FAIL', ['SETNAME', `:Invalid real name: too long (max: ${server.realnameMaxLength})`]);
  }

  user.realname = realname;
  const msg = new Message(user, 'SETNAME', [realname], tags)
  user.send(msg)
  user.channels.forEach(chan => chan.broadcast(msg));
}
