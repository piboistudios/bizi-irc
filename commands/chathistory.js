const { mkLogger } = require('../logger');
const ChatLog = require('../models/chatlog');
const logger = mkLogger('ircs:commands:chathistory');
const {
  RPL_away,
  ERR_NEEDMOREPARAMS,
} = require('../replies');

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
    const batchParams = [target];
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
          type: 'chathistory',
          batch: [],
          params: batchParams
        });
    }
    logger.debug("Chathistory criteria:", criteria);
    logger.debug("Chathistory query:", '' + predicate);
    const filter = (m, whitelist = ["PRIVMSG", "NOTICE", "TAGMSG", "MODE"]) =>
      predicate(m)
      && whitelist.indexOf(m.command) !== -1
      && (m.parameters[0] === target || m.prefix.split('!').shift() === target);
    const msgs = server.chatlog.getMessages();
    const messages = msgs.filter(m => filter(m, ["PRIVMSG", "NOTICE", "TAGMSG", "JOIN", "KICK", "MODE"]));
    logger.debug("inital messagessssss..", msgs);
    let query = ChatLog.find(criteria);
    if (sort) query = query.sort(sort);
    // query.limit(Math.max(Math.round/(limit / server.chatBatchSize), 1));
    // const matchingLogs = await query;
    const cursor = query.cursor();
    let current;
    do {
      current = await cursor.next();
      if (current) {
        const hist = current
          .getMessages()
          .filter(
            m => filter(m)
          );
        logger.debug("History", hist);
        messages.push(
          ...hist
        );
      }
    } while (current && messages.length <= limit)
    await cursor.close();
    const batch = messages;
    if (!batch.length) return;
    user.send({
      type: 'chathistory',
      batch,
      params: batchParams
    });
  } catch (e) {
    logger.error("Chathistory error:", e);
  }

};