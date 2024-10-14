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
        if (channel.hasBanned(user)) {
          user.send(server, ERR_BANNEDFROMCHAN, [channelName, ':Cannot join channel!']);
          continue;
        }
      }
      if (!channel.hasOp(user) && channel.isInviteOnly && !channel.modes.hasNickOrMask('I', user)) {
        user.send(server, ERR_INVITEONLYCHAN, [channelName, ':Cannot join invite-only channel without an invite: ' + channelName]);
        continue;
      }
    }
    try {
      await channel.join(user, tags)
    } catch (e) {
      logger.error("Unable to join channel:", e);
      return;
    }
    // only send to user if they're anonymous
    user.principal && await channel
      .broadcast(
        user,
        'JOIN',
        [
          channel.name,
          user.username,
          `:${user.realname}`
        ],
        tags
      );

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

    if (!user.principal)
      server.sendSignUpNote(user, 'JOIN');
  }
}

module.exports = join;