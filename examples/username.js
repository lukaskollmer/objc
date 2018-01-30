'use strict';

const objc = require('../src/index');

const {
	NSProcessInfo
} = objc;

let username = NSProcessInfo.processInfo().userName();

console.log(`Your username is: ${username}`);
