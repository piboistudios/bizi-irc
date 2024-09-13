const { mkLogger } = require('../logger');

const logger = mkLogger('quit');
/**
 * 
 * @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} param0 
 * @returns 
 */
async function QUIT({ user, server, parameters: [message] }) {
  if (user.closed) return;
  message = message || user.nickname
  logger.debug('user quit', message);
  const index = server.users.indexOf(user);
  if (index === -1) return new Error(`No such user ${user.nickname} from this server`);
  server.users.splice(index, 1);
  const userChannels = [...server.channels.values()].filter(c => c.users.find(u => u === user));
  await Promise.all(userChannels.map(async channel => {
    await channel.part(user);
    channel.send(user, 'PART', [channel.name, `:${message}`])
  }))
  user.end();
}

module.exports = QUIT;