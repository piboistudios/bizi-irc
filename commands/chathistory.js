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
const Op = require('sequelize').Op;
const escapeLib = import('escape-string-regexp');
const MSG_CMDS = ['PRIVMSG','NOTICE','BATCH']
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
    let [subcommand, target, ...timestampsOrMsgIds] = parameters;
    const limit = timestampsOrMsgIds.pop();
    if (Number.isNaN(Number(limit))) return invalidParamsResponse();
    if (server.chanTypes.includes(target.charAt(0))) {
      const chan = await server.findChannel(target);
      if (!chan.hasUser(user))
        return user.send(server, "FAIL", ["CHATHISTORY", "INVALID_TARGET", ":The channel or conversation does not exist, or you are not authorized to view it."]);
    }

    const batchId = randomUUID();
    const batchStartCmd = new Message(server, "BATCH", [`+${batchId}`, "chathistory", target]);
    const batchEndCmd = new Message(server, "BATCH", [`-${batchId}`]);
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
    if(invalidParams) {
      return invalidParamsResponse();
    }
    if (parameters.length > 4) {
      timestampOrMsgIdEnd = timestamps[1];
    }

    const v = timestamps[0];
    let criteria = {



    }, sort = ['timestamp', 'DESC'];
    switch (subcommand) {
      case 'BEFORE':
        if (v) {
          criteria = { timestamp: { $lt: v } };
        }
        break;
      case 'AROUND':
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
      case 'BETWEEN':
        criteria = { timestamp: { $gt: timestamps[0], $lt: timestamps[1] } };

        break;
      default:
        return user.send(server, "FAIL", ["CHATHISTORY", "UNKNOWN_COMMAND", ":Invalid subcommand."]);
    }
    let getCriteria;
    if (['#', '&'].indexOf(target.charAt(0)) === -1) {

      logger.trace(user.mask());
      getCriteria = () => ({
        ...criteria,
        'tags."+draft/conf-cmd"': null,
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
      getCriteria = () => ({...criteria, target});
    }
    const eventPlayback = user.cap.list.includes('draft/event-playback');
    if (eventPlayback) {
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
      const last = nonEventMessages[nonEventMessages.length-1];
      const earliestTs = first.timestamp < last.timestamp ? first.timestamp : last.timestamp;
      const latestTs = earliestTs === first ? last.timestamp : first.timestamp;
      if (nonEventMessages.length) {
        criteria = { timestamp: { $gt: earliestTs, $lt: latestTs } };
      }
    }
    logger.debug("Chathistory criteria:", criteria);
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
      order: [sort],
      limit: eventPlayback ? undefined : limit
    });

    // query.limit(Math.max(Math.round/(limit / server.chatBatchSize), 1));
    // const matchingLogs = await query;

    // const cursor = query.cursor();
    // let current;
    // do {
    //   current = await cursor.next();
    //   if (current) {
    //     const hist = getMessages(current)
    //       .filter(
    //         m => filter(m)
    //       );
    //     hist.length && logger.debug("History", hist);
    //     messages.push(
    //       ...hist
    //     );
    //   }
    // } while (current && messages.length <= limit)
    // await cursor.close();
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
    logger.error("Chathistory error:", e);
  }

};