const { debuglog } = require('util');

const debug = debuglog('ircs:Command:QUIT');
/**
 * 
 * @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} param0 
 * @returns 
 */
function QUIT({ user, server, parameters: [message] }) {
  message = message || user.nickname
  debug('user quit', message);
  const index = server.users.indexOf(user);
  if (index === -1) return new Error(`No such user ${user.nickname} from this server`);
  server.users.splice(index, 1);
  const userChannels = [...server.channels.values()].filter(c => c.users.find(u => u === user));
  userChannels.forEach(channel => {
    channel.part(user);
    channel.send(user, 'PART', [channel.name, `:${message}`])
  })
  user.end();
}

module.exports = QUIT;