'use strict';

const objc = require('../src/index.js');

const {
	NSArray
} = objc;

let array = NSArray.arrayWithArray_(["Hey", "how", "are", "you"]);
console.log("array:", array);

console.log("count:", array.count());

console.log("array[1]:", array.objectAtIndex_(1));
//console.log("first object:", array.firstObject());

// Sort
let sortedUsingSelector = array.sortedArrayUsingSelector_("caseInsensitiveCompare:")
console.log("sorted", sortedUsingSelector);

let asJSArray = objc.js(array);
console.log('js:', asJSArray);

let nsarrayFromJs = objc.ns(['missy', 'you', 'so', 'fine']);
console.log('ns:', nsarrayFromJs);