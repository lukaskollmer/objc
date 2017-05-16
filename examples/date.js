'use strict';

const objc = require('../src/index.js');

const {
	NSDate
} = objc;

let now = NSDate.date();
console.log(now);

// Convert the NSDate object to a JavaScript date
let asJSDate = objc.js(now);
console.log(asJSDate);
