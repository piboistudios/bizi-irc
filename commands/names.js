const {
  RPL_NAMREPLY,
  RPL_ENDOFNAMES
} = require('../replies')
/**
 * 
 * @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} param0 
 * @returns 
 */
module.exports = async function names({ user, server, parameters: [channelNameOrChan] }) {
  let channel = typeof channelNameOrChan === 'string' ? await server.findChannel(channelNameOrChan) : channelNameOrChan;
  if (channel) {
    let names = channel.onlineUsers.map((u) => {
      if(!user.isPrivileged && !u.principal) return;
      let mode = channel.findMode(user, u);
      const un = user.cap.list.includes('userhost-in-names') ? u.mask() : u.nickname;
      return mode + un
    }).filter(Boolean);

    const symbol = channel.isSecret ? '@' : channel.isPrivate ? '*' : '=';
    names.forEach(name => {
      user.send(server, RPL_NAMREPLY, [user.nickname, symbol, channel.name, name])
    });
    user.send(server, RPL_ENDOFNAMES, [user.nickname, channel.name, ':End of /NAMES list.'])
  }
}
