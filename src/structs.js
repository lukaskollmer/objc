const struct = require('ref-struct');

const structs = {};

module.exports = {
  defineStruct: (name, fields) => {
    if (name in structs) {
      throw new Error(`Struct '${name}' is already defined`);
    }
    const type = struct(fields);
    structs[name] = type;
    return type;
  },

  getStructType: name => structs[name]
};
