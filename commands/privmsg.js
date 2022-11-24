const {
  ERR_NOSUCHNICK, ERR_CANNOTSENDTOCHAN, RPL_AWAY
} = require('../replies')
const logger = require('../logger').mkLogger('ircs:commands:privmsg')
/** 
 * COMMAND: privmsg
 * PARAMETERS: target :msg
 * @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} param0 
 * @returns 
 */
module.exports = async function privmsg({ user, server, parameters: [targetName, content] }) {
  let target
  if (targetName[0] === '#' || targetName[0] === '&') {
    target = await server.findChannel(targetName)
    if (target) {
      if (!target.hasVoice(user)) {
        // if (user.cap.version) user.send(server, "FAIL", ["PRIVMSG", ":Cannot send to channel"]);
        return user.send(server, ERR_CANNOTSENDTOCHAN, [target.name, ':Cannot send to channel']);
      }
      target.broadcast(user, 'PRIVMSG', [target.name, `:${content}`]);
    }
  } else {
    target = await server.findUser(targetName)
    if (target) {
      if (target.away) {
        user.send(server, RPL_AWAY, [target.nickname, target.away]);
      }
      target.send(user, 'PRIVMSG', [target.nickname, `:${content}`]);
    }
  }
  logger.debug("target name:", targetName);
  if (!target && targetName.toLowerCase().indexOf('cannot') === -1) {
    user.send(server, ERR_NOSUCHNICK, [user.nickname, targetName, ':No such nick/channel: ' + targetName])
  }
}
