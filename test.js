import test from 'ava';

const objc = require('./src/index');

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
  const util = require('util');
  const NSDate = objc.NSDate;

  const description = util.inspect(NSDate);

  t.is(description, '[objc.InstanceProxy NSDate]');
});

test('description of instance proxy', t => {
  const util = require('util');
  const string = objc.NSString.stringWithString_('the north remembers');

  const description = util.inspect(string);

  t.is(description, '[objc.InstanceProxy the north remembers]');
});

test('description of class method proxy', t => {
  const util = require('util');
  const method = objc.NSDate.date;

  t.is(util.inspect(method), `[objc.MethodProxy '+[NSDate date]']`);
});

test('description of instance method proxy', t => {
  const util = require('util');
  const obj = objc.NSObject.new()

  const method = obj.description;

  t.is(util.inspect(method), `[objc.MethodProxy '-[NSObject description]']`);
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
Constants (not yet supported)
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
Inout parameters (not yet supported)
*/

test.skip('inout parameters 1 (^@)', t => {
  const NSFileManager = objc.NSFileManager;
  const fm = NSFileManager.defaultManager();

  const filepath = '/Library/Caches/randomfilenamethatsurelydoesntexust.hey';
  fm.createFileAtPath_contents_attributes_(filepath, null, null);

  const error1 = objc.ref(null);
  const success1 = fm.removeItemAtPath_error_(filepath, error1);

  t.is(success1, true);
  t.is(typeof objc.deref(error1), 'undefined');

  const error2 = objc.ref(null);
  const success2 = fm.removeItemAtPath_error_(filepath, error2);

  t.is(success2, false);
  t.is(typeof objc.deref(error2), 'object');
});

test.skip('inout parameters 2 (^@)', t => {
  const NSDictionary = objc.NSDictionary;
  const NSAppleScript = objc.NSAppleScript;
  const source = 'telll application "Safari" to get URL of current tab of window 1';

  const script = NSAppleScript.alloc().initWithSource_(source);

  const error = objc.ref(null);
  const success = script.compileAndReturnError_(error);

  t.is(success, false);
  t.is(objc.deref(error).isKindOfClass_(NSDictionary), true);
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
