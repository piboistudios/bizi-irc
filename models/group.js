const mongoose = require('mongoose'),
  Schema = mongoose.Schema,
  ObjectId = Schema.ObjectId;

const groupSchema = new Schema({
  name: String,
  members: [
    { id: ObjectId, roles: Array }
  ]
});


module.exports = mongoose.model("Group", groupSchema);
