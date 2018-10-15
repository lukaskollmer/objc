const objc = require('../');

const {wrap} = objc;
const {id, NSInteger} = objc.types;

const array = objc.ns(['i', 'am', 'the', 'doctor']);

const block = new objc.Block((arg0, arg1) => {
  arg0 = wrap(arg0);
  arg1 = wrap(arg1);

  return arg0.length() > arg1.length() ? -1 : 1;
}, NSInteger, [id, id]);

const sorted = array.sortedArrayUsingComparator_(block);
console.log(sorted);
