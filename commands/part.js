
const {
  ERR_NOSUCHCHANNEL,
  ERR_NOTONCHANNEL,
  ERR_NEEDMOREPARAMS
} = require('../replies')
const { mkLogger } = require('../logger');
const Message = require('../message');
const logger = mkLogger('ircs:commands:part');
module.exports = async function part({ user, server, tags, parameters: [channelName, message] }) {
  if (!channelName) {
    user.send(server, ERR_NEEDMOREPARAMS, ['PART', ':Not enough parameters'])
    return
  }

  const channel = await server.findChannel(channelName)
  if (!channel) {
    user.send(user, ERR_NOSUCHCHANNEL, [channelName, ':No such channel.'])
    return
  }
  logger.debug("Channel", channel);
  if (!channel.hasUser(user)) {
    user.send(user, ERR_NOTONCHANNEL, [channelName, ':You\'re not on that channel.'])
    return
  }

  channel.part(user)
  const msg = new Message(user, 'PART', [channel.name], tags);
  channel.send(msg)
  user.send(msg)
}
