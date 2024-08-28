const Message = require('../message');
const sendmsg = require('./utils/sendmsg');

/**
 * 
 * @param {import('../message')} msg 
 * @returns 
 */
module.exports = async msg => {
  return sendmsg({
    target: msg.parameters[0],
    unauthorized: () => {},
    forbidden: () => {},
    away: (_, next) => next()
  })
}