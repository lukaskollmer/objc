#!/usr/bin/env node

'use strict';

const objc = require('../src/index');

const {
	NSArray,
	NSMutableArray
} = objc;

let nsarray = NSArray.arrayWithArray_(["Hey", "missy", "you", "so", "fine"]);
console.log("nsarray:", nsarray);

console.log("count:", nsarray.count());

console.log("nsarray[1]:", nsarray.objectAtIndex_(1));
console.log("first object:", nsarray.firstObject());

// sorted alphabetically: [objc ( fine, Hey, missy, so, you )]
console.log("sorted alphabetically:", nsarray.sortedArrayUsingSelector_("caseInsensitiveCompare:"));

console.log('js array:', objc.js(nsarray));

nsarray = objc.ns(['Hey', 'missy', 'you', 'so', 'fine']);
console.log('nsarray:', nsarray);

// Iterate over an array
for (let item of nsarray) {
  console.log(item);
}


// Add null
//let _array = NSMutableArray.new();
//console.log(_array);
//_array.addObject_(null);



// Sort using block
const shortestToLongest = new objc.NSComparator((arg1, arg2) => (arg1.length() < arg2.length()) ? -1 : +1);

// sorted by length: [objc ( so, you, Hey, fine, missy )]
console.log("sorted by length:", nsarray.sortedArrayUsingComparator_(shortestToLongest));

