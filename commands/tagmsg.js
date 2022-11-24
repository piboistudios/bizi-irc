const {
  ERR_NOSUCHNICK
} = require('../replies')
/**
 * @docs https://ircv3.net/specs/extensions/message-tags#the-tagmsg-tag-only-message
 * COMMAND: tagmsg
 * PARAMETERS: msgtarget
 * @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} param0 
 * @returns 
 */
module.exports = async function tagmsg({ user, server, parameters: [targetName, content], tags }) {
  let target
  if (targetName[0] === '#' || targetName[0] === '&') {
    target = await server.findChannel(targetName)
    if (target) {
      target.broadcast(user, 'TAGMSG', [target.name], tags);
    }
  } else {
    target = await server.findUser(targetName)
    if (target) {
      target.send(user, 'TAGMSG', [target.nickname], tags);
    }
  }

  
}
