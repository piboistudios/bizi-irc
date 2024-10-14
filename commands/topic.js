const {
  RPL_TOPIC,
  RPL_NOTOPIC,
  ERR_NOTONCHANNEL,
  ERR_CHANOPRIVSNEEDED
} = require('../replies')

async function topic({ user, server, tags, parameters: [channelName, topic] }) {
  let channel = await server.findChannel(channelName)
  if (channel) {
    // no new topic given, → check
    if (topic === undefined) {
      if (channel.topic) {
        user.send(server, RPL_TOPIC, [user.nickname, channel.name, `:${channel.topic}`])
      } else {
        user.send(server, RPL_NOTOPIC, [user.nickname, channel.name, ':No topic is set.'])
      }
      return
    }
    if (!channel.hasOp(user) && !user.isPrivileged) {
      user.send(server, ERR_CHANOPRIVSNEEDED, [user.nickname, channel.name, ':You\'re not channel operator'])
      return
    }
    if (!channel.hasUser(user)) {
      user.send(server, ERR_NOTONCHANNEL, [user.nickname, channel.name, ':You\'re not on that channel.'])
      return
    }

    // empty string for topic, → clear
    channel.topic = topic === '' ? null : topic
    channel.send(user, 'TOPIC', [channel.name, topic === '' ? ':' : `:${topic}`], tags)
  }
}

module.exports = topic;