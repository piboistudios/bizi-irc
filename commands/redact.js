const { mkLogger } = require('../logger');
const ChatLog = require('../models/chatlog');
const User = require('../models/user');
const sendmsg = require('./utils/sendmsg');
const logger = mkLogger('redact');
/**
 * @docs https://ircv3.net/specs/extensions/message-tags#the-tagmsg-tag-only-message
 * COMMAND: tagmsg
 * PARAMETERS: msgtarget
 * @param {import('../message')} msg 
 * @returns 
 */
module.exports = msg => {

    return sendmsg({
        target: msg.parameters[0],
        msg,
        async unauthorized({
            user,
            server
        }, next) {
            return user.send(server, 'FAIL', ['REDACT', 'INVALID_TARGET', msg.parameters[0], `:You cannot delete messages from ${msg.parameters[0]}`]);
        },
        async forbidden({
            user,
            server
        }, next) {
            return user.send(server, 'FAIL', ['REDACT', 'REDACT_FORBIDDEN', msg.parameters[0], msg.parameters[1], `:You are not authorised to delete this message`]);
        },
        async queue({
            user,
            server,
            msg,
            dest
        }, next) {

            const existing = await ChatLog.findAll({
                where: {
                    'tags.msgid': msg.parameters[1],
                    target: msg.parameters[0],
                },
            });
            const isOp = (dest.isChannel && (dest.target.hasOp(user) || dest.target.hasHalfOp(user)));
            if (!existing.length) {
                return user.send(server, 'FAIL', ['REDACT', 'UNKNOWN_MSGID', msg.parameters[0], msg.parameters[1], ':This message does not exist or is too old']);
            } else if (!isOp && !existing.every(msg => msg.user === user.uid)) {
                return this.forbidden({ user, server });
            }
            else {
                const TimeAgo = await timeAgoLib();
                const timeAgo = new TimeAgo('en-US');
                const result = await Promise.all(existing.map(log => (isOp || log.user === user.uid) && log.destroy()));
                logger.trace("Destroyed chat log:", result);
                const otherUser = await User.findOne({
                    where: {
                        uid: existing[0].user
                    }
                });
                msg.require('draft/message-redaction')
                    .fallback(
                        server,
                        'NOTICE',
                        [
                            msg.parameters[0],
                            `:${user.nickname} redacted a message ${otherUser ? `from ${otherUser.nickname} ` : ''}from ${timeAgo.format(new Date(msg.tags.time))}: ${[msg.parameters[2]]}`
                        ]
                    );
                return next();
            }
        }
    })
}
/**
 * @type {typeof import('javascript-time-ago').default}
 */
let lib;
async function timeAgoLib() {
    if (!lib) {

        const { default: TimeAgo } = await import('javascript-time-ago');
        const { default: en } = await import('javascript-time-ago/locale/en')

        TimeAgo.addDefaultLocale(en)
        lib = TimeAgo;
    }
    return lib;
}