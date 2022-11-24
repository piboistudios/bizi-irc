const {

} = require('../replies');
const logger = require('../logger').mkLogger('ircs:commands:webirc')

/**
 * @docs https://ircv3.net/specs/extensions/webirc#examples
 * COMMAND: webirc
 * PARAMETERS: passwd gateway hostname ip
 * @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} param0 
 * @returns 
 */
module.exports = function webirc({ user, server, parameters: [passwd, gateway, hostname, ip] }) {
    // nickname = nickname.trim()
    logger.debug('WEBIRC', { passwd, gateway, hostname, ip });
    /**@todo validate gateway & passwd */
    user.address = ip;
    user.hostname = hostname;
}


