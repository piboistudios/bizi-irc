const { mkLogger } = require('../logger');
const {
  RPL_WHOISUSER,
  RPL_WHOISSERVER,
  RPL_ENDOFWHOIS,
  ERR_NOSUCHNICK,
  RPL_WHOISBOT
} = require('../replies');
const logger = mkLogger('whois');
/**
 * https://tools.ietf.org/html/rfc1459#section-4.5.2
   * @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} param0 
 * @returns 
 */
async function whois({ user, server, parameters: [nickmask] }) {
  let target = await server.findUser(nickmask)
  if (!target.principal && !user.isPrivileged) target = null;
  if (target) {
    
    user.send(server, RPL_WHOISUSER, [user.nickname, target.nickname, target.username, target.hostname, '*', `:${target.realname}`])
    user.send(server, RPL_WHOISSERVER, [user.nickname, target.nickname, target.servername, target.servername])
    logger.trace("Target:", target);
    if (target.modes.has('b')) user.send(server, RPL_WHOISBOT, [user.nickname, target.nickname, ":Is a bot"]);
    user.send(server, RPL_ENDOFWHOIS, [user.nickname, target.username, ':End of /WHOIS list.'])
  } else {
    user.send(server, ERR_NOSUCHNICK, [user.nickname, nickmask, ':No such nick/channel.'])
    user.send(server, RPL_ENDOFWHOIS, [user.nickname, nickmask, ':End of /WHOIS list.'])
  }
}

module.exports = whois;