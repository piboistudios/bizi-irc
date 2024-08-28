const {
  RPL_WHOREPLY,
  RPL_ENDOFWHO,
  RPL_WHOSPCRPL
} = require('../replies')
const logger = require('../logger').mkLogger('ircs:commands:who')
const tokenFlagOrder = 'tcuihsnfdlaor';
/**
 * 
 * @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} param0 
 * @returns 
 */
async function who({ user, server, parameters: [channelName, whoxStr] }) {
  if (!channelName) return;
  let channel = await server.findChannel(channelName)
  const [fields, token] = whoxStr ? whoxStr.slice(1).split(',') : new Array(2);
  if (channel) {
    channel.users.forEach((u) => {
      if(!user.isPrivileged && !u.principal) return;
      let mode = 'H' + user.botFlag() + channel.findMode(user, u);

      let values = [
        user.nickname, channel.name, u.username,
        u.hostname, u.servername, u.nickname,
        mode, ':0', u.realname
      ]
      let replyCode = RPL_WHOREPLY;
      if (whoxStr) {
        replyCode = RPL_WHOSPCRPL;
        values = [
          token, channel.name, u.username, u.address || '255.255.255.255',
          u.hostname, u.servername, u.nickname,
          mode, '0', u.idleTime, u.username, 'n/a', ':' + u.realname
        ];
        const fieldnames = ['token', 'channel', 'username', 'address', 'hostname', 'servername', 'nickname', 'mode', 'hopcount', 'idle', 'account', 'oplevels', 'realname'];
        const sendObj = {};
        values = values.filter((v, index) => {
          if (fields.indexOf(tokenFlagOrder[index]) !== -1) {
            sendObj[tokenFlagOrder[index]] = { key: fieldnames[index], value: v };
            return true;
          }
          else return false;
        });
        logger.debug("Sending whox respones:", sendObj);
        logger.debug('for user', u);
        values.unshift(user.nickname);
      }
      user.send(server, replyCode, values)
    })
    user.send(server, RPL_ENDOFWHO, [user.nickname, channelName, ':End of /WHO list.'])
  }
}

module.exports = who;