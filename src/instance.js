const runtime = require('./runtime');
const ref = require('ref');
const Selector = require('./selector');
const types = require('./types');
const {InstanceProxy} = require('./proxies');
const Block = require('./block');

const convert = require('./convert');


// we cache these since we use them a lot
// can't use Instance, sorry. TODO figure out a way that lets us use instance
const cls_NSString = runtime.objc_getClass('NSString');
const sel_stringWithUTF8String = runtime.sel_getUid('stringWithUTF8String:');

let cls = {}; // internally cached objc classes used for converting objects between js and objc land


class Instance {
  constructor(args) {
    if (typeof args === 'string') {
      this.type = 'class';
      this.ptr = runtime.objc_getClass(args);
    } else if (typeof args === 'object') {
      // todo check whether the object is a class or an instance
      // object_isClass or something like that
      this.type = 'instance';
      this.ptr = args;
    }
  }


  respondsToSelector(selector) {
    return !this.methodForSelector(selector).isNull();
  }

  methodForSelector(selector) {
    if (this.type === 'class') {
      return runtime.class_getClassMethod(this.ptr, selector.ptr);
    } else {
      return runtime.class_getInstanceMethod(runtime.object_getClass(this.ptr), selector.ptr);
    }
  }


  call(selector, ...args) {

    if (typeof selector === 'string') {
      selector = new Selector(selector);
    }

    //console.log(`calling ${selector.name}`);


    for (let permutation of selector.permutations()) {
      if (this.respondsToSelector(permutation)) {
        selector = permutation;
        break;
      }
    }

    let method = this.methodForSelector(selector);

    if (typeof method === 'undefined' || method.isNull()) {
      console.log(`unable to find method ${selector.name} on object ${this.description()}`);
      return null;
      //process.exit(1);
    }


    const expectedNumberOfArguments = runtime.method_getNumberOfArguments(method);

    // todo keep the "original" argtypes around as well (we'll need that below
    // to decide whether we should convert strings to NSStrings or classes w/ that name)
    const argumentTypes = [...Array(expectedNumberOfArguments).keys()].map(i => {
      const expected = runtime.method_copyArgumentType(method, i);
      if (expected === '^@') {
        console.log('REF');
        return ref.refType('pointer');
      }
      return types[expected];
    });

    const returnType = runtime.method_copyReturnType(method);
    //console.log(`returnType: ${returnType} SEL ${selector.name}`);

    args = args.map((arg, idx) => {
      idx += 2;

      if (arg instanceof Block) {
        return arg.makeBlock();
      }

      if (arg === null) {
        return arg;
      };

      if (arg !== null && typeof arg === 'object' && typeof arg.ptr !== 'undefined') {
        return arg.ptr;
      }

      // If the method expects id, SEL or Class, we convert arg to the expected type and return the pointer
      const expectedArgumentType = runtime.method_copyArgumentType(method, idx);
      if (['@', ':', '#'].includes(expectedArgumentType)) {
        const _obj = Instance.ns(arg, expectedArgumentType);
        return _obj !== null ? _obj.ptr : null;
      }

      return arg;
    })

    const msgSend = runtime.msgSend(types[returnType], argumentTypes);

    let retval;

    try {
      retval = msgSend(this.ptr, selector.ptr, ...args);
    } catch (e) {
      const exc = new InstanceProxy(new Instance(e));

      let error = new Error(`${exc.name()} ${exc.reason()}`);
      throw error;
    } finally {

    }


    if (returnType === '@') {
      return InstanceProxy(new Instance(retval));
    } else if (returnType === 'c') {
      return Boolean(retval);
    } else {
      return retval;
    }

  }


  description() {
    return this.call('debugDescription').UTF8String();
  }

  class() {
    return runtime.class_getName(this.type === 'class' ? this.ptr : this.call('class'));
  }


  static proxyForClass(classname) {
    return new InstanceProxy(new Instance(classname));
  }


  static loadClassesIfNecessary() {
    if (Object.getOwnPropertyNames(cls).length !== 0) {
      return;
    }

    [
      'NSDate',
      'NSString',
      'NSNumber',
      'NSArray',
      'NSMutableArray',
      'NSDictionary',
      'NSMutableDictionary'
    ].forEach(name => { cls[name] = Instance.proxyForClass(name); });
  }



  static js(object) {
    Instance.loadClassesIfNecessary();

    if (object.isKindOfClass_(cls.NSString)) {
      return object.UTF8String();
    }

    if (object.isKindOfClass_(cls.NSNumber)) {
      return object.doubleValue();
    }

    if (object.isKindOfClass_(cls.NSDate)) {
      return new Date(object.timeIntervalSince1970() * 1000);
    }

    if (object.isKindOfClass_(cls.NSArray)) {
      let newArray = [];
      for (let obj of object) {
        newArray.push(Instance.js(obj));
      }
      return newArray;
    }

    if (object.isKindOfClass_(cls.NSDictionary)) {
      let newObject = {};
      for (let key of object) {
        newObject[String(key)] = Instance.js(object.objectForKey_(key));
      }

      return newObject;
    }

    // not sure how to handle this, we'll return null
    return null;
  }

  // 'Convert' a JavaScript object to its objc counterpart
  // String -> NSString
  // Date   -> NSDate
  // Number -> NSNumber
  // Array  -> NSArray
  // Object -> NSDictionary
  // note: this function accepts a second parameter, which is a hint as to the expected type encoding of the objc object.
  //       the default value is '@' (aka id in objc land), but you can specify ':' or '#' to convert strings to Selectors or Classes
  static ns(object, hint='@') {
    //if (typeof object === 'function') {
    //  throw new TypeError(`Unsupported parameter type: ${typeof object}`);
    //}

    Instance.loadClassesIfNecessary();

    // String -> {NSString|SEL|Class}
    if (typeof object === 'string' || object instanceof String) {
      // convert to NSString, SEL or Class, depending on the hint
      if (hint === '@') {
        return cls.NSString.stringWithUTF8String_(object);
      } else if (hint === ':') {
        return new Selector(object);
      } else if (hint === '#') {
        return Instance.proxyForClass(object);
      }
    }

    // Date -> NSDate
    if (object instanceof Date) {
      const secondsSince1970 = Number(object) / 1000;
      return cls.NSDate.dateWithTimeIntervalSince1970_(secondsSince1970);
    }

    // Array -> NSArray
    if (Array.isArray(object)) {
      const newArray = cls.NSMutableArray.array();

      for (var i = 0; i < object.length; i++) {
        newArray.addObject_(this.ns(object[i]));
      }
      return newArray;
    }

    // Number -> NSNumber
    if (typeof object === 'number') {
      return cls.NSNumber.numberWithDouble_(object);
    }

    // Object -> NSDictionary
    if (typeof object === 'object') {
      const dictionary = cls.NSMutableDictionary.new();

      for (let key of Object.getOwnPropertyNames(object)) {
        dictionary.setObject_forKey_(object[key], key);
      }

      return dictionary;
    }

    // not sure how to handle this, we'll return null
    return null;
  }
}


module.exports = Instance;
