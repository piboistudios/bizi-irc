module.exports = async function ({ user }, _, halt) {
    logger.info("auth check... authorized?", !!user.principal);
    if (!user.principal) return halt(new Error("Unauthorized"));
}