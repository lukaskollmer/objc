#!/usr/bin/env node 

const objc = require('objc')

/*
objc.structs.define('{CGPoint="x"d"y"d}')

objc.structs.define('{CGSize="width"d"height"d}')

objc.structs.define('{CGRect="origin"{CGPoint}"size"{CGSize}}')
*/

console.log('get CGRect struct type: ', objc.structs.CGRect) // TO DO: custom inspect string is not ideal
console.log()

const point = new objc.structs.CGPoint({x: 3, y: 6});

//console.log(point)

console.log(point.x, point.y) // 3, 6


const string = objc.ns('Hello World');
let range = new objc.structs.NSRange({location: 1, length: 4});
//console.log('range: ', range)
console.log(range.location, range.length) // 1, 4

let substring = string.substringWithRange_(range);
console.log(`result: '${objc.js(substring)}'`) // 'ello'


range = new objc.structs.NSRange({length: 4});
substring = string.substringWithRange_(range);
console.log(`result: '${objc.js(substring)}'`) // 'Hell'
