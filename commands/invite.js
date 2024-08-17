const Message = require('../message');
const { RPL_INVITING, ERR_CHANOPRIVSNEEDED, ERR_NOTONCHANNEL } = require('../replies');
const logger = require('../logger').mkLogger('ircs:commands:invite')
/**
 * @docs https://www.rfc-editor.org/rfc/rfc1459#section-4.2.7
 * COMMAND: invite
 * PARAMETERS: nickname channel
 * @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} param0 
 * @returns 
 */
module.exports = async function invite({ tags, user, server, parameters: [nickname, channelName] }) {
  logger.info(user.mask(), "INVITE", nickname, channelName);
  const channel = await server.findChannel(channelName);
  if (!channel) return;
  if (!channel.hasUser(user)) return user.send(server, ERR_NOTONCHANNEL, [user.nickname, channel.name, ":You're not on that channel."])
  if (!channel.hasOp(user)) return user.send(server, ERR_CHANOPRIVSNEEDED, [channelName, ':chan op privilege needed']);
  const target = await server.findUser(nickname)
  if (target) {
    user.send(server, RPL_INVITING, [channelName, nickname]);
    // channel.invited.push(nickname);
    channel.modes.add("I", [nickname]);
    logger.debug("Sending to", target);
    const msg = new Message(user, 'INVITE', [target.nickname, channelName], tags);
    target.send(msg)
    logger.info("Sent invite");
    if (channel) {
      channel.users.forEach(u => {
        if (u.cap.list.includes('invite-notify') && channel.hasHalfOp(u)) {
          u.send(msg);
        }
      });
    }
    channel.meta.invited.set(nickname, {
      by: user.nickname,
      at: Date.now() / 1000
    });

  } else {
    logger.error("Target not found");
  }
}

// invite;