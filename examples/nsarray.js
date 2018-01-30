'use strict';

const objc = require('../src/index');

const {
	NSArray,
	NSMutableArray
} = objc;

let array = NSArray.arrayWithArray_(["Hey", "missy", "you", "so", "fine"]);
//console.log("array:", array);

//console.log("count:", array.count());

//console.log("array[1]:", array.objectAtIndex_(1));
//console.log("first object:", array.firstObject());

// Sort
let sortedUsingSelector = array.sortedArrayUsingSelector_("caseInsensitiveCompare:")
console.log("sorted", sortedUsingSelector);

let asJSArray = objc.js(array);
//console.log('js:', asJSArray);

let nsarrayFromJs = objc.ns(['missy', 'you', 'so', 'fine']);
//console.log('ns:', nsarrayFromJs);

// Iterate over an array
for (let str of array) {
	//console.log(String(str));
}


// Add null
//let _array = NSMutableArray.new();
//console.log(_array);
//_array.addObject_(null);



// Sort using block

var block = new objc.Block((arg1, arg2) => {
	arg1 = objc.wrap(arg1);
	arg2 = objc.wrap(arg2);
	return arg1.length() < arg2.length() ? -1 : 1;
}, 'q', ['@', '@']);


let sortedUsingBlock = array.sortedArrayUsingComparator_(block);
console.log(sortedUsingBlock);






//s
