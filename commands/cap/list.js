const logger = require('../../logger').mkLogger('ircs:commands:cap:ls')
/**
 * 
 * @param {import('../../user')} user 
 * @param {import('../../server')} server 
 * @param {number} version 
 */
module.exports = async function ls(user, server) {
    logger.info("Begin CAP LIST");
    const capString = user.cap.list.join(' ');
    function sendCapString(capString) {
        let payload = capString;
        let remaining = '';
        if (capString.length > 510) {
            const capList = capString.split(' ');
            const remainingList = [];
            while (capString.length > 510) {
                remainingList.push(capList.pop());
                capString = capList.join(' ');
            }
            remaining = remainingList.join(' ');
        }
        user.send(server, 'CAP', ['*', 'LIST', ':' + payload]);
        if (remaining.length) sendCapString(remaining);
    }
    if (!user.cap.version) user.cap.version = 302;

    sendCapString(capString);
}