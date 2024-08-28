const Message = require('../message');
const {
  ERR_NOSUCHNICK, ERR_CANNOTSENDTOCHAN, RPL_AWAY
} = require('../replies')
const sendmsg = require('./utils/sendmsg');
const logger = require('../logger').mkLogger('ircs:commands:privmsg')
/** 
 * COMMAND: privmsg
 * PARAMETERS: target :msg
 * @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} msg 
 * @returns 
 */
module.exports = async msg => {
  return sendmsg({
    target: msg.parameters[0],
    msg
  })
}