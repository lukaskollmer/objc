const util = require('util');
const Selector = require('./selector');

const MethodProxy = (object, selector) => {
  const self = object;
  return new Proxy(() => {}, {
    get: (_, key) => {
      if (key === util.inspect.custom) {
        return () => `[objc.MethodProxy '${self.type === 'class' ? '+' : '-'}[${object.class()} ${selector}]']`;
      }
    },

    apply: (target, _this, args) => {
      // Add a trailing underscore to the selector if:
      // 1. There are more arguments than underscores
      // 2. The method doesn't already end w/ an underscore
      if (!selector.endsWith('_') && (selector.split('_').length - 1) < args.length) {
        selector += '_';
      }

      return self.call(new Selector(selector), ...args);
    }
  });
};

function InstanceProxy(object) {
  const self = object;

  return new Proxy({}, {
    get: (_, key) => {
      if (key === util.inspect.custom) {
        return () => `[objc.InstanceProxy ${self.description()}]`;
      } else if (key === Symbol.toPrimitive) {
        return hint => {
          if (hint === 'number') {
            return MethodProxy(self, 'doubleValue')(); // eslint-disable-line new-cap
          }
          // Hint is either 'string' or 'default'
          return self.description();
        };
      } else if (key === Symbol.iterator) {
        const isKindOfClass = MethodProxy(self, 'isKindOfClass_'); // eslint-disable-line new-cap

        // PLOT TWIST: what if self is already an enumerator? // TODO
        let enumerator;

        if (isKindOfClass('NSArray') || isKindOfClass('NSSet')) {
          enumerator = MethodProxy(self, 'objectEnumerator')(); // eslint-disable-line new-cap
        } else if (isKindOfClass('NSDictionary')) {
          // TODO should we enumerate over the keys or values, or should we return tuples???
          enumerator = MethodProxy(self, 'keyEnumerator')(); // eslint-disable-line new-cap
        } else {
          throw new Error(`Can't iterate over non-enumerable type ${self.class()}`);
        }

        return function * () {
          let nextObject;
          while ((nextObject = enumerator.nextObject()) && !nextObject.ptr.isNull()) {
            yield nextObject;
          }
        };
      }

      // Might be a Symbol
      key = String(key);

      if (key === 'ptr') {
        return self.ptr;
      }

      return MethodProxy(self, key); // eslint-disable-line new-cap
    }
  });
}

module.exports = {
  InstanceProxy,
  MethodProxy
};
