const { Sequelize, DataTypes, InferAttributes, InferCreationAttributes, Model } = require('sequelize');
const { db } = require('../state');
const h = require('./helpers/typed-init');



const ATTRIBUTES =  /**@type {const}*/({
  uid: {
    type: { name: "STRING", },
    primaryKey: true,
  },
  nickname: {
    type: { name: "STRING", },
    // unique: true
  },
  username: {
    type: { name: "STRING" },
  },
  realname: {
    type: { name: "STRING" },
  },
  _modes: {
    field: "modes",
    type: {
      name: "INTEGER"
    },

  },
  meta: {
    type: { name: "JSON" },
  },
  password: {
    type: {
      name: "STRING"
    }
  }

})


const pbkdf2 = require('@phc/pbkdf2')

const User = h(
  class User extends require('sequelize').Model {
    async verifypw(pw) {
      await Boolean(this.password) && pbkdf2.verify(this.password, pw)
    }
    static async hash(pw) {
      return pbkdf2.hash(pw);
    }
  },
  ATTRIBUTES,
  {
    // Other model options go here
    sequelize: db,
    modelName: "User"
  },
);

module.exports = User;