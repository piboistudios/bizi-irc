require('./mailbox-mail-message')
const { ObjectID } = require('bson'),
     mongoose = require('mongoose'),
    Schema = mongoose.Schema
/**
 * The stored schema is not actually an ldap schema, but we do have
 * the fields we need to store in order to return an ldap account
 * fully qualified under the posixAccount Schema AND/OR the inetOrgPerson
 * Schema
 **/
const mailboxSchema = new Schema({
    address: String,
    name: String,
    specialUse: String,
    modifyIndex: {
        default: () => 0,
        type: Number
    }
}, { toObject: { virtuals: true } });
mailboxSchema.virtual('path').get(function () { return this.name; })
mailboxSchema.virtual('uidValidity').get(function () { return Math.round(this._id.getTimestamp().getTime()) / 1000 });
mailboxSchema.post(/^find/, async function () {
    if (!this.modifyIndex) {
        this.modifyIndex = 0
    }
    
});
mailboxSchema.virtual('messages', {
    foreignField: 'mailboxId',
    localField: '_id',
    ref: 'MailboxMailMessage'
})
module.exports = mongoose.model("Mailbox", mailboxSchema);
