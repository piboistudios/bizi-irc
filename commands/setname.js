const {
} = require('../replies')

const Message = require('../message');
const { mkLogger } = require('../logger');
const logger = mkLogger('ircs:commands:setname')
/** 
 *  @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} param0 
 * @returns 
 */
module.exports = async function setname(msg) {
  let { user, server, tags, parameters: [realname] } = msg;
  if (!user.principal) return;
  realname = realname.trim()

  logger.debug('setname', user.mask(), realname)

  if (!realname || realname.length === 0) {
    return user.send(server, 'FAIL', ['SETNAME', ':Invalid real name: no real name given']);
  }
  if (realname.length > server.realnameMaxLength) {
    return user.send(server, 'FAIL', ['SETNAME', `:Invalid real name: too long (max: ${server.realnameMaxLength})`]);
  }

  user.realname = realname;
  if (user.principal) {
    user.principal.realname = realname;
    await user.principal.save();
  }
  const reply = new Message(user, "SETNAME", [user.realname], {})
  user.send(reply)
  user.channels.forEach(chan => chan.broadcast(reply));
}
