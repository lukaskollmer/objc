'use strict';

console.log('\n\n======================\n');

const objc = require('./src/index.js');

const {
	NSProcessInfo,
	NSMutableString,
	NSString,
	NSData
} = objc;


let username = NSProcessInfo.processInfo().userName();
let str = NSMutableString.stringWithString_("Your username is: ");
str.appendString_(username);

console.log(str);


console.log('\n======================\n\n');



