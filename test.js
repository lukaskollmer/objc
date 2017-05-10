import test from 'ava';

const objc = require('./src/index.js');

test('string creation', t => {
  const NSString = objc.NSString;
  let string = NSString.stringWithString_('Hello World');
  t.is(String(string), 'Hello World');
});

test('primitive return values', t => {
  const NSString = objc.NSString;
  let string = NSString.stringWithString_('I am the doctor');
  let length = string.length();
  t.is(length, 15);
  t.is(typeof length, 'number');
});

test('load constant w/out bundle', t => {
  objc.import('AppKit');
  let NSFontAttributeName = objc.constant('NSFontAttributeName');

  t.is(NSFontAttributeName, 'NSFont');
});

test('load constant w/ bundle', t => {
  objc.import('AppKit');
  let NSFontAttributeName = objc.constant('NSFontAttributeName', 'AppKit');

  t.is(NSFontAttributeName, 'NSFont');
});

test('load constant w/ full bundle name', t => {
  objc.import('AppKit');
  let NSFontAttributeName = objc.constant('NSFontAttributeName', 'com.apple.AppKit');

  t.is(NSFontAttributeName, 'NSFont');
});

test.skip('get username using NSProcessInfo, convert to javascript string and compare the value to the username given by `os.userInfo()`', t => { // eslint-disable-line ava/no-skip-test
  const NSProcessInfo = objc.NSProcessInfo;
  const os = require('os');

  let processInfo = NSProcessInfo.processInfo();
  let username = processInfo.userName();

  t.is(String(username), os.userInfo().username);
});

// This one fails 100% reprodicible w/ "Misaligned pointer"
test.skip('primitive argument types', t => { // eslint-disable-line ava/no-skip-test
  const NSNumber = objc.NSNumber;

  let number = NSNumber.numberWithInt_(5);

  t.is(Number(number), 5);
});

test('inout parameters (^@)', t => {
  const NSFileManager = objc.NSFileManager;
  let fm = NSFileManager.defaultManager();

  const filepath = '/Library/Caches/randomfilenamethatsurelydoesntexust.hey';
  fm.createFileAtPath_contents_attributes_(filepath, null, null);

  let error1 = objc.ref(null);
  let success1 = fm.removeItemAtPath_error_(filepath, error1);

  t.is(success1, true);
  t.is(typeof objc.deref(error1), 'undefined');

  let error2 = objc.ref(null);
  let success2 = fm.removeItemAtPath_error_(filepath, error2);

  t.is(success2, false);
  t.is(typeof objc.deref(error2), 'object');
});
