const logger = require('../../logger').mkLogger('ircs:commands:cap:ls')
/**
 * 
 * @param {import('../../user')} user 
 * @param {import('../../server')} server 
 * @param {number} version 
 */
module.exports = async function ls(user, server, version) {
    logger.info("Begin CAP LS version", version);
    user.cap.version = version;
    const capString = server.capList().join(' ');
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
        user.send(server, 'CAP', ['*', 'LS', ':' + payload]);
        if (remaining.length) sendCapString(remaining);
    }
    sendCapString(capString);
}