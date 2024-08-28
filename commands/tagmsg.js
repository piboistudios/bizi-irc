const Message = require('../message');
const {
  ERR_NOSUCHNICK, ERR_CANNOTSENDTOCHAN, RPL_AWAY
} = require('../replies')
const logger = require('../logger').mkLogger('ircs:commands:privmsg')
const sendmsg = require('./utils/sendmsg');
/**
 * @docs https://ircv3.net/specs/extensions/message-tags#the-tagmsg-tag-only-message
 * COMMAND: tagmsg
 * PARAMETERS: msgtarget
 * @param {import('../message')} msg 
 * @returns 
 */
module.exports = msg => {
  return sendmsg({
    target: msg.parameters[0],
    msg
  })
}


// async function TAGMSG(msg) {
//   const { user, server, tags, parameters: [targetName] } = msg;
//   const reply = new Message(user, "TAGMSG", [targetName], tags);
//   let target
//   if (server.chanTypes.includes(targetName[0])) {
//     if (!user.principal) {
//       user.send(user, "FAIL", ['TAGMSG', 'NEED_REGISTRATION', ':You must be logged in to interact. Anonymous users can only view previews of public chats.']);
//       return server.sendSignUpNote(user, "TAGMSG");
//     }
//     target = await server.findChannel(targetName)
//     if (target) {
//       const cannotSendChan = [
//         target.modes.has('m') && !target.hasOp(user) && !target.hasVoice(user),
//         target.modes.has('n') && !target.hasUser(user)
//       ].reduce((l, r) => l || r, false);
//       if (cannotSendChan) {
//         return user.send(server, ERR_CANNOTSENDTOCHAN, [target.name, ':Cannot send to channel']);
//       }
//       target.broadcast(reply);
//     }
//   } else {
//     target = await server.findUser(targetName)
//     if (target) {
//       if (target.away) {
//         user.send(server, RPL_AWAY, [target.nickname, target.away]);
//       }
//       !target.ignoresUnidentified && target.send(reply);
//     }
//   }
//   logger.debug("target name:", targetName);
//   // if (!target && targetName.toLowerCase().indexOf('cannot') === -1) {
//   //   user.send(server, ERR_NOSUCHNICK, [user.nickname, targetName, ':No such nick/channel: ' + targetName])
//   // }
// }