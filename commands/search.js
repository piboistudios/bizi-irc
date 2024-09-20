const { mkLogger } = require('../logger');
const { randomUUID } = require('crypto');
const ChatLog = require('../models/chatlog');
const logger = mkLogger('ircs:commands:chathistory');
const {
  RPL_AWAY,
  ERR_NEEDMOREPARAMS,
} = require('../replies');
const Message = require('../message');
const symbolify = require('../features/symbolify');

const sequelize = require('sequelize');
const messagetags = require('irc-framework/src/messagetags');
const escapeLib = import('escape-string-regexp');
const MSG_CMDS = ['PRIVMSG', 'NOTICE']
/**
 * @type {const & import('escape-string-regexp')["default"]}
 */
let escape;

/**
 * Command: chathistory
 * Parameters: subcommand target timestamp|msgid [timestamp|msgid] limit
 * @docs https://ircv3.net/specs/extensions/chathistory
 * 
 * @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} param0 
 * @returns 
 */

module.exports = async function chathistory({ user, server, parameters }) {
  if (!escape) escape = (await escapeLib).default;
  try {

    function invalidParamsResponse() {
      return user.send(server, "FAIL", ["CHATHISTORY", "INVALID_PARAMS", ":Invalid chathistory parameters. Please see: https://ircv3.net/specs/extensions/chathistory for the expected parameters."]);
    }
    if (parameters.length < 1) {
      return user.send(server, ERR_NEEDMOREPARAMS, ['chathistory', ':Not enough parameters']);
    }
    let [attributes] = parameters;
    const searchAttributes = messagetags.decode(attributes);
    logger.trace("SEARCH attributes:", searchAttributes);
    const batchId = randomUUID();
    const batchStartCmd = new Message(server, "BATCH", [
      `+${batchId}`,
      "search"
    ]);
    const batchEndCmd = new Message(server, "BATCH", [`-${batchId}`]);
    const criteria = {
      command: { $in: MSG_CMDS }
    }, criterias = [criteria];
    if (searchAttributes.from) {
      criteria.prefix = {
        $or:
          [
            { $like: `${searchAttributes.from}!%@%` },
            { $eq: searchAttributes.from }
          ]
      };
    }
    if (searchAttributes.in) {
      criteria.target = searchAttributes.in;
    }
    const tsCriteria = [];
    if (searchAttributes.before) {
      tsCriteria.push({ $lt: new Date(searchAttributes.before) });
    }
    if (searchAttributes.after) {
      tsCriteria.push({ $gt: new Date(searchAttributes.after) });
    }

    if (tsCriteria.length) {
      criteria.timestamp = tsCriteria.length === 1 ?
        { timestamp: tsCriteria[0] } :
        { timestamp: { $and: tsCriteria } }
    }
    if (searchAttributes.text) {
      criterias.push(
        sequelize.where(sequelize.col('parameters'), 'LIKE', '["%","%' + searchAttributes.text + '%"]')
      )
    }
    const sort = ['timestamp', 'DESC']
    logger.trace("Criteria:", criteria);
    logger.trace("Sort:", sort);
    let messages = await ChatLog.findAll({
      where: symbolify(criterias.length === 1 ? criteria : { $and: criterias }),
      order: [sort],
      limit: Math.min(searchAttributes.limit || 50, 250)
    });
    if (sort[1] === 'DESC') messages.reverse()
    const batch = messages.map(m => {
      m.tags = m.tags || {};
      m.tags.batch = m.tags.batch || batchId;
      return new Message(m.prefix, m.command, m.parameters, m.tags);
    })
    batch.unshift(batchStartCmd);
    batch.push(batchEndCmd);
    batch.forEach(b => {
      b.ephemeral = true;
    })
    user.send({
      batch,
    });
  } catch (e) {
    logger.error("Search error:", e);
  }

};