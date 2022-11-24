const mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId,
    Message = require('../message')

const chatLog = new Schema({
    timestamp: {
        type: Date,
        default: () => new Date()
    },
    messages: {
        type: [{
            user: String,
            prefix: String,
            command: String,
            parameters: [String],
            tags: {}
        }],
        default: []
    }
});
chatLog.methods.getMessages = function () {
    return this.messages.map(m => new Message(m.prefix, m.command, m.parameters, { ...m.tags, account: m.user }))
}

module.exports = mongoose.model("ChatLog", chatLog);
