import test from 'ava';

const objc = require('./lib/index.js');

const {
  NSString,
  NSNumber
} = objc;

test('string creation', t => {
  let string = NSString.stringWithString_('Hello World');
  t.is(String(string), 'Hello World');
});

test('primitive return values', t => {
  let string = NSString.stringWithString_('I am the doctor');
  let length = string.length();

  t.is(length, 15);
  t.is(typeof length, 'number');
});

test('primitive argument types', t => {
  let number = NSNumber.numberWithInt_(5);
  t.is(Number(number), 5);
});
