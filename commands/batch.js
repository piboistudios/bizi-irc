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
  let batch = server.batches[id];
  // const ready = batch && batch.ready;
  // logger.debug("BATCH", { ready, batch });
  // if (!ready) {

  if (op === '+') {
    batch = server.batches[id] = Object.assign(batch || {}, { user, type, batchParams, ready: false });
    if (!server.batches[id].commands) server.batches[id].commands = [];
    batch.commands.unshift(msg);
  } else if (op === '-') {
    const currentTime = msg.tags.time instanceof Date ? msg.tags.time : new Date(msg.tags.time);
    msg.tags.time = new Date(currentTime.getTime() + 1).toISOString();
    if (batch) {
      batch.commands.push(msg);
      await server.finishBatch(id);
    }
  }

  const [target] = batch.batchParams;
  logger.debug("Target", { target });
  return server.sendTo(target, msg);
};