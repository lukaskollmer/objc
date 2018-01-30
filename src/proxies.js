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


module.exports = {
  InstanceProxy,
  MethodProxy
};
