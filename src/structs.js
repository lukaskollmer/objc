const struct = require('ref-struct');

const structs = {};

const createStructInitializer = (name, StructType) => {
  const fields = Object.getOwnPropertyNames(StructType.fields).sort((key0, key1) => {
    return StructType.fields[key0].offset - StructType.fields[key1].offset;
  });

  StructType.new = function (...args) {
    if (args.length === 0) {
      return new StructType();
    }

    if (fields.length !== args.length) {
      throw new TypeError(`Invalid number of fields passed to '${name}' constructor. Expected ${fields.length}, got ${args.length}`);
    }

    const value = new StructType();
    args.forEach((arg, index) => {
      value[fields[index]] = arg;
    });
    return value;
  };

  return StructType;
};

module.exports = {
  defineStruct: (name, fields) => {
    if (name in structs) {
      throw new Error(`Struct '${name}' is already defined`);
    }
    const type = struct(fields);
    structs[name] = type;
    return createStructInitializer(name, type);
  },

  getStructType: name => structs[name]
};
