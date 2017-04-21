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

let str2 = objc("Hello moto");
console.log(str2);

objc.import('AppKit');

console.time('noname');
console.log(objc.constant('NSFontAttributeName'));
console.timeEnd('noname');

console.time('name');
console.log(objc.constant('NSFontAttributeName', 'com.apple.AppKit'));
console.timeEnd('name');


console.log('\n======================\n\n');



