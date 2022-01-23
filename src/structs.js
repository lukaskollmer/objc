// define C structs, e.g. NSRange, which client code can instantiate and pass to/from methods

// as with Block and create-class, it may be possible to consolidate the APIs for constructing signatures; bear in mind that .bridgesupport support (if implemented) would also use this (for now, non-introspectable [non-ObjC] APIs must be manually bridged, including all CoreFoundation-based APIs [most of CF's own functionality is already natively accessible in Foundation, but some parts aren't and some modern OS APIs are C-based so use CF types rather than Foundation equivalents])

const ref = require('ref-napi')
const struct = require('ref-struct-di')(ref); // the ref APIs' logic is not easy to follow; it suggests the struct module can be parameterized with custom types, and over in ./types.js we extend the standard ref-napi (C) types with familiar ObjC types, but that isn't passed here so presumably structs don't have access?

const CompoundInit = Symbol('structs.CompoundInit');
const IsStructSymbol = Symbol();
const _structs = {}; // cached struct types

const createStructInitializer = (name, StructType) => {
  const fields = Object.getOwnPropertyNames(StructType.fields).sort((key0, key1) => {
    return StructType.fields[key0].offset - StructType.fields[key1].offset;
  });

  StructType.new = function (...args) { // TO DO: why does user have to call `StructType.new(…)` and not the familiar `new StructType(…)`?
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
  StructType[IsStructSymbol] = true;
  return StructType;
};

module.exports = {
  CompoundInit,

  defineStruct: (name, fields) => {
    if (name in _structs) {
      throw new Error(`Struct '${name}' is already defined`);
    }
    const type = struct(fields);
    if (name !== null) {
      _structs[name] = type;
    }
    return createStructInitializer(name, type);
  },

  getStructType: name => _structs[name],

  isStructFn: obj => obj[IsStructSymbol] === true
};
