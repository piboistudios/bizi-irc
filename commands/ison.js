const {
  RPL_ISON,
  ERR_NEEDMOREPARAMS,
} = require('../replies');

/**
 * Command: ISON
 * Parameters: <nickname>{<space><nickname>}
 * @docs https://tools.ietf.org/html/rfc1459#section-5.8
 */
const ison = async ({ user, server, parameters }) => {
  if (parameters.length < 1) {
    return user.send(server, ERR_NEEDMOREPARAMS, ['ISON', ':Not enough parameters']);
  }
  const users = (await Promise.all(parameters.map(nickname => server.findUser(nickname, true))))
                  .filter(Boolean)
                  .filter(u => (u.principal || user.isPrivileged));
  user.send(server, RPL_ISON, [user.nickname].concat(users));
};

module.exports = ison;