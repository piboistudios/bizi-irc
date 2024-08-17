const {
  ERR_NOSUCHNICK
} = require('../replies')
/**
 * @docs https://ircv3.net/specs/extensions/message-tags#the-tagmsg-tag-only-message
 * COMMAND: tagmsg
 * PARAMETERS: msgtarget
 * @param {import('../message')} msg 
 * @returns 
 */
module.exports = async function tagmsg(msg) {
  return msg.sendTo(msg.target);

}
