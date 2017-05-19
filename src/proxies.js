const possibleSelectors = require('./possible-selectors');

function ObjCProxy(object) {
  let pointer = object;
  return new Proxy(object, {
    get: (target, name) => {
      if (name === Symbol.toPrimitive) { // this is called for string substitutions like `obj: ${obj}`
        return hint => {
          if (hint === 'string' && pointer.call('isKindOfClass:', 'NSString')) { // NSMutableString
            return pointer.call('UTF8String');
          } else if (hint === 'number' && pointer.call('isKindOfClass:', 'NSNumber')) {
            return pointer.call('doubleValue');
          }
          return pointer.description();
        };
      }

      if (name === Symbol.iterator) {
        let enumerator = (new MethodProxy(pointer, 'objectEnumerator'))();
        return function * () {
          var nextObject;
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
        let description = pointer.isNil() ? '<nil>' : pointer.description();
        return () => {
          let type = pointer.type() === 0 ? 'Class' : 'Instance';
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

    set: (target, key, value) => {
      if (key === '__ptr') {
        pointer = value;
      }
    }
  });
}

function MethodProxy(object, methodName) {
  return new Proxy(() => {}, {
    get: (target, name) => {
      if (name === 'inspect') {
        return () => `[objc.MethodProxy for ${methodName}]`;
      }
    },

    apply: (target, thisArg, argv) => {
      let type = object.type() === 0 ? 'class' : 'instance';
      let methods = object.methods(type);

      let selector = possibleSelectors(methodName).filter(sel => methods.includes(sel))[0];

      let retval = object.call(selector, ...argv);
      let returnType = object.returnTypeOfMethod(selector);

      if (returnType === '@' && typeof retval === 'object') { // Why check for object type as well? Because some objects (like NSString, NSNumber, etc) are returned as native JS values
        return new ObjCProxy(retval);
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
  ObjCProxy,
  MethodProxy
};
