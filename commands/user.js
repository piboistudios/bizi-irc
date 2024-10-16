const { debuglog } = require('util');
const pkg = require('../package.json')
const {
  ERR_NEEDMOREPARAMS,
  ERR_ALREADYREGISTERED
} = require('../replies');

const debug = debuglog('ircs:commands:user')
/**
 * Command: USER
 * Parameters: [username] [hostname] [servername] [realname]

 * 
 * @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} param0 
 * @returns 
 */
function USER({ user, server, parameters }) {
  if (user.username) {
    return user.send(server, ERR_ALREADYREGISTERED, [':You may not register']);
  }
  if (parameters.length !== 4) {
    return user.send(server, ERR_NEEDMOREPARAMS, ['USER', ':Not enough parameters']);
  }

  const [username, hostname, servername, realname] = parameters;
  debug('USER', user.mask(), username, hostname, servername, realname);

  user.username = username.slice(0,32);
  user.realname = realname.slice(0,256);
  user.hostname = hostname;
  user.servername = server.servername;
  if (!user.cap.version) {
    return server.welcome(user);
  }
}

module.exports = USER;