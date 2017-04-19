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

test('primitive argument types', t => {
  const NSNumber = objc.NSNumber;

  let number = NSNumber.numberWithInt_(5);

  t.is(Number(number), 5);
});
