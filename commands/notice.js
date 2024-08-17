const Message = require('../message');

/**
 * 
 * @param {import('../message')} msg 
 * @returns 
 */
module.exports = async function notice(msg) {
  const { user, server, tags, parameters: [targetName, content] } = msg;
  const reply = new Message(user, "NOTICE", [targetName, ':' + content], tags);
  return reply.sendTo(msg.target);
  // let target
  // if (server.chanTypes.includes(targetName[0])) {
  //   target = server.findChannel(targetName)
  //   if (target) {
  //     target.broadcast(user, 'NOTICE', [target.name, `:${content}`], tags)
  //   }
  // } else {
  //   target = await server.findUser(targetName)
  //   if (target) {
  //     target.send(user, 'NOTICE', [target.nickname, `:${content}`], tags)
  //   }
  // }
}
