'use strict';

const objc = require('../src/index');
const ffi = require('ffi');

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
let _array = NSMutableArray.new();
console.log(_array);
_array.addObject_(null);

// Sort using block

/*
var callback;
callback = ffi.Callback('int', ['pointer', 'pointer'],
  function(obj1, obj2) {
    console.log('callback');
		return 1;
	}
);

callback = (obj1, obj2) => {
	obj1 = new objc.Proxy(obj1);
	obj2 = new objc.Proxy(obj2);

	return obj1.length() < obj2.length() ? -1 : 1;
};

const block = new objc.Block(callback, ['i', ['@', '@']]);

let sortedUsingBlock = array.sortedArrayUsingComparator_(block);

console.log(sortedUsingBlock);
*/
