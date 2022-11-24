require('./mail-message')
require('./mailbox')

const mongoose = require('mongoose'),
    Schema = mongoose.Schema
/**
 * The stored schema is not actually an ldap schema, but we do have
 * the fields we need to store in order to return an ldap account
 * fully qualified under the posixAccount Schema AND/OR the inetOrgPerson
 * Schema
 **/
const mailboxMailMessageSchema = new Schema({
    mailboxId: Schema.Types.ObjectId,
    mailMessageId: Schema.Types.ObjectId

}, { toObject: { virtuals: true } });
mailboxMailMessageSchema.virtual('mailbox', {
    ref: 'Mailbox',
    foreignField: '_id',
    localField: 'mailboxId'
});
mailboxMailMessageSchema.virtual('mailMessage', {
    ref: 'MailMessage',
    foreignField: '_id',
    localField: 'mailMessageId',
    justOne: true
});
module.exports = mongoose.model("MailboxMailMessage", mailboxMailMessageSchema);
