import test from 'ava';

const objc = require('./src/index');
const util = require('util');

const NULL_DESC = '[objc.InstanceProxy (null)]';

// TODO
// - test automatic conversion to String/Number using the constructor `Number(nsnumber_object)`

/*
Class loading
*/

test('Load existent class', t => {
  t.notThrows(() => {
    const {NSArray} = objc;
  });
});

test('Load non-existent class', t => {
  t.throws(() => {
    const {NSArrayy} = objc;
  });
});

test('class exists', t => {
  t.true(objc.runtime.classExists('NSString'));
  t.false(objc.runtime.classExists('ClassThatDoesntExist'));
});

/*
Framework loading
*/

test('[objc.import] import framework by absolute path', t => {
  objc.import('/System/Library/Frameworks/AppKit.framework');
  t.true(objc.runtime.classExists('NSApplication'));
});

// TODO find some other framework to import
//test('[objc.import] import framework by name', t => {
//  objc.import('CoreData');
//  t.true(objc.runtime.classExists('NSManagedObject'));
//})


/*
Class metadata (not yet implemented)
*/

test.skip('Class class methods', t => {
  const NSString = objc.NSString;

  const classMethods = NSString.__classMethods;

  t.is(Array.isArray(classMethods), true);

  // Includes methods inherited from NSObject
  t.true(classMethods.includes('load'));
  t.true(classMethods.includes('init'));

  // Includes NSString-specific methods
  t.true(classMethods.includes('stringWithCString:'));
  t.true(classMethods.includes('stringWithFormat:'));
  t.true(classMethods.includes('stringEncodingForData:encodingOptions:convertedString:usedLossyConversion:'));
});

test.skip('Class instance methods', t => {
  const NSString = objc.NSString;

  const classMethods = NSString.__instanceMethods;

  t.is(Array.isArray(classMethods), true);

  // Includes methods inherited from NSObject
  t.true(classMethods.includes('copy'));
  t.true(classMethods.includes('description'));

  // Includes NSString-specific methods
  t.true(classMethods.includes('length'));
  t.true(classMethods.includes('cStringUsingEncoding:'));
  t.true(classMethods.includes('compare:options:range:locale:'));
  t.true(classMethods.includes('getBytes:maxLength:usedLength:encoding:options:range:remainingRange:'));
});


/*
Object inspection
*/

test('description of class proxy', t => {
  const NSDate = objc.NSDate;

  const description = util.inspect(NSDate);

  t.is(description, '[objc.InstanceProxy NSDate]');
});

test('description of instance proxy', t => {
  const string = objc.NSString.stringWithString_('the north remembers');

  const description = util.inspect(string);

  t.is(description, '[objc.InstanceProxy the north remembers]');
});

test('description of class method proxy', t => {
  const method = objc.NSDate.date;

  t.is(util.inspect(method), `[objc.MethodProxy '+[NSDate date]']`);
});

test('description of instance method proxy', t => {
  const obj = objc.NSObject.new()

  const method = obj.description;

  t.is(util.inspect(method), `[objc.MethodProxy '-[NSObject description]']`);
});

test('description of null proxy', t => {
  const obj = objc.allocRef();
  obj.__ptr = obj.__ptr.deref();

  const description = util.inspect(obj);

  t.is(description, NULL_DESC);
});


/*
Implicit type conversion
*/

test('string creation', t => {
  const NSString = objc.NSString;
  const string = NSString.stringWithString_('Hello World');
  t.is(String(string), 'Hello World');
});

test('primitive argument types', t => {
  const NSNumber = objc.NSNumber;

  const number = NSNumber.numberWithInt_(5);

  t.is(number.intValue(), 5);
});

test('primitive return values', t => {
  const NSString = objc.NSString;
  const string = NSString.stringWithString_('I am the doctor');
  const length = string.length();
  t.is(length, 15);
  t.is(typeof length, 'number');
});

test('Null return value', t => {
  const NSDictionary = objc.NSDictionary;

  const dict = NSDictionary.dictionary();
  t.is(null, dict.objectForKey_('key'));
});

test('Automatic array conversion (JS array -> NSArray)', t => {
  const NSArray = objc.NSArray;

  const inputArray = ['I', 'am', 'the', 'doctor'];
  const array = NSArray.arrayWithArray_(inputArray);

  inputArray.forEach((object, index) => {
    const str1 = String(object);
    const str2 = String(array.objectAtIndex_(index));
    t.is(str1, str2);
  });
});

test('convert NSNumber to Number', t => {
  const number = objc.ns(12);

  t.is(12, +number);
});

test('pass primitive w/out objc counterpart', t => {
  const {NSMutableArray} = objc;
  const array = NSMutableArray.array();

  try {
    array.addObject_(() => {});
  } catch (err) {
    t.is(err.message, 'NSInvalidArgumentException *** -[__NSArrayM insertObject:atIndex:]: object cannot be nil');
  }
});


/*
Explicit type conversion
*/

// String

test('Type conversion JS -> ObjC: String', t => {
  const NSString = objc.NSString;

  const input = 'trust me. i am the doctor';
  const asNSString = objc.ns(input);

  t.true(asNSString.isKindOfClass_(NSString));
});

test('Type conversion ObjC -> JS: String', t => {
  const NSString = objc.NSString;

  const input = NSString.stringWithString_('trust me. i am the doctor');
  const asString = objc.js(input);

  t.is(asString, 'trust me. i am the doctor');
});

// Number

test('Type conversion JS -> ObjC: Number', t => {
  const NSNumber = objc.NSNumber;

  const input = 42;
  const asNSNumber = objc.ns(input);

  t.true(asNSNumber.isKindOfClass_(NSNumber));
});

test('Type conversion ObjC -> JS: Number', t => {
  const NSNumber = objc.NSNumber;

  const input = NSNumber.numberWithInt_(42);
  const asNumber = objc.js(input);

  t.is(asNumber, 42);
});

// Array

test('Type conversion JS -> ObjC: Array', t => {
  const NSArray = objc.NSArray;

  const input = ['time', 'and', 'relative', 'dimensions', 'in', 'space'];
  const asNSArray = objc.ns(input);

  t.true(asNSArray.isKindOfClass_(NSArray));
});

test('Type conversion ObjC -> JS: Array', t => {
  const NSArray = objc.NSArray;

  const items = ['time', 'and', 'relative', 'dimensions', 'in', 'space'];

  const input = NSArray.arrayWithArray_(items);
  const asArray = objc.js(input);

  t.deepEqual(items, asArray);
});

test('Type Conversion: JS Array containing objc objects -> NSArray', t => {
  const {NSArray, NSObject} = objc;

  const obj1 = NSObject.new();
  const obj2 = NSObject.new();
  const obj3 = NSObject.new();


  const input = [obj1, obj2, obj3];
  const asNSArray = objc.ns(input);

  t.true(asNSArray.isKindOfClass_(NSArray));
  t.is(3, asNSArray.count());
  t.true(asNSArray.objectAtIndex_(0).isEqual_(obj1));
  t.true(asNSArray.objectAtIndex_(1).isEqual_(obj2));
  t.true(asNSArray.objectAtIndex_(2).isEqual_(obj3));
});

// Date

test('Type conversion JS -> ObjC: Date', t => {
  const NSDate = objc.NSDate;

  const input = new Date('1963-11-23T17:16:20');
  const asNSDate = objc.ns(input);

  t.true(asNSDate.isKindOfClass_(NSDate));
});

test('Type conversion ObjC -> JS: Date', t => {
  const NSDate = objc.NSDate;

  const input = NSDate.date();
  const asDate = objc.js(input);

  t.true(asDate instanceof Date);
});

// Object

test('Type conversion JS -> ObjC: Object', t => {
  const input = {firstName: 'Lukas', lastName: 'Kollmer'};
  const objcValue = objc.ns(input);

  t.true(objcValue.objectForKey_('firstName').isEqualToString_('Lukas'))
  t.true(objcValue.objectForKey_('lastName').isEqualToString_('Kollmer'))
});

test('Type conversion ObjC -> JS: Object', t => {
  const {NSObject, NSString, NSMutableDictionary} = objc;

  // 1: convert a dictionary that contains only objects we can convert to JS

  const name = NSMutableDictionary.dictionary();
  name.setObject_forKey_('Lukas', 'first');
  name.setObject_forKey_('Kollmer', 'last');

  const me = NSMutableDictionary.dictionary();
  me.setObject_forKey_(name, 'name');
  me.setObject_forKey_(19, 'age');

  t.deepEqual(objc.js(me), {
    age: 19,
    name: {
      first: 'Lukas',
      last: 'Kollmer'
    }
  });

  // 2: add some objects that don't have a JS representation
  // We can't use `t.deepEqual` for this because that doesn't work with our proxies (ava seems to use lodash for that)

  const obj = NSObject.new();
  me.setObject_forKey_(obj, 'obj');

  const me_js = objc.js(me);

  t.is(19, me_js.age);
  t.deepEqual({first: 'Lukas', last: 'Kollmer'}, me_js.name);
  t.is(true, obj.isEqual_(me_js.obj));
});

// Selector

test('[selector] create from string', t => {
  const sel = new objc.Selector('allocWithCount:')
  t.is(sel.name, 'allocWithCount:');
});

test('[selector] create from pointer', t => {
  const sel = new objc.Selector(objc.runtime.sel_getUid('newWithValue:'));
  t.is(sel.name, 'newWithValue:');
})

test('Type conversion JS -> ObjC: Selector', t => {
  const input = 'localizedDescriptionForRegion:completionHandler:';
  const sel = objc.ns(input, ':');

  t.is(true, sel instanceof objc.Selector)
  t.is(input, sel.name);
});

// Unknown

test('Type conversion JS -> ObjC: Unknown', t => {
  const input = () => {};
  const objcValue = objc.ns(input);

  t.is(null, objcValue);
});

test('Type conversion ObjC -> JS: Unknown', t => {
  const NSProcessInfo = objc.NSProcessInfo;

  const input = NSProcessInfo.processInfo();
  const jsValue = objc.js(input);

  t.is(null, jsValue);
});



/*
Constants
*/

test('load constant', t => {
  objc.import('AppKit');
  const {NSFontAttributeName} = objc;

  t.is(NSFontAttributeName, 'NSFont');
});

test('load non-existent constant', t => {
  objc.import('AppKit');

  t.throws(() => {
    const {NSFontAttributeNamee} = objc;
  });
});



/*
Inout parameters
*/

test('inout parameters 1 (^@)', t => {
  const {NSFileManager, NSError} = objc;
  const fm = NSFileManager.defaultManager();

  const filepath = '/Library/Caches/randomfilenamethatsurelydoesntexist.hey';
  fm.createFileAtPath_contents_attributes_(filepath, null, null);

  const error1 = objc.allocRef();
  const success1 = fm.removeItemAtPath_error_(filepath, error1);

  t.is(success1, true);
  t.is(util.inspect(error1), NULL_DESC);
  t.true(objc.Instance.isNull(error1));

  const error2 = objc.allocRef();
  const success2 = fm.removeItemAtPath_error_(filepath, error2);

  t.is(success2, false);
  t.true(error2.isKindOfClass_(NSError));
  t.is(error2.code(), 4); // NSFileNoSuchFileError
});

test.skip('inout parameters 2 (^@)', t => {
  const {NSDictionary, NSAppleScript} = objc;

  const script = NSAppleScript.alloc().initWithSource_('telll application "Safari" to get URL of current tab of window 1');

  const error = objc.allocRef();
  const success = script.compileAndReturnError_(error);

  t.is(success, false);
  t.true(error.isKindOfClass_(NSDictionary));
});

test.skip('[inout parameters] `null` if not changed', t => {
  const {NSAppleScript} = objc;

  const script = NSAppleScript.alloc().initWithSource_(`tell application "System Events" to get name of current user`);
  const error = objc.allocRef();
  script.executeAndReturnError_(error);

  t.is(util.inspect(error), NULL_DESC);
  t.true(objc.isNull(error));
  t.true(objc.Instance.isNull(error));
});


/*
Selector handling
*/

test('Test calling methods that contain underscores', t => {
  const NSDate = objc.NSDate;

  const now = NSDate.date();
  const web_RFC1123DateString = now._web_RFC1123DateString();

  t.is(typeof web_RFC1123DateString, 'object');
  t.is(web_RFC1123DateString.isKindOfClass_('NSString'), true);
});

test('Trailing underscores in method names can be omitted', t => {
  const NSString = objc.NSString;

  const str1 = NSString.stringWithString_('Hello World');
  const str2 = NSString.stringWithString('Hello World');

  t.is(String(str1), String(str2));
});

test('Test possible selectors for 0 underscores', t => {
  const Selector = require('./src/selector');

  const selectors = ['date'];

  new Selector('date').permutations().forEach((_, index) => {
    selectors.splice(index, 1);
  });

  t.is(selectors.length, 0);
});

test('Test possible selectors for 1 underscore', t => {
  const Selector = require('./src/selector');

  const selectors = [
    'performAction:',
    'performAction_'
  ];

  for (let permutation of new Selector('performAction_').permutations().map(s => s.name)) {
    t.true(selectors.includes(permutation));
  }
});

test('Test possible selectors for 2 underscores', t => {
  const Selector = require('./src/selector');

  const selectors = [
    "performAction:withObject:",
    "performAction_withObject:",
    "performAction:withObject_",
    'performAction_withObject_'
  ];

  for (let permutation of new Selector('performAction_withObject_').permutations().map(s => s.name)) {
    t.true(selectors.includes(permutation));
  }
});

test('Test possible selectors for 3 underscores', t => {
  const Selector = require('./src/selector');

  const selectors = [
    'performAction:withObject_afterDelay:',
    'performAction:withObject_afterDelay_',
    'performAction:withObject:afterDelay_',
    'performAction_withObject:afterDelay:',
    'performAction_withObject:afterDelay_',
    'performAction_withObject_afterDelay:',
    'performAction:withObject:afterDelay:',
    'performAction_withObject_afterDelay_'
  ];

  for (let permutation of new Selector('performAction_withObject_afterDelay_').permutations().map(s => s.name)) {
    t.true(selectors.includes(permutation))
  }
});

test('Test possible selectors for method with leading underscore and no other underscores', t => {
  const Selector = require('./src/selector');

  const selectors = [
    '_dateString',
    ':dateString'
  ];

  for (let permutation of new Selector('_dateString').permutations().map(s => s.name)) {
    t.true(selectors.includes(permutation));
  }
});

test('Test possible selectors for method with leading underscore and other underscores', t => {
  const Selector = require('./src/selector');

  const selectors = [
    '_dateStringForTimeZone_',
    '_dateStringForTimeZone:',
    ':dateStringForTimeZone_',
    ':dateStringForTimeZone:'
  ];

  for (let permutation of new Selector('_dateStringForTimeZone_').permutations().map(s => s.name)) {
    t.true(selectors.includes(permutation));
  }
});


/*
Exception handling
*/
test('ObjC exception handling', t => {
  const NSMutableArray = objc.NSMutableArray;

  const array = NSMutableArray.array();

  array.addObject_('Hello');
  array.addObject_('World');

  t.throws(() => {
    array.addObject_(null);
  });
});

test('ObjC exception contains exception info', t => {
  const NSMutableArray = objc.NSMutableArray;

  const array = NSMutableArray.array();

  array.addObject_('Hello');
  array.addObject_('World');

  try {
    array.addObject_(null);
  } catch (err) {
    t.is(err.message, 'NSInvalidArgumentException *** -[__NSArrayM insertObject:atIndex:]: object cannot be nil');
  }
});


/*
Blocks
*/

test('Blocks: Sort NSString* array by length, longest to shortest', t => {
  const NSArray = objc.NSArray;
  const array = NSArray.arrayWithArray_(['I', 'Am', 'The', 'Doctor']);

  const block = new objc.Block((obj1, obj2) => {
    obj1 = objc.wrap(obj1);
    obj2 = objc.wrap(obj2);
    return obj1.length() > obj2.length() ? -1 : 1;
  }, 'q', ['@', '@']);

  const sortedArray = array.sortedArrayUsingComparator_(block);
  t.true(sortedArray.isEqualToArray_(['Doctor', 'The', 'Am', 'I']));
});

test('Blocks: objc.Block throws for missing block type encoding', t => {
  t.throws(() => {
    const block = new objc.Block(() => {});
  });
});

test('Blocks: objc.Block throws for incomplete block type encoding', t => {
  t.throws(() => {
    const block = new objc.Block(() => {}, 'v');
  });
});

test('Blocks: objc.Block passes for full block type encoding', t => {
  t.notThrows(() => {
    const block = new objc.Block(() => {}, 'v', []);
  });
});


/*
Iterators
*/

test('Iterate over a NSArray', t => {
  const NSArray = objc.NSArray;

  const inputArray = ['hey', 'missy', 'you', 'so', 'fine'];
  const array = NSArray.arrayWithArray_(inputArray);

  for (const element of array) {
    const index = inputArray.indexOf(String(element));
    inputArray.splice(index, 1);
  }

  t.is(inputArray.length, 0);
});

test('Iterate over a NSDictionary', t => {
  const {NSDictionary} = objc;

  const inputDict = {a: 1, b: 2, c: 3};
  const dictionary = NSDictionary.alloc().initWithObjects_forKeys_(['1', '2', '3'], ['a', 'b', 'c'])

  for (let key of dictionary) {
    key = String(key);
    t.is(true, Object.prototype.hasOwnProperty.call(inputDict, key));
    delete inputDict[key];
  }

  t.deepEqual({}, inputDict);
});

test('Iterate over a NSSet', t => {
  const {NSSet} = objc;

  const items = ['a', 'b', 'c']
  const set = NSSet.setWithArray_(items);

  for (const element of set) {
    const index = items.indexOf(String(element));
    items.splice(index, 1);
  }
  t.is(items.length, 0);
});

test('Iterate over non-enumerable', t => {
  const {NSObject} = objc;

  const obj = NSObject.new();

  t.throws(() => {
    for (let element of obj) {
    }
  });
});


/*
Method swizzling

(in all swizzling tests, we restore the original implementation to make sure it doesn't break any of the other tests)
*/

test('[method swizzling] swizzle class method', t => {
  const {NSDate} = objc;

  const restore = objc.swizzle(NSDate, 'date', () => {
    return NSDate.distantPast();
  }, 'class');

  t.true(NSDate.date().isEqualToDate_(NSDate.distantPast()));

  restore();
});

test('[method swizzling] swizzle instance method (primitive return type)', t => {
  const {NSProcessInfo} = objc;

  const restore = objc.swizzle(NSProcessInfo, 'processorCount', () => {
    return 12;
  });

  t.is(12, NSProcessInfo.processInfo().processorCount());

  restore();
});

test('[method swizzling] swizzle instance method (complex return type)', t => {
  const {NSObject} = objc;

  const restore = objc.swizzle(NSObject, 'description', () => {
    return objc.ns('hello there');
  });

  t.true(NSObject.new().description().isEqualToString_('hello there'));

  restore();
});

test('[method swizzling] swizzle instance method with parameters', t => {
  const {NSDate, wrap} = objc;

  const restore = objc.swizzle(NSDate, 'dateByAddingTimeInterval:', (self, _cmd, timeInterval) => {
    self = wrap(self);
    return self.xxx__dateByAddingTimeInterval_(timeInterval * 2);
  });

  const x = NSDate.alloc().initWithTimeIntervalSince1970_(0);
  const y = x.dateByAddingTimeInterval(2);
  const z = NSDate.alloc().initWithTimeIntervalSince1970_(4);
  t.true(y.isEqualToDate_(z));

  restore();
});

test('[method swizzling] instance method: original implementation is still available', t => {
  // NSString is a class cluster, which is why we swizzle -[__NSCFString length] instead of `-[NSString length]`
  const restore = objc.swizzle('__NSCFString', 'length', () => {
    return 42;
  });

  const string = objc.ns('hello world');
  t.is(42, string.length());
  t.is(11, string.xxx__length());

  restore();
});

test('[method swizzling] class method: original implementation is still available', t => {
  const {NSProcessInfo, NSDate} = objc;

  const now = NSDate.date();

  const restore = objc.swizzle(NSProcessInfo, 'processInfo', () => {
    return now;
  }, 'class');

  const pi = NSProcessInfo.processInfo();
  t.true(pi.isKindOfClass_(NSDate));
  t.true(pi.isEqualToDate_(now));
  t.true(NSProcessInfo.xxx__processInfo().isKindOfClass_(NSProcessInfo));

  restore();
});

test('[method swizzling] invalid parameters: method type', t => {
  t.throws(() => {
    objc.swizzle('NSString', 'length', () => {}, 'foo');
  })
});


/*
Creating Classes
*/

test('[custom class] instance methods', t => {
  const {NSFileManager} = objc;

  const LKClass = objc.createClass('LKClass1', 'NSObject', {
    'add::': (self, cmd, a, b) => {
      return a + b;
    },

    'getFileManager': (self, cmd) => {
      return NSFileManager.defaultManager();
    },

    'doesntReturnAnything': (self, cmd) => {

    },

    _encodings: {
      //'add::': ['i24', ['@0', ':8', 'i16', 'i20']],
      'add::': ['Q', ['@', ':', 'Q', 'Q']],
      'getFileManager': ['@', ['@', ':']],
      'doesntReturnAnything': ['v', ['@', ':']],
    }
  });

  let obj = LKClass.new();

  t.is(6, obj.add__(1, 5));
  t.true(obj.getFileManager().isEqual_(NSFileManager.defaultManager()));
  t.is(null, obj.doesntReturnAnything());
})

test('[custom class] class methods', t => {
  const LKClass = objc.createClass('LKClass2', 'NSObject', {}, {
    'someClassMethodThatReturnsFourtyTwo': (self, cmd) => {
      return 42;
    },

    _encodings: {
      'someClassMethodThatReturnsFourtyTwo': ['i', ['@', ':']]
    }
  });

    t.is(42, LKClass.someClassMethodThatReturnsFourtyTwo());
})

test('[custom class] no methods', t => {
  t.notThrows(() => {
    const LKClass = objc.createClass('LKClass3', 'NSObject');
  });
})


/*
Structs

skipping the first two since NSRange is already declared in the objc module
TODO: Find some obscure/rarely used struct in Foundation, use that for the test
*/

test.skip('[struct] use not-yet defined struct', t => {
  t.throws(() => {
    objc.ns('Hello World').rangeOfString_('Hello');
  });
});

test.skip('[struct] define struct', t => {
  t.notThrows(() => {
    NSRange = objc.defineStruct('_NSRange', {
      location: objc.refTypes.ulonglong,
      length: objc.refTypes.ulonglong
    });
  });

  t.not(NSRange, null);

  t.throws(() => {
    objc.defineStruct('_NSRange', {});
  });
});

test('[struct] define/use existing struct', t => {
  t.throws(() => {
    objc.defineStruct('_NSRange', {});
  });

  t.throws(() => {
    coerceType('{LKRange=qq}');
  });
})


const {NSRange} = objc.types;

test('[struct] pass struct as parameter', t => {
  const range = NSRange.new();
  range.location = 3;
  range.length = 5;

  t.is('lo Wo', String(objc.ns('Hello World').substringWithRange_(range)));
});

test('[struct] pass field values in initializer', t => {
  const range = NSRange.new(8, 11);
  t.is(8, range.location);
  t.is(11, range.length);

  t.is('pretty cool', String(objc.ns('This is pretty cool').substringWithRange_(range)));
});

test('[struct] call initializer with invalid arguments', t => {
  t.throws(() => {
    NSRange.new(1);
  });
});

test('[struct] struct as return type', t => {
  const string = objc.ns('Hello World');
  const range = string.rangeOfString_('lo Wo');
  t.is(3, range.location);
  t.is(5, range.length);
});

test('[struct] struct defined in objc module works with ffi module', t => {
  const ffi = require('ffi-napi');
  const libFoundation = new ffi.Library(null, {
    NSStringFromRange: ['pointer', [NSRange]]
  });

  const range = new NSRange();
  range.location = 42;
  range.length = 12;

  const string = objc.wrap(libFoundation.NSStringFromRange(range));
  t.is('{42, 12}', String(string));
});



/*
Miscellaneous
*/

test('construct invalid Instance', t => {
  t.throws(() => {
    const obj = new objc.Instance(null);
  });
});

test('get username using NSProcessInfo, convert to javascript string and compare the value to the username given by `os.userInfo()`', t => {
  const NSProcessInfo = objc.NSProcessInfo;
  const os = require('os');

  const processInfo = NSProcessInfo.processInfo();
  const username = processInfo.userName();

  t.is(String(username), os.userInfo().username);
});


/*
Type Encoding Parser
*/
const {
  TypeEncodingParser,
  DataStructurePrimitive,
  DataStructurePointer,
  DataStructureArray,
  DataStructureStruct,
  DataStructureUnion,
  mapping: typeEncodingMappings,
  coerceType
} = require('./src/type-encodings');

const parser = new TypeEncodingParser();

test('[type encoding parser] parse primitives', t => {
  for (const [key, value] of Object.entries(typeEncodingMappings)) {
    let expectedType;
    if (value == 'pointer') {
      expectedType = new DataStructurePointer(new DataStructurePrimitive('void'));
    } else {
      expectedType = new DataStructurePrimitive(value);
    }

    t.deepEqual(expectedType, parser.parse(key));
  }
});

test('[type encoding parser] parse array / struct / union / const attribute', t => {
  const voidPtrType = new DataStructurePointer(new DataStructurePrimitive('void'));

  const testCases = {
    '[12^f]': new DataStructureArray(12, new DataStructurePointer(new DataStructurePrimitive('float'))),
    '[12r^Q]': (() => {
      const elementType = new DataStructurePointer(new DataStructurePrimitive('ulonglong'));
      elementType.isConst = true;
      return new DataStructureArray(12, elementType);
    })(),
    '[12^rS]': (() => {
      const type = new DataStructurePrimitive('ushort');
      type.isConst = true;
      return new DataStructureArray(12, new DataStructurePointer(type));
    })(),
    'i40': new DataStructurePrimitive('int32'),
    '{_NSRange=QQ}': new DataStructureStruct('_NSRange', [
      new DataStructurePrimitive('ulonglong'),
      new DataStructurePrimitive('ulonglong')
    ]),
    '(_ByteAccess=q[8C])': new DataStructureUnion('_ByteAccess', [
      new DataStructurePrimitive('longlong'),
      new DataStructureArray(8, new DataStructurePrimitive('uchar'))
    ]),
    '{_Foo=i^{?}^^@@?^?(?=q*)}': new DataStructureStruct('_Foo', [
      new DataStructurePrimitive('int32'),
      new DataStructurePointer(new DataStructureStruct('?', [])),
      new DataStructurePointer(new DataStructurePointer(voidPtrType)),
      voidPtrType, // `@?`, the block
      new DataStructurePointer(voidPtrType), // `^?`, something like a function pointer
      new DataStructureUnion('?', [
        new DataStructurePrimitive('longlong'),
        new DataStructurePrimitive('string')
      ])
    ])
  };

  for (const [encoding, expectedType] of Object.entries(testCases)) {
    t.deepEqual(expectedType, parser.parse(encoding));
  }

  const invalidTestCases = [
    '[q]',
    '[0q]',
    '{?=C',
    '8i'
  ];
  for (const encoding of invalidTestCases) {
    t.throws(() => {
      parser.parse(encoding);
    });
  }
});

test('[type encoding parser / coerceType] can use strings and type objects interchangeably', t => {
  t.is(coerceType('I'), coerceType(objc.types.uint32));
  t.is(coerceType('r*'), coerceType(objc.types.CString));

  t.throws(() => coerceType(12));
});
