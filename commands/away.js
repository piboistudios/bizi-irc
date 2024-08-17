const {
  RPL_away,
  ERR_NEEDMOREPARAMS,
  RPL_UNAWAY,
  RPL_NOWAWAY,
} = require('../replies');

/**
 * Command: away
 * Parameters: :message
 * @docs https://www.rfc-editor.org/rfc/rfc1459#section-5.1
 * 
 * @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} param0 
 * @returns 
 */

module.exports = function away({ user, server, parameters }) {
  if (parameters.length < 1 && user.away) {
    user.send(server, RPL_UNAWAY, [':You are no longer away.']);

  } else {
    user.send(server, RPL_NOWAWAY, [':You are now away']);

  }
  const [msg] = parameters;
  user.away = msg.length ? msg : null;
  user.channels.forEach(c => {
    
    c.broadcast(user, "AWAY", [msg].filter(Boolean), null, ['away-notify']);
  });
};