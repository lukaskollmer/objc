#!/usr/bin/env node 

const objc = require('objc')

console.log(objc)

let v

v = objc.ns(['one', 2, false, {a:4}, new Date()])

console.log(v) // [objc ( one, 2, 0, { a = 4; }, "2022-02-19 16:12:45 +0000" )]

// TO DO: booleans aren't roundtripping
console.log(objc.js(v)) // [ 'one', 2, 0, { a: 4 }, 2022-02-19T16:12:45.164Z ]

