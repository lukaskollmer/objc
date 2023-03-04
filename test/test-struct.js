#!/usr/bin/env node 

const objc = require('objc')

/*
// these are defined in index.js
objc.defineStruct('{CGPoint="x"d"y"d}')

objc.defineStruct('{CGSize="width"d"height"d}')

objc.defineStruct('{CGRect="origin"{CGPoint}"size"{CGSize}}')
*/

console.log('get CGRect struct type: ', objc.CGRect) // TO DO: custom inspect string is not ideal
console.log()

const point = new objc.CGPoint({x: 3, y: 6});

//console.log(point)

console.log(point.x, point.y) // 3, 6


const string = objc.ns('Hello World');
let range = new objc.NSRange({location: 1, length: 4});
//console.log('range: ', range)
console.log(range.location, range.length) // 1, 4

let substring = string.substringWithRange_(range);
console.log(`result: '${objc.js(substring)}'`) // 'ello'


range = new objc.NSRange({length: 4});
substring = string.substringWithRange_(range);
console.log(`result: '${objc.js(substring)}'`) // 'Hell'
