#!/usr/bin/env node

const objc = require('../src/index');


// an NSComparator block takes 3 ObjC objects ('@') as arguments: the block itself plus 2 values to compare), and returns an NSComparisonResult (an Int64-based enum, 'q')

// define the NSComparator type, using its ObjC type encoding string (naming the type is optional, but recommended)
objc.blocks.define('q@@@', 'NSComparator');

// once the type is defined, it can be referred to by its name...
console.log(objc.blocks.NSComparator); // [class NSComparator extends Block]


// ...and new Block objects of that type created for use as arguments to ObjC methods:

const array = objc.ns(['i','can','hold','up','TWO','books']);


const longestToShortest = new objc.blocks.NSComparator(
								  (thing1, thing2) => {
									return thing1.length() < thing2.length() ? -1 : +1;
								  });

console.log(array.sortedArrayUsingComparator_(longestToShortest)); // [objc ( books, hold, TWO, can, up, i )]



const shortestToLongest = new objc.blocks.NSComparator(
								  (thing1, thing2) => {
									return thing1.length() < thing2.length() ? -1 : +1;
								  });

console.log(array.sortedArrayUsingComparator_(shortestToLongest)); // [objc ( i, up, TWO, can, hold, books )]

