#!/usr/bin/env node

const objc = require('../src/index');



// the newly created class will be globally available as `objc.LKGreeter`
objc.defineClass('LKGreeter', 'NSObject', {
  // ObjC type encodings for the following methods
  $foo: 'v@:',
  greet_: '@@:@',
  description: '@@:',
}, {
  // class methods
  
  $foo: (self) => {
    console.log(`${self}.foo() class method was called`);
  },
  
  // instance methods
  
  greet_: (self, name) => {
    return `greeter instance says: "hello, ${name}!"`;
  },
  
  description: (self) => {
    return `<objc.LKGreeter>`; // ObjC descriptions are typically written as '<...>'
  },
  
});


console.log('LKGreeter class:', objc.LKGreeter); // LKGreeter class: [objc: LKGreeter]


objc.LKGreeter.foo(); // "[ObjCClass: LKGreeter].foo() class method was called"

const greeter = objc.LKGreeter.new(); // instantiate by calling ObjC class method `new`

console.log('LKGreeter instance:', greeter); // LKGreeter instance: [objc: <LKGreeter: 0x600000b8a220>]

console.log(objc.js(greeter.greet_('lukas'))); // greeter instance says: "hello, lukas!"


console.log(objc.js(greeter.description())); // '<objc.LKGreeter>'

console.log(`LKGreeter instance: ${greeter}`); // LKGreeter instance: [<objc.LKGreeter>]
