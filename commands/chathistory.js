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
/**
 * @type {import('sequelize')["Op"]}
 */
const sequelize = require('sequelize');
const escapeLib = import('escape-string-regexp');
const MSG_CMDS = ['PRIVMSG', 'NOTICE', 'BATCH']
const VISIBLE_CMDS = MSG_CMDS.concat('JOIN PART QUIT MODE TOPIC NICK'.split(' '));
const EVENT_CMDS = ['TAGMSG', 'JOIN', 'PART', 'QUIT', 'MODE', 'TOPIC', 'NICK', 'REDACT'];
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
    let [subcommand, ...rest] = parameters;
    let timestampsOrMsgIds, limit, target;
    if (subcommand !== 'TARGETS') target = rest.shift();
    limit = rest.slice(-1)[0];
    const hasLimit = !Number.isNaN(Number(limit));
    logger.trace("Limit:", limit);
    logger.trace("Has limit:", hasLimit);
    timestampsOrMsgIds = hasLimit ? rest.slice(0, -1) : rest;

    limit = Math.min(Number(limit) || 50, 250);

    if (subcommand === 'TARGETS') {
      target = null;
      subcommand = parameters[0];
    }
    subcommand = subcommand.toUpperCase();
    logger.trace("locals:", { target, subcommand, timestampsOrMsgIds, limit });
    logger.trace("limit:", limit);
    const batchId = randomUUID();
    const batchStartCmd = new Message(server, "BATCH", [`+${batchId}`, "chathistory", target].filter(Boolean));
    const batchEndCmd = new Message(server, "BATCH", [`-${batchId}`]);
    if (Number.isNaN(limit)) return invalidParamsResponse();
    if (target && server.chanTypes.includes(target.charAt(0))) {
      const chan = await server.findChannel(target);
      if (!chan.hasUser(user))
        return user.send(server, "FAIL", ["CHATHISTORY", "INVALID_TARGET", ":The channel or conversation does not exist, or you are not authorized to view it."])
          .finally(user.send(batchStartCmd))
          .then(user.send(batchEndCmd));
    }


    let timestampOrMsgIdEnd, invalidParams;
    const timestamps = await Promise.all(timestampsOrMsgIds.map(async t => {
      if (t === '*') return false;
      let [type, value] = t.split('=');
      if (type === 'msgid') {

        chatlog = await ChatLog.findOne({
          where: {
            "tags.msgId": value
          }
        });
        value = new Date(msg?.tags?.time || Date.now());
      } else if (type !== "timestamp") {
        invalidParams = true;
        return;
      }
      return new Date(value);
    }));
    logger.trace("timestamps...:", { timestampsOrMsgIds, timestamps });

    if (invalidParams) {
      logger.trace("params invalid:", { timestampsOrMsgIds, timestamps });
      return invalidParamsResponse();
    }
    if (parameters.length > 4) {
      timestampOrMsgIdEnd = timestamps[1];
    }

    const v = timestamps[0];
    let criteria = {



    }, sort = ['timestamp', 'DESC'], group;
    switch (subcommand) {
      case 'BEFORE':
        if (v) {
          criteria = { timestamp: { $lt: v } };
        }
        break;
      case 'AROUND':
        if (v) {
          criteria = {
            $or: [
              {
                timestamp: { $lt: v }
              },
              {
                timestamp: { $gt: v }
              }
            ]
          }
        }
        break;
      case 'AFTER':
        if (v) {

          criteria = { timestamp: { $gt: v } };
          sort = ['timestamp', 'ASC']
        }
        break;
      case 'LATEST':
        if (v) criteria = { timestamp: { $gt: v } }
        // sort = { timestamp: -1 }
        break;
      case 'TARGETS':
      case 'BETWEEN':
        criteria = { timestamp: { $gt: timestamps[0], $lt: timestamps[1] } };
        if (subcommand === 'TARGETS') {
          group = 'target';

          criteria.target = { $in: [user.nickname, ...user.channels.map(c => c.name)] };
          criteria.prefix = {
            $and: [
              { $notLike: `${user.nickname}!%@%` },
              { $ne: user.nickname }
            ]
          }
        }
        break;
      default:

    }
    let getCriteria;
    if (subcommand === 'TARGETS') {
      getCriteria = () => criteria;
    } else if (['#', '&'].indexOf(target.charAt(0)) === -1) {

      logger.trace(user.mask());
      getCriteria = () => ({
        ...criteria,
        'tags."+draft/conf-cmd"': null,
        'tags."+typing"': null,
        $or: [
          {
            target: user.nickname,
            prefix: target
          },
          {
            target: user.nickname,
            prefix: { $like: `${target}!%@%` }
          },
          {
            target,
            prefix: user.mask()
          }
        ]
      });
    } else {
      getCriteria = () => ({
        ...criteria,
        'tags."+typing"': null,
        'tags."+draft/conf-cmd"': null,
        target

      });
    }
    const eventPlayback = user.cap.list.includes('draft/event-playback');
    if (eventPlayback && subcommand !== 'TARGETS') {
      const nonEventMessages = await ChatLog.findAll({
        where: symbolify({
          ...getCriteria(),
          command: {
            $in: VISIBLE_CMDS
          }
        }),
        order: [sort],
        limit
      });
      const first = nonEventMessages[0];
      const last = nonEventMessages[nonEventMessages.length - 1];
      if (first && last) {

        const earliestTs = first.timestamp < last.timestamp ? first.timestamp : last.timestamp;
        const latestTs = earliestTs === first.timestamp ? last.timestamp : first.timestamp;
        if (nonEventMessages.length) {
          criteria = { timestamp: { $gte: earliestTs, $lte: latestTs } };
        }
      } else {
        batch.unshift(batchStartCmd);
        batch.push(batchEndCmd);
        return user.send({
          batch,
        });
      }
    }
    logger.debug("Chathistory criteria:", getCriteria());
    logger.debug("Sort:", sort);
    let messages = await ChatLog.findAll({
      where: symbolify({
        ...getCriteria(),
        command: {
          $in: MSG_CMDS.concat(eventPlayback
            ? EVENT_CMDS
            : []
          )
        }
      }),
      group,
      order: [sort],
      limit: eventPlayback ? undefined : limit,
      attributes: subcommand !== 'TARGETS' ? undefined : [
        'target',
        [sequelize.fn('MAX',
          sequelize.col('timestamp')
        ), 'timestamp']
      ]
    });
    logger.trace("Result:", messages);
    if (sort[1] === 'DESC') messages.reverse()
    const batch = subcommand !== 'TARGETS' ? messages.map(m => {
      m.tags = m.tags || {};
      m.tags.batch = m.tags.batch || batchId;
      return new Message(m.prefix, m.command, m.parameters, m.tags);
    }) : messages.map(m =>
      new Message(
        server,
        'CHATHISTORY',
        [
          'TARGETS',
          m.target,
          '' + m.timestamp.toISOString()
        ],
        { batch: batchId }
      )
    );
    batch.unshift(batchStartCmd);
    batch.push(batchEndCmd);
    batch.forEach(b => {
      b.ephemeral = true;
    })
    return user.send({
      batch,
    });
  } catch (e) {
    logger.error("Chathistory error:", e);
  }

};