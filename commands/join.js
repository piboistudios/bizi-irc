const { mkLogger } = require('../logger')
const {
  RPL_TOPIC,
  RPL_NOTOPIC,
  ERR_NEEDMOREPARAMS,
  ERR_INVITEONLYCHAN,
  ERR_BANNEDFROMCHAN
} = require('../replies')
const logger = mkLogger('ircs:commands:join')
const names = require('./names')
/**
 * 
  * @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} opts 
 * @returns 
 */
async function join(opts) {
  const { user, tags, server, parameters: [channelNames, ...restOfParams] } = opts

  if (!channelNames) {
    return user.send(server, ERR_NEEDMOREPARAMS, ['JOIN', ':Not enough parameters'])
  }

  for (const channelName of channelNames.split(',')) {
    const channel = (await server.getChannel(channelName));
    if (channel) {

      if (!channel.modes.has('q', user.nickname)) {
        /**@type {Array} */
        const banlist = channel.modes.retrieve('b') || [];
        if (banlist.find(mask => {
          logger.debug("Checking if", user.mask(), "matches", mask);
          return user.matchesMask(mask);
        })) {

          user.send(server, ERR_BANNEDFROMCHAN, [channelName, ':Cannot join channel!']);
          continue;
        }
      }
      if (!channel.hasOp(user) && channel.isInviteOnly && !channel.modes.has('I', user.nickname)) {
        user.send(server, ERR_INVITEONLYCHAN, [channelName, ':Cannot join invite-only channel without an invite: ' + channelName]);
        continue;
      }
    }
    try {

      channel.join(user)
    } catch (e) {
      logger.error("Unable to join channel:", e);
    }

    channel.send(user, 'JOIN', [channel.name, user.username, `:${user.realname}`], tags)
    // if (!channel.modes.has('m')) channel.addVoice(user);
    names(Object.assign(
      {},
      opts,
      { parameters: [channelName] }
    ))

    // Topic
    if (channel.topic) {
      user.send(server, RPL_TOPIC, [user.nickname, channel.name, `:${channel.topic}`])
    } else {
      user.send(server, RPL_NOTOPIC, [user.nickname, channel.name, ':No topic is set.'])
    }
  }
}

module.exports = join;