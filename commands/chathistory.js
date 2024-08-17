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
const escapeLib = import('escape-string-regexp');
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


    if (parameters.length < 1) {
      return user.send(server, ERR_NEEDMOREPARAMS, ['chathistory', ':Not enough parameters']);
    }
    let [subcommand, target, ...timestampsOrMsgIds] = parameters;
    const batchId = randomUUID();
    const batchStartCmd = new Message(server, "BATCH", [`+${batchId}`, "chathistory", target]);
    const batchEndCmd = new Message(server, "BATCH", [`-${batchId}`]);
    let timestampOrMsgIdEnd;
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
      }
      return new Date(value);
    }))
    if (parameters.length > 4) {
      timestampOrMsgIdEnd = timestamps[1];
    }

    const v = timestamps[0];
    let criteria = {



    }, sort = ['timestamp', 'ASC'];
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
      case 'TARGETS':

        return user.send({
          batch: [batchStartCmd, batchEndCmd]
        });
    }
    if (['#', '&'].indexOf(target.charAt(0)) === -1) {

      logger.trace(user.mask());
      criteria = {
        ...criteria,
        $or: [
          {
            target: user.nickname,
            prefix: target
          },
          {
            target: user.nickname,
            prefix: { $like: `${target}!%@%`}
          },
          {
            target,
            prefix: user.mask()
          }
        ]
      }
    } else {
      criteria.target = target;
    }
    logger.debug("Chathistory criteria:", criteria);
    logger.debug("Sort:", sort);
    let messages = await ChatLog.findAll({
      where: symbolify({
        ...criteria, command: {
          $in: ['PRIVMSG', 'NOTICE', 'BATCH'].concat(user.cap.list.includes('draft/event-playback')
            ? ['TAGMSG', 'JOIN', 'PART', 'QUIT', 'MODE', 'TOPIC', 'NICK']
            : []
          )
        }
      }), order: [sort]
    })

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