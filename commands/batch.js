const { mkLogger } = require('../logger');

const logger = mkLogger('ircs:commands:batch');
/**
 * Command: batch
 * Parameters: <+|->[id] [type] [...parameters]
 * @docs https://ircv3.net/specs/extensions/batch
 * 
 * @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} msg 
 * @returns 
 */

module.exports = async function batch(msg) {
  const { user, server, parameters: [idTag, type, ...batchParams] } = msg;
  const [op, ...rest] = idTag.split('');
  const id = rest.join('');
  const existingBatch = server.batches[id];
  const ready = existingBatch && existingBatch.ready;
  logger.debug("BATCH", { ready, existingBatch });
  if (!ready) {

    if (op === '+') {
      server.batches[id] = Object.assign(server.batches[id] || {}, { user, type, batchParams, ready: false });
      if (!server.batches[id].commands) server.batches[id].commands = [];
      server.batches[id].commands.unshift(msg);
    } else if (op === '-') {
      process.nextTick(async () => {

        if (server.batches[id]) {
          server.batches[id].commands.push(msg);
          await server.finishBatch(id);
          delete server.batches[id];
        }
      })
    }
  }
  else {
    if (existingBatch.type === 'draft/multiline') {
      const [target] = existingBatch.batchParams;
      logger.debug("Target", { target });
      const chan = await server.findChannel(target);
      logger.debug("Channel found?", !!chan);
      if (chan) {
        await chan.broadcast(msg);
      } else {
        const user = await server.findUser(target);
        if (user) {
          await user.send(msg);
        }
      }
    }
  }
};