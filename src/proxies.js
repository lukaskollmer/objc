const Selector = require('./selector');
const util = require('util');





function InstanceProxy(object) {
  let self = object;

  return new Proxy({}, {
    get: (_, key) => {

      if (key === util.inspect.custom) {
        return (depth, options) => {
          return `[objc.InstanceProxy ${self.description()}]`;
        }
      } else if (key === Symbol.toPrimitive) {
        return hint => {
          if (hint === 'string') {
            return self.description();
          } else if (hint === 'number') {
            // todo implement this
            return -1;
          }
        }
      } else if (key === Symbol.iterator) {
        const isKindOfClass = MethodProxy(self, 'isKindOfClass_');

        // PLOT TWIST: what if self is already an enumerator? // TODO
        let enumerator;

        if (isKindOfClass('NSArray')) {
          enumerator = MethodProxy(self, 'objectEnumerator')();
        } else if (isKindOfClass('NSDictionary')) {
          // TODO should we enumerate over the keys or values, or should we return tuples???
          enumerator = MethodProxy(self, 'keyEnumerator')();
        }

        return function*() {
          let nextObject;
          while ((nextObject = enumerator.nextObject()) && !nextObject.ptr.isNull()) {
            yield nextObject;
          }
        }
      }


      // might be a Symbol
      key = String(key);

      if (key === 'ptr') {
        return self.ptr;
      }


      return MethodProxy(self, key);

    }
  })
}


const MethodProxy = (object, selector) => {
  const self = object;
  return new Proxy(() => {}, {
    get: (_, key) => {
      if (key === util.inspect.custom) {
        return (depth, options) => `[objc.MethodProxy '${self.type === 'class' ? '+' : '-'}[${object.class()} ${selector}]']`;
      }
    },

    apply: (target, _this, args) => {
      //console.log(`will call ${selector} on ${self.description()}`);


      // Add a trailing underscore to the selector if:
      // 1. There are more arguments than underscores
      // 2. The method doesn't already end w/ an underscore
      if ((selector.split('_').length - 1) < args.length && !selector.endsWith('_')) {
        selector += '_';
      }

      return self.call(new Selector(selector), ...args);

    }
  })
}






function ____InstanceProxy(object) {
  let pointer = object;
  return new Proxy(object, {
    get: (target, name) => {
      if (name === Symbol.toPrimitive) { // This is called for string substitutions like `obj: ${obj}`
        return hint => {
          if (hint === 'string' && pointer.call('isKindOfClass:', 'NSString')) { // NSMutableString
            return pointer.call('UTF8String');
          } else if (hint === 'number' && pointer.call('isKindOfClass:', 'NSNumber')) {
            return pointer.call('doubleValue');
          }
          return pointer.description(); // Should never reach here...
        };
      }

      if (name === Symbol.iterator) {
        const enumerator = (new MethodProxy(pointer, 'objectEnumerator'))();
        return function * () {
          let nextObject;
          while (nextObject = enumerator.nextObject()) { // eslint-disable-line no-cond-assign
            // nextObject is never `null` or `undefined`
            if (nextObject.__ptr.isNil() === true) {
              break;
            }
            yield nextObject;
          }
        };
      }

      name = String(name);
      if (name === 'Symbol(util.inspect.custom)') {
        const description = pointer.isNil() ? '<nil>' : pointer.description();
        return () => {
          const type = pointer.type() === 0 ? 'Class' : 'Instance';
          return `[objc.${type}Proxy ${description}]`;
        };
      } else if (name === '__ptr') {
        return pointer;
      } else if (name === '__instanceMethods') {
        return pointer.methods('instance');
      } else if (name === '__classMethods') {
        return pointer.methods('class');
      }

      return new MethodProxy(pointer, name);
    },

    // This only gets invoked from v8
    set: (target, key, value) => {
      if (key === '__ptr') {
        pointer = value;
      }
    }
  });
}

function ___MethodProxy(object, methodName) {
  return new Proxy(() => {}, {
    get: (target, name) => {
      if (name === 'inspect') {
        return () => `[objc.MethodProxy for ${methodName}]`;
      }
    },

    apply: (target, thisArg, argv) => {
      // Automatically add an underscore at the end if:
      // 1. There are more arguments than underscores
      // 2. The method doesn't end w/ an underscore

      if ((methodName.split('_').length - 1) < argv.length && !methodName.endsWith('_')) {
        methodName += '_';
      }

      const type = object.type() === 0 ? 'class' : 'instance';
      const methods = object.methods(type);

      const selector = possibleSelectors(methodName).filter(sel => methods.includes(sel))[0];

      let retval;
      try {
        retval = object.call(selector, ...argv);
      } catch (err) {
        throw err;
      }

      const returnType = object.returnTypeOfMethod(selector);

      if (returnType === '@' && typeof retval === 'object') { // Why check for object type as well? Because some objects (like NSString, NSNumber, etc) are returned as native JS values
        return new ____InstanceProxy(retval);
      }

      // Problem: objc BOOLs are encoded as char (c). this means that the c++ binding will never cast the return value to a BOOL.
      // We could simply convert all chars to JavaScript Booleans here, but that might not be a good idea bc it would also convert non-boolean chars. However, that probably wouldn't be a problem at all, since I don't know of a single objc method that returns a 'char'
      switch (returnType) {
        case 'c': return Boolean(retval);
        default: return retval;
      }
    }
  });
}

module.exports = {
  ____InstanceProxy,
  InstanceProxy,
  ___MethodProxy,
  MethodProxy
};
