#!/usr/bin/env node 

const ref = require('ref-napi');
const objc = require('objc')


//console.log(ref.coerceType('uint64') === ref.types.uint64)


//console.log(ref.types.pointer)


// TO DO: weird: what is Object here, and why isn't there a ref.types.pointer (or voidptr) already defined for convenience? (ref insists users build all pointer types using refType)

console.log(ref.coerceType('pointer'))

console.log(ref.types.Object)

console.log(ref.refType(ref.types.int32))
