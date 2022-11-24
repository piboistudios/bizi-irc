const logger = require('../../logger').mkLogger('ircs:commands:cap:req')
/**
 * 
 * @param {import('../../user')} user 
 * @param {import('../../server')} server 
 * @param {{
 *  op: string,
 *  cap: string
 * }[]} reqs 
 */
module.exports = async function ls(user, server, reqs, reqStr) {
    logger.info("Begin CAP REQ, with capabilities:", reqs);
    const caps = new Set(user.cap.list);
    function nak() {
        user.send(server, "CAP", ["*", "NAK", ":" + reqStr]);
    }
    for (i in reqs) {
        const req = reqs[i];
        logger.debug("processing", req);
        if (req.op === 'add') {
            let capIndex = server.capabilities.indexOf(req.cap);
            capIndex === -1 && (capIndex = server.capabilities.findIndex(c => c.name === req.cap));
            if (capIndex !== -1) {
                caps.add(req.cap);
            } else
                return nak()
        } else if (req.op === 'remove') {
            if (caps.has(req.cap)) {
                caps.delete(req.cap);
            } else return nak()
        }
    }
    user.cap.list = Array.from(caps);
    if (!user.cap.version) user.cap.version = 302;
    logger.debug(user.cap);
    user.send(server, 'CAP', ["*", "ACK", ":" + reqStr]);

}