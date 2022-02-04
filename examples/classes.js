#!/usr/bin/env node

const objc = require('../src/index');


const LKGreeter_instanceMethods = {
  'greet:': (self, sel, name) => {
    // all arguments to method are currently passed as pointers (Q. should self & sel be passed at all?)
    // return value (if not void) currently must be an ObjC object or null
    // TO DO: argument and result values should be automatically converted between ObjC and JS
    name = objc.__internal__.wrapInstance(name);
    return objc.ns(`greeter instance says: "hello, ${name}!"`);
  },
  'description:': (self, sel) => {
    console.log('call LKGreeter instance method: description');
    return objc.ns(`<LKGreeter>`);
  },

  _encodings: {
    'greet:': ['@', ['@', ':', '@']],
    'description:': ['@', ['@', ':']],
  }
};

const LKGreeter_classMethods = {
  foo: (self, sel) => {
    console.log('objc.LKGreeter.foo() class method was called');
  },

  _encodings: {
    'foo': ['v', ['@', ':']]
  }
};

// the newly created class will be globally available as `objc.LKGreeter`
objc.createClass('LKGreeter', 'NSObject', LKGreeter_instanceMethods, LKGreeter_classMethods);

console.log('LKGreeter class:', objc.LKGreeter); // LKGreeter class: [objc: LKGreeter]

objc.LKGreeter.foo(); // objc.LKGreeter.foo() class method was called

const greeter = objc.LKGreeter.new();

console.log('LKGreeter instance:', greeter); // LKGreeter instance: [objc: <LKGreeter: 0x600000b8a220>]

console.log(objc.js(greeter.greet_('lukas'))); // greeter instance says: "hello, lukas!"



console.log('LKGreeter instance:', String(greeter)); // LKGreeter instance: true // TO DO: FIX: should call -description

console.log('LKGreeter instance:'+greeter); // LKGreeter instance: 1 // TO DO: FIX: should call -description

console.log(`LKGreeter instance: ${greeter}`); // LKGreeter instance: true // TO DO: FIX: should call -description
