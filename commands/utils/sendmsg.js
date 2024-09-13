/** 
 * @typedef {(arg:{user:import('../../user'), server:import('../../server'), dest: {isChannel: true, target: import('../../channel').Channel} | {isChannel: false, target: import('../../user')}}, next: ()=>void) => void} Handler
*/
/** 
 * @typedef {(arg:{user:import('../../user'), server:import('../../server'), msg:import('../../message'), dest: {isChannel: true, target: import('../../channel').Channel} | {isChannel: false, target: import('../../user')}}, next: ()=>void) => void} Queue
*/
/**
 * @callback ChanSendAuthz
 * @param {Object} arg0
 * @param {import('../../user')} arg0.user
 * @param {import('../../server')} arg0.server
 * @param {import('../../channel').Channel} arg0.target
 */
/**
 * @callback UserSendAuthz
 * @param {Object} arg0
 * @param {import('../../user')} arg0.user
 * @param {import('../../server')} arg0.server
 * @param {import('../../user')} arg0.target
 */
const Message = require('../../message');
const {
    ERR_NOSUCHNICK, ERR_CANNOTSENDTOCHAN, RPL_AWAY
} = require('../../replies')

/**
 * @typedef {Object} arg0 
 * @property {string} target - channel, nick or nickmask to send message to
 * @property {import('../../message')} msg - the message being processed by the server
 * @property {Handler} unauthorized - called when a user who is not logged in is responsible for this message
 * @property {Handler} forbidden - called when a user who does not have proper permissions is responsible for this message
 * @property {Handler} away - called when the target (or targets) are away
 * @property {Queue} queue - called before the message is sent
 * @property {Handler} sent - called after the messasge is sent
 * @property {ChanSendAuthz} chanSendAuthz - additional authorization requirements for the channel
 * @property {UserSendAuthz} userSendAuthz - additional authorization requirements for the channel
 * @param {arg0} arg0

 */
module.exports = async function sendmsg(arg0) {
    const { target: targetName, msg, } = arg0;
    let { unauthorized, forbidden, away, queue, sent, chanSendAuthz, userSendAuthz } = arg0;
    let logger = require('../../logger').mkLogger('ircs:commands:sendmsg:' + msg.command)
    logger.trace("Sendmsg:", arg0);
    const { user, server } = msg;
    const forwarded = new Message(user, msg.command, msg.parameters, { ...msg.tags, label: undefined });
    unauthorized ??= ({ user, server }) => {
        user.send(user, "FAIL", [msg.command, 'NEED_REGISTRATION', ':You must be logged in to send messages. Anonymous users can only view previews of public chats.']);
        return server.sendSignUpNote(user, msg.command);
    };
    forbidden ??= ({ user, server }) => {
        return user.send(server, ERR_CANNOTSENDTOCHAN, [target.name, ':Cannot send to channel']);
    }
    away ??= ({ user, server }, next) => {
        user.send(server, RPL_AWAY, [target.nickname, target.away]);
        next();
    }
    sent ??= () => {

    }
    queue ??= (_, next) => next();
    chanSendAuthz ??= () => [true];
    userSendAuthz ??= () => [true];
    logger.trace("cap:", user.cap.list);

    let target
    if (server.chanTypes.includes(targetName[0])) {

        logger = logger.sub('channel');
        logger.trace("Checking principal...");
        logger.trace("Finding chan...");
        target = await server.findChannel(targetName);
        const dest = { isChannel: true, target }
        if (!user.principal) {
            let halt = true;
            logger.trace("Unauthorized");
            await unauthorized({ user, server, dest }, () => { halt = false });
            if (halt) return;
        }

        if (target) {
            logger.trace("chan found:", target.name)
            const authz = await chanSendAuthz({ user, server, dest, target });
            const cannotSendChan = [
                target.modes.has('m') && !target.hasOp(user) && !target.hasVoice(user),
                target.modes.has('n') && !target.hasUser(user),
                ...(authz instanceof Array ? authz : [authz]).map(r => !r)
            ].reduce((l, r) => l || r, false);
            if (cannotSendChan) {
                let halt = true;
                logger.trace("forbidden");
                await forbidden({ user, server, dest }, () => { halt = false });
                if (halt) return;
            }
            let halt = true;
            logger.trace("queueing...");
            await queue({ user, server, dest, msg: forwarded }, () => { halt = false });
            if (halt) return;
            logger.trace("broadcasting...");
            target.broadcast(forwarded);

            await sent({ user, server, dest }, () => { });
            logger.trace("Sent");
        }
        else logger.trace("chan not found");
    } else {
        logger = logger.sub('user');
        logger.trace("finding user...");
        target = await server.findUser(targetName);
        const dest = { isChannel: false, target }
        if (target) {
            logger.trace("user found:", target.nickname);
            const authz = await userSendAuthz({ user, server, target });
            const cannotSendUser = (authz instanceof Array ? authz : [authz]).reduce((l, r) => l || !r, false);
            if (cannotSendUser) return;
            if (target.away) {
                let halt = true;
                await away({ user, server, dest }, () => { halt = false });
                if (halt) return;
            }
            let halt = true;
            logger.trace("Queueing...");
            await queue({ user, server, dest }, () => { halt = false });
            if (halt) return;
            logger.trace("Sending...");
            (user.principal || !target.ignoresUnidentified) && target.send(forwarded);
            await sent({ user, server, dest }, () => { });
            logger.trace("Sent");
        } else logger.trace("user not found");
    }
    if (user.cap.list.includes('echo-message')) {

        if (msg.tags.label)
            forwarded.tags.label = msg.tags.label;
        user.send(forwarded);
    }
    logger.debug("target name:", targetName);
}