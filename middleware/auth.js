const { mkLogger } = require("../logger");

const logger = mkLogger('auth');

module.exports = opts => 
    /**
     * 
     * @param {{
     *  server: import('../server')
     * }} param0 
     * @param {*} _ 
     * @param {(e?:Error) => void} halt 
     * @returns 
     */
    async function auth({ server, user, command, parameters, tags }, _, halt) {
    if (user?.principal) return;
    logger.debug("Server?", server);
    if (opts.sendFail) server.sendAnonInteractFail(user, command);
    !opts.silent && server.sendSignUpNote(user, command);
    halt(new Error("authentication required"));
}