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
            tags: {},
            batch: {
                type: [{
                    prefix: String,
                    command: String,
                    parameters: [String],
                    tags: {},
                }], default: () => null
            }
        }],
        default: []
    }
});

module.exports = mongoose.model("ChatLog", chatLog);
