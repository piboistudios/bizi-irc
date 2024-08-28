module.exports = opts => async function auth({ server, user, command, parameters, tags }, _, halt) {
    if (user?.principal) return;
    if (opts.sendFail) user.send(server, "FAIL", [command.toUpperCase(), 'NEED_REGISTRATION', ':You must be logged in to send messages. Anonymous users can only view previews of public chats.']);
    !opts.silent && server.sendSignUpNote(user, command.toUpperCase());
    halt(new Error("authentication required"));
}