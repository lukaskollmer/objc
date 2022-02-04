#!/usr/bin/env node

const objc = require('../src/index');

// const { NSMutableDictionary } = objc;


const me_js = {
  name: {
    first: 'Lukas',
    last: 'Kollmer'
  },
  age: 19
};

console.log(me_js); // { name: { first: 'Lukas', last: 'Kollmer' }, age: 19 }

const me_ns = objc.ns(me_js);
console.log(me_ns); // [objc: { age = 19; name = { first = Lukas; last = Kollmer; }; }]

const me_js_2 = objc.js(me_ns);
console.log(me_js_2); // { name: { first: 'Lukas', last: 'Kollmer' }, age: 19 }

console.log(objc.ns('hey').isKindOfClass_(objc.NSString)); // true
