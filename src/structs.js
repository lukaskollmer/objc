const ref = require('ref-napi')
const struct = require('ref-struct-di')(ref);

const CompoundInit = Symbol('structs.CompoundInit');
const structs = {};

const createStructInitializer = (name, StructType) => {
  const fields = Object.getOwnPropertyNames(StructType.fields).sort((key0, key1) => {
    return StructType.fields[key0].offset - StructType.fields[key1].offset;
  });

  StructType.new = function (...args) {
    if (args.length === 0) {
      return new StructType();
    }

    const retval = new StructType();

    if (args.length === 2 && args[0] === CompoundInit) {
      for (const [key, value] of Object.entries(args[1])) {
        retval[key] = value;
      }
    } else { // Array-like init
      if (fields.length !== args.length) {
        throw new TypeError(`Invalid number of fields passed to '${name}' constructor. Expected ${fields.length}, got ${args.length}`);
      }
      args.forEach((arg, index) => {
        retval[fields[index]] = arg;
      });
    }

    return retval;
  };

  return StructType;
};

module.exports = {
  CompoundInit,

  defineStruct: (name, fields) => {
    if (name in structs) {
      throw new Error(`Struct '${name}' is already defined`);
    }
    const type = struct(fields);
    if (name !== null) {
      structs[name] = type;
    }
    return createStructInitializer(name, type);
  },

  getStructType: name => structs[name]
};
