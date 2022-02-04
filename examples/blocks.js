#!/usr/bin/env node

const objc = require('../src/index');

const {wrap, types} = objc.__internal__;

const array = objc.ns(['i', 'am', 'the', 'doctor']);

const longestToShortest = new objc.Block(
  (arg0, arg1) => {
    // arg0 and arg1 are ObjC instance ptrs // TO DO: Block should automatically wrap these
    arg0 = wrap(arg0);
    arg1 = wrap(arg1);
    return arg0.length() > arg1.length() ? -1 : 1;
  },
  types.NSInteger, [types.id, types.id]); // return and argument types

const sorted = array.sortedArrayUsingComparator_(longestToShortest);
console.log(sorted); // [objc: ( doctor, the, am, i )]

