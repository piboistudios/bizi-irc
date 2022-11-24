const { mkLogger } = require('../logger');

const mongoose = require('mongoose'),
    Schema = mongoose.Schema;

/**
 * The stored schema is not actually an ldap schema, but we do have
 * the fields we need to store in order to return an ldap account
 * fully qualified under the posixAccount Schema AND/OR the inetOrgPerson
 * Schema
 **/
const mailMessageSchema = new Schema({
    flags: [String],
    diagnostics: {

    },
    data: {
        uuid: String,
        mail_from: String,
        rcpt_to: [String],
        header_lines: [String],
        data_lines: [String],
        data_bytes: Number,
        rcpt_count: [{
            accept: Number,
            tempfail: Number,
            reject: Number
        }],
        encoding: String,
        mime_part_count: Number,
        mimeTree: {},
        header: {
            headers: {},
            headers_decoded: {},
            header_list: [String]
        }
    },
    rawMsgId: Schema.Types.ObjectId,
    modified: Date,
    uid: Number,
    modseq: Number

}, { strict: false, toObject: { virtuals: true } });
const model = mongoose.model("MailMessage", mailMessageSchema);
const now = new Date();


mailMessageSchema.virtual('idate').get(function () { return this._id.getTimestamp() })
mailMessageSchema.virtual('date').get(function () { return this._id.getTimestamp() })

mailMessageSchema.pre('save', function (next) {
    this.modified = new Date();
    next()
});

module.exports = model;
// const t = new module.exports();
