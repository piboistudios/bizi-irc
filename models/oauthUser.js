const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    id: String,
    email: String,
    avatar: String,
    name: String,
    logins: Number,
    lastLogin: Date,
    firstLogin: Date,
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }
})

module.exports = mongoose.model("OAuthUser", schema);