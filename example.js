'use strict';

console.log('\n\n======================\n');

const objc = require('./lib/index.js');

const {
	NSProcessInfo
} = objc;


console.log(NSProcessInfo.processInfo().environment());

//let processInfo = NSProcessInfo.call("processInfo");
//let userName = processInfo.call("userName");
//console.log('inst:', userName.description());
//console.log(processInfo.call);


console.log('\n======================\n\n');



