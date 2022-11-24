const mongoose = require('mongoose'),
  Schema = mongoose.Schema,
  ObjectId = Schema.ObjectId;

const counterSchema = new Schema({
  name: String,
  count: Number
});


module.exports = mongoose.model("Counter", counterSchema);
