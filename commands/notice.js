module.exports = async function notice({ user, server, tags, parameters: [targetName, content] }) {
  let target
  if (targetName[0] === '#' || targetName[0] === '&') {
    target = server.findChannel(targetName)
    if (target) {
      target.broadcast(user, 'NOTICE', [target.name, `:${content}`], tags)
    }
  } else {
    target = await server.findUser(targetName)
    if (target) {
      target.send(user, 'NOTICE', [target.nickname, `:${content}`], tags)
    }
  }
}
