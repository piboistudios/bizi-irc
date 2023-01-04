const { mkLogger } = require('../logger');
const { randomUUID } = require('crypto');
const ChatLog = require('../models/chatlog');
const logger = mkLogger('ircs:commands:chathistory');
const {
  RPL_AWAY,
  ERR_NEEDMOREPARAMS,
} = require('../replies');
const Message = require('../message');
function getMessages({ messages }) {
  return messages.flatMap(m => {
    if (m.batch) return m.batch.length ? m.batch.map(m => new Message(m.prefix, m.command, m.parameters, { ...m.tags, account: m.user })) : [];

    const r = new Message(m.prefix, m.command, m.parameters, { ...m.tags, account: m.user });

    return r;
  })
}
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
        let chatlog = server.chatlog;
        let msg = chatlog.messages.find(m => m.tags.msgid === value);
        if (!msg)
          chatlog = await ChatLog.findOne({
            messages: {
              tags: {
                msgid: value
              }
            }
          });
        if (chatlog) {
          if (!msg) msg = chatlog.messages.find(m => m.tags.msgid === value);
          if (!msg) return new Date();
          value = new Date(msg.tags.time);
        } else return new Date();
      }
      return new Date(value);
    }))
    if (parameters.length > 4) {
      timestampOrMsgIdEnd = timestamps[1];
    }
    const timestampOrMsgId = timestampOrMsgIdBegin = timestamps[0];
    const limit = Math.min(timestampsOrMsgIds.pop(), server.maxScrollbackSize);

    const v = timestamps[0];
    let criteria = {}, predicate = () => false, sort = { timestamp: -1 };
    switch (subcommand) {
      case 'BEFORE':
        if (v) {
          criteria = { timestamp: { $lt: v } };
          predicate = m => new Date(m.tags.time).getTime() < v.getTime();
        }
        break;
      case 'AROUND':
      case 'AFTER':
        if (v) {

          criteria = { timestamp: { $gt: v } };
          predicate = m => new Date(m.tags.time).getTime() > v.getTime()
          sort = { timestamp: 1 };
        }
        break;
      case 'LATEST':
        if (v) criteria = { timestamp: { $gt: v } }
        predicate = m => new Date(m.tags.time).getTime() > v.getTime();
        sort = { timestamp: -1 }
        break;
      case 'BETWEEN':
        criteria = { timestamp: { $gt: timestamps[0], $lt: timestamps[1] } };
        predicate = m => {
          const time = new Date(m.tags.time).getTime();
          return time > timestamps[0].getTime() && time < timestamps[1].getTime();
        }
        break;
      case 'TARGETS':

        return user.send({
          batch: [batchStartCmd, batchEndCmd]
        });
    }
    const originalPredicate = predicate;
    if (['#', '&'].indexOf(target.charAt(0)) === -1) {

      logger.trace(user.mask());

      predicate = m => {
        logger.trace(m.prefix.split('!').shift(), 'vs', user.nickname);
        logger.trace(m.prefix.split('!').shift(), 'vs', target);
        logger.trace(m.target, 'vs', user.nickname, 'or', target)
        logger.debug(m);
        const fromThem = (m.target === user.nickname && m.prefix.split('!').shift() === target);
        const fromMe = (m.target === target && m.prefix.split('!').shift() === user.nickname);
        logger.info({ fromMe, fromThem })
        const result = (fromThem || fromMe);
        return originalPredicate(m) && result;
      }
    } else {
      predicate = m => {
        const result = m.target === target;
        logger.debug("Matches channel???", m.target, target, result);
        const o_result = originalPredicate(m);
        logger.debug("Matches originalPredicate?", '' + originalPredicate, o_result);
        logger.debug("times: m.tags.time:", m.tags.time, "timestamps:", timestamps);
        return o_result && result;
      }
    }
    logger.debug("Chathistory criteria:", criteria);
    logger.debug("Chathistory query:", '' + predicate);
    /**
     * 
     * @param {import('../message')} m 
     * @param {*} whitelist 
     * @returns 
     */
    const filter = (m, whitelist = ["PRIVMSG", "NOTICE", "TAGMSG", "MODE", "BATCH"]) => {
      const ret = predicate(m)
        && whitelist.indexOf(m.command.toUpperCase()) !== -1;
      logger.debug(`Does`, { msg: '' + m }, 'match?', ret);
      logger.debug('predicate:', '' + predicate);
      logger.debug('whitelist:', whitelist, 'command:', m.command.toUpperCase());
      return ret;
    }
    const msgs = getMessages(server.chatlog);
    const messages = msgs.filter(m => filter(m));
    logger.debug("inital messagessssss..", msgs.map(m => {
      m._target = m.target;
      return m;
    }));
    logger.debug("filtered?", messages);
    let query = ChatLog.find(criteria);
    if (sort) query = query.sort(sort);
    // query.limit(Math.max(Math.round/(limit / server.chatBatchSize), 1));
    // const matchingLogs = await query;
    const cursor = query.cursor();
    let current;
    do {
      current = await cursor.next();
      if (current) {
        const hist = getMessages(current)
          .filter(
            m => filter(m)
          );
        hist.length && logger.debug("History", hist);
        messages.push(
          ...hist
        );
      }
    } while (current && messages.length <= limit)
    await cursor.close();
    const batch = messages.map(m => {
      m.tags = m.tags || {};
      m.tags.batch = m.tags.batch || batchId;
      return m;
    })
    batch.unshift(batchStartCmd);
    batch.push(batchEndCmd);
    if (!batch.length) return;
    user.send({
      batch,
    });
  } catch (e) {
    logger.error("Chathistory error:", e);
  }

};