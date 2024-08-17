const Message = require('../message');
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
 * }} msg 
 * @returns 
 */
module.exports = async function privmsg(msg) {
  const { user, server, tags, parameters: [targetName, content] } = msg;
  const reply = new Message(user, "PRIVMSG", [targetName, ':' + content], tags);
  let target
  if (server.chanTypes.includes(targetName[0])) {
    target = await server.findChannel(targetName)
    if (target) {
      const cannotSendChan = [
        target.modes.has('m') && !target.hasOp(user) && !target.hasVoice(user),
        target.modes.has('n') && !target.hasUser(user)
      ].reduce((l, r) => l || r, false);
      if (cannotSendChan) {
        if (user.cap.version) user.send(server, "FAIL", ["PRIVMSG", ":Cannot send to channel"]);
        return user.send(server, ERR_CANNOTSENDTOCHAN, [target.name, ':Cannot send to channel']);
      }
      target.broadcast(reply);
    }
  } else {
    target = await server.findUser(targetName)
    if (target) {
      if (target.away) {
        user.send(server, RPL_AWAY, [target.nickname, target.away]);
      }
      target.send(reply);
    }
  }
  logger.debug("target name:", targetName);
  // if (!target && targetName.toLowerCase().indexOf('cannot') === -1) {
  //   user.send(server, ERR_NOSUCHNICK, [user.nickname, targetName, ':No such nick/channel: ' + targetName])
  // }
}
