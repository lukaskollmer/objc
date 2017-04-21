
const ffi = require('ffi');
require('ref');
const binding = require('bindings')('objc.node');

const libobjc = new ffi.Library('libobjc', {
  objc_getClass: ['pointer', ['string']] // eslint-disable-line camelcase
});

module.exports = {
  getClass: name => {
    return libobjc.objc_getClass(name);
  },

  classExists: name => {
    let classPtr = libobjc.objc_getClass(name);
    return classPtr !== null && classPtr.address() !== 0;
  },

  import: name => {
    let path = `/System/Library/${name}.framework/${name}`;
    return new ffi.DynamicLibrary(path);
  },

  constant: (name, bundle) => {
    if (typeof bundle === 'string' && !bundle.startsWith('com.apple.')) {
      bundle = 'com.apple.' + bundle;
    }
    return binding.constant(name, bundle);
  }
};
