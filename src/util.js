/* eslint-disable no-multi-assign */

const Selector = require('./selector');
const Instance = require('./instance');
const {InstanceProxy} = require('./proxies');

const retainedGlobals = [];
module.exports._retainGlobal = obj => {
  retainedGlobals.push(obj);
};

const proxyForClass = classname => new InstanceProxy(new Instance(classname));

const ClassLoader = new Proxy({}, {
  get: (_, classname) => proxyForClass(classname)
});

const {
  NSBundle, NSDate, NSString, NSNumber, NSArray, NSMutableArray, NSDictionary, NSMutableDictionary
} = ClassLoader;

module.exports.importFramework = name => {
  const path = name.includes('/') ? name : `/System/Library/Frameworks/${name}.framework`;
  const bundle = NSBundle.bundleWithPath_(path);
  bundle.load();
};

const js = module.exports.js = (object, returnInputIfUnableToConvert = false) => {
  if (object.isKindOfClass_(NSString)) {
    return object.UTF8String(); // eslint-disable-line new-cap
  }

  if (object.isKindOfClass_(NSNumber)) {
    return object.doubleValue();
  }

  if (object.isKindOfClass_(NSDate)) {
    return new Date(object.timeIntervalSince1970() * 1000);
  }

  if (object.isKindOfClass_(NSArray)) {
    const newArray = [];
    for (const obj of object) {
      newArray.push(js(obj, true));
    }
    return newArray;
  }

  if (object.isKindOfClass_(NSDictionary)) {
    const newObject = {};
    for (const key of object) {
      newObject[String(key)] = js(object.objectForKey_(key), true);
    }

    return newObject;
  }

  // Return null if there's no JS counterpart for the objc type
  return returnInputIfUnableToConvert ? object : null;
};

const ns = module.exports.ns = (object, hint = '@') => {
  if (object.___is_instance_proxy === true) {
    return object;
  }

  // String -> {NSString|SEL|Class}
  if (typeof object === 'string' || object instanceof String) {
    // Convert to NSString, SEL or Class, depending on the hint
    if (hint === '@') {
      return NSString.stringWithUTF8String_(object);
    } else if (hint === ':') {
      return new Selector(object);
    }
    return proxyForClass(object);
  }

  // Date -> NSDate
  if (object instanceof Date) {
    const secondsSince1970 = Number(object) / 1000;
    return NSDate.dateWithTimeIntervalSince1970_(secondsSince1970);
  }

  // Array -> NSArray
  if (Array.isArray(object)) {
    const newArray = NSMutableArray.array();

    for (let i = 0; i < object.length; i++) {
      newArray.addObject_(ns(object[i]));
    }
    return newArray;
  }

  // Number -> NSNumber
  if (typeof object === 'number') {
    return NSNumber.numberWithDouble_(object);
  }

  // Object -> NSDictionary
  if (typeof object === 'object') {
    const dictionary = NSMutableDictionary.new();

    for (const key of Object.getOwnPropertyNames(object)) {
      dictionary.setObject_forKey_(object[key], key);
    }

    return dictionary;
  }

  // Return null if there's no objc counterpart for the js type
  return null;
};
