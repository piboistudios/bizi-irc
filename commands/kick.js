const {
  ERR_NEEDMOREPARAMS,
  ERR_NOSUCHCHANNEL,
  ERR_CHANOPRIVSNEEDED,
  ERR_BADCHANMASK,
  ERR_NOTONCHANNEL,
} = require('../replies');

/**
 * @docs https://tools.ietf.org/html/rfc1459#section-4.2.8
 * Parameters: <channel> <user> [<comment>]
 * 
 * @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} param0 
 * @returns 
 */
const kick = async ({ server, user, parameters, tags }) => {
  let [channelName, target, comment] = parameters;

  if (!channelName || !target) {
    user.send(server, ERR_NEEDMOREPARAMS, ['KICK', ':Not enough parameters'])
    return
  }

  const channel = await server.findChannel(channelName)
  if (!channel) {
    user.send(user, ERR_NOSUCHCHANNEL, [channelName, ':No such channel.'])
    return
  }
  if (!channel.hasOp(user)) {

    return user.send(server, ERR_CHANOPRIVSNEEDED, [user, channel.name, ":You're not channel operator"])
  }
  /**@type {import('../user')} */
  target = await server.findUser(target);
  if (!channel.hasUser(target)) {
    user.send(user, ERR_NOTONCHANNEL, [channelName, ':No such user.'])
    return
  }

  channel.send(user, 'KICK', parameters, tags);
  channel.part(target)
};

module.exports = kick;