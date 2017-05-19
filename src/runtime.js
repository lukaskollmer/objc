
const ffi = require('ffi');
require('ref'); // eslint-disable-line import/no-unassigned-import
const binding = require('bindings')('objc.node');
const ObjCProxy = require('./proxies').ObjCProxy;
const ProxyType = require('./enums');

const libobjc = new ffi.Library('libobjc', {
  objc_getClass: ['pointer', ['string']] // eslint-disable-line camelcase
});

function _GetObjCClass(name) {
  // We can't require the objc module directly because we have to avoid circular dependencies
  return new ObjCProxy(new binding.Proxy(ProxyType.class, name));
}

module.exports = {
  getClass: name => {
    return libobjc.objc_getClass(name);
  },

  classExists: name => {
    const classPtr = libobjc.objc_getClass(name);
    return classPtr !== null && classPtr.address() !== 0;
  },

  import: name => {
    const path = `/System/Library/${name}.framework/${name}`;
    return new ffi.DynamicLibrary(path);
  },

  constant: (name, bundle) => {
    if (typeof bundle === 'string' && !bundle.startsWith('com.apple.')) {
      bundle = 'com.apple.' + bundle;
    }
    return binding.constant(name, bundle);
  },

  ref: object => {
    return {ref: object};
  },

  deref: object => {
    const ref = object.ref;

    if (typeof ref === 'undefined') {
      return undefined;
    }

    return new ObjCProxy(object.ref);
  },

  js: input => {
    // Convert an objc object to its native JavaScript counterpart (NSString -> String, NSNumber -> Number, etc)
    if (typeof input.__ptr === 'object' && input.isKindOfClass_('NSObject')) {
      if (input.isKindOfClass_('NSString')) {
        return String(input);
      } else if (input.isKindOfClass_('NSNumber')) {
        return Number(input);
      } else if (input.isKindOfClass_('NSArray')) {
        const array = [];
        for (let i = 0; i < input.count(); i++) {
          array.push(input.objectAtIndex_(i));
        }
        return array;
      } else if (input.isKindOfClass_('NSDate')) {
        const timeIntervalSince1970 = input.timeIntervalSince1970();
        // NSDate returns seconds, but JavaScript expects milliseconds
        return new Date(timeIntervalSince1970 * 1000);
      }
      // No native JavaScript type for this object, return the input
      return input;
    }
  },

  ns: input => {
    // Convert a JS object to its native objc counterpart (String -> NSString, Number -> NSNumber, etc)
    // TODO: Boolean -> NSNumber??
    switch (typeof input) {
      case 'string':
        return _GetObjCClass('NSString').stringWithString_(input);
      case 'number':
        return _GetObjCClass('NSNumber').numberWithDouble_(input);
      case 'object': {
        if (input.constructor === Array) {
          return _GetObjCClass('NSArray').arrayWithArray_(input);
        } else if (input.constructor === Date) {
          const secondsSince1970 = Number(input) / 1000;
          return _GetObjCClass('NSDate').dateWithTimeIntervalSince1970_(secondsSince1970);
        }
        return input;
      }
      default:
        return input;
    }
  }
};
